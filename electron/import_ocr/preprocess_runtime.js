// electron/import_ocr/preprocess_runtime.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Execute H01 preprocess operations with deterministic temp artifacts.
// - Enforce preprocess safety caps (input/output bytes, geometry, temp storage).
// - Reuse existing timeout/cancel/process-control behavior from OCR runtime.
// - Return typed preprocess failures and per-operation execution stats.

// =============================================================================
// Imports / constants
// =============================================================================

const fs = require('fs');
const path = require('path');
const {
  H01_OPERATION_ORDER,
  H01_OPERATION_REGISTRY,
  buildPreprocessRunnerJsonOutput,
} = require('./preprocess_pipeline');
const {
  fail,
  clampInt,
  ensurePathExists,
  runProcessWithTimeout,
} = require('./ocr_runtime');

const PREPROCESS_DEFAULT_MAX_LONG_SIDE_PX = 20_000;
const PREPROCESS_DEFAULT_MAX_AREA_PX = 200_000_000;
const PREPROCESS_DEFAULT_MAX_OUTPUT_BYTES = 536_870_912; // 512 MiB
const PREPROCESS_DEFAULT_MAX_INPUT_BYTES = 536_870_912; // 512 MiB
const PREPROCESS_DEFAULT_TEMP_STORAGE_CAP_BYTES = 1_073_741_824; // 1 GiB
const PREPROCESS_DEFAULT_TIMEOUT_SEC = 60;

// =============================================================================
// Helpers (shape checks, policy normalization, failures)
// =============================================================================

function isPlainObject(value) {
  return !!(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  );
}

function failPreprocess(code, message, extra = {}) {
  return fail(code, message, extra);
}

function looksLikeRuntimeMissingFailure(processRes) {
  if (!processRes || typeof processRes !== 'object') return false;
  const code = String(processRes.code || '').trim().toUpperCase();
  if (code !== 'OCR_EXEC_FAILED') return false;
  const errorProbe = String(processRes.error || '').toLowerCase();
  const stderrProbe = String(processRes.stderr || '').toLowerCase();
  if (!errorProbe.trim() && !stderrProbe.trim()) return false;
  return (
    errorProbe.includes('enoent')
    || errorProbe.includes('eacces')
    || errorProbe.includes('spawn')
    || stderrProbe.includes('is not recognized as an internal or external command')
    || stderrProbe.includes('error while loading shared libraries')
    || stderrProbe.includes('the specified module could not be found')
    || stderrProbe.includes('library not loaded')
  );
}

function mapProcessFailureToPreprocessError(processRes, context = {}) {
  const code = String((processRes && processRes.code) || '').trim().toUpperCase();
  const stderr = processRes && processRes.stderr ? String(processRes.stderr) : '';
  const error = processRes && processRes.error ? String(processRes.error) : '';
  if (looksLikeRuntimeMissingFailure(processRes)) {
    return fail('OCR_BINARY_MISSING', 'Preprocess runtime dependency is missing.', Object.assign({}, context, {
      binary: String((context && context.tool) || 'preprocess-runtime').toLowerCase(),
      path: processRes && processRes.path ? String(processRes.path) : '',
      stderr,
      error,
      processCode: code || 'OCR_EXEC_FAILED',
    }));
  }
  if (code === 'OCR_TIMEOUT_PAGE') {
    return failPreprocess('OCR_PREPROCESS_TIMEOUT', 'Preprocessing timed out.', Object.assign({}, context, {
      stderr,
    }));
  }
  if (code === 'OCR_CANCELED') {
    return failPreprocess('OCR_PREPROCESS_CANCELED', 'Preprocessing canceled by user.', Object.assign({}, context, {
      stderr,
    }));
  }
  return failPreprocess('OCR_PREPROCESS_FAILED', 'Preprocessing operation failed.', Object.assign({}, context, {
    stderr,
    processCode: code || 'OCR_EXEC_FAILED',
    error,
  }));
}

function hasRequestedPreprocessOperations(preprocessConfig) {
  if (!isPlainObject(preprocessConfig) || !isPlainObject(preprocessConfig.operations)) return false;
  return H01_OPERATION_ORDER.some((operationKey) => {
    const opCfg = preprocessConfig.operations[operationKey];
    return isPlainObject(opCfg) && opCfg.mode !== 'off';
  });
}

function resolvePreprocessSafetyPolicy(options = {}) {
  const raw = isPlainObject(options) ? options : {};
  return {
    maxLongSidePx: clampInt(raw.preprocessMaxLongSidePx, 1_000, 50_000, PREPROCESS_DEFAULT_MAX_LONG_SIDE_PX),
    maxAreaPx: clampInt(raw.preprocessMaxAreaPx, 1_000_000, 500_000_000, PREPROCESS_DEFAULT_MAX_AREA_PX),
    maxOutputBytes: clampInt(raw.preprocessMaxOutputBytes, 1_048_576, 2_147_483_647, PREPROCESS_DEFAULT_MAX_OUTPUT_BYTES),
    maxInputBytes: clampInt(raw.preprocessMaxInputBytes, 1_048_576, 2_147_483_647, PREPROCESS_DEFAULT_MAX_INPUT_BYTES),
    tempStorageCapBytes: clampInt(raw.preprocessTempStorageCapBytes, 1_048_576, 4_294_967_295, PREPROCESS_DEFAULT_TEMP_STORAGE_CAP_BYTES),
    timeoutPerPageSec: clampInt(raw.preprocessTimeoutPerPageSec, 5, 600, PREPROCESS_DEFAULT_TIMEOUT_SEC),
  };
}

function getFileSizeSafe(targetPath) {
  try {
    const st = fs.statSync(targetPath);
    if (!st || typeof st.size !== 'number' || st.size < 0) return -1;
    return st.size;
  } catch {
    return -1;
  }
}

function ensureFileSizeWithinLimit(targetPath, maxBytes, kindLabel, context = {}) {
  const sizeBytes = getFileSizeSafe(targetPath);
  if (sizeBytes < 0) {
    return failPreprocess('OCR_PREPROCESS_FAILED', `${kindLabel} file is not accessible.`, Object.assign({}, context, {
      path: targetPath,
    }));
  }
  if (sizeBytes > maxBytes) {
    return failPreprocess('OCR_PREPROCESS_FAILED', `${kindLabel} file exceeds preprocess byte-size cap.`, Object.assign({}, context, {
      path: targetPath,
      sizeBytes,
      maxBytes,
    }));
  }
  return {
    ok: true,
    sizeBytes,
  };
}

function ensurePreprocessRuntimeAvailable({ sidecar, needsMagick, needsUnpaper }) {
  if (!isPlainObject(sidecar)) {
    return failPreprocess('OCR_PREPROCESS_UNAVAILABLE', 'OCR sidecar context is missing for preprocessing.');
  }

  const magickPath = typeof sidecar.preprocessImageMagickPath === 'string'
    ? sidecar.preprocessImageMagickPath.trim()
    : '';
  const unpaperPath = typeof sidecar.preprocessUnpaperPath === 'string'
    ? sidecar.preprocessUnpaperPath.trim()
    : '';

  if (needsMagick && (!magickPath || !ensurePathExists(magickPath))) {
    return fail('OCR_BINARY_MISSING', 'Preprocess ImageMagick runtime binary not found.', {
      binary: 'preprocess-imagemagick',
      path: magickPath,
      profileKey: sidecar.profileKey,
    });
  }
  if (needsUnpaper && (!unpaperPath || !ensurePathExists(unpaperPath))) {
    return fail('OCR_BINARY_MISSING', 'Preprocess unpaper runtime binary not found.', {
      binary: 'preprocess-unpaper',
      path: unpaperPath,
      profileKey: sidecar.profileKey,
    });
  }
  return {
    ok: true,
    magickPath,
    unpaperPath,
  };
}

function isCancelRequestedSafe(isCancelRequestedFn) {
  if (typeof isCancelRequestedFn !== 'function') return false;
  try {
    return !!isCancelRequestedFn();
  } catch {
    return false;
  }
}

function parseDimensionsFromIdentify(stdoutText) {
  const raw = String(stdoutText || '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function computeResizeTarget({ width, height, maxLongSidePx, maxAreaPx }) {
  const longSide = Math.max(width, height);
  const area = width * height;
  const longSideScale = longSide > maxLongSidePx ? (maxLongSidePx / longSide) : 1;
  const areaScale = area > maxAreaPx ? Math.sqrt(maxAreaPx / area) : 1;
  const scale = Math.min(1, longSideScale, areaScale);
  if (!(scale > 0) || scale >= 1) {
    return {
      resized: false,
      width,
      height,
      scale: 1,
    };
  }
  const resizedWidth = Math.max(1, Math.floor(width * scale));
  const resizedHeight = Math.max(1, Math.floor(height * scale));
  return {
    resized: true,
    width: resizedWidth,
    height: resizedHeight,
    scale,
  };
}

function buildMagickOperationArgs(operationKey, operationCfg) {
  const mode = operationCfg.mode;
  if (operationKey === 'normalize_contrast') {
    if (mode === 'auto') return ['-contrast-stretch', '0x0'];
    const black = operationCfg.manual.blackClipPct;
    const white = operationCfg.manual.whiteClipPct;
    return ['-contrast-stretch', `${black}%x${white}%`];
  }
  if (operationKey === 'binarize') {
    if (mode === 'auto') return ['-auto-threshold', 'Otsu'];
    return ['-threshold', `${operationCfg.manual.thresholdPct}%`];
  }
  if (operationKey === 'denoise') {
    const passes = mode === 'auto' ? 1 : operationCfg.manual.passes;
    const args = [];
    for (let i = 0; i < passes; i += 1) {
      args.push('-despeckle');
    }
    return args;
  }
  return null;
}

function buildUnpaperOperationArgs(operationKey, operationCfg) {
  if (operationKey === 'deskew') {
    if (operationCfg.mode === 'auto') {
      return ['--deskew-scan-range', '5', '--deskew-scan-step', '0.1'];
    }
    return [
      '--deskew-scan-range',
      String(operationCfg.manual.scanRangeDeg),
      '--deskew-scan-step',
      String(operationCfg.manual.scanStepDeg),
    ];
  }

  if (operationKey === 'page_cleanup') {
    if (operationCfg.mode === 'auto') {
      return ['--layout', 'single', '--clean'];
    }

    const level = operationCfg.manual.cleanLevel;
    if (level === 1) {
      return ['--layout', 'single', '--no-clean'];
    }
    if (level === 2) {
      return ['--layout', 'single', '--clean'];
    }
    return [
      '--layout',
      'single',
      '--clean',
      '--grayfilter-size',
      '5',
      '--noisefilter-intensity',
      '4',
      '--blackfilter-intensity',
      '20',
      '--mask-scan-size',
      '50',
      '--blurfilter-size',
      '5',
    ];
  }

  return null;
}

// =============================================================================
// Runtime execution
// =============================================================================

async function runPreprocessForImage({
  inputPath,
  preprocessConfig,
  sidecar,
  tempDir,
  outputPrefix = 'preprocess',
  safetyPolicy = {},
  onChildProcess,
  isCancelRequested,
} = {}) {
  const normalizedInputPath = typeof inputPath === 'string' ? inputPath.trim() : '';
  if (!normalizedInputPath || !ensurePathExists(normalizedInputPath)) {
    return failPreprocess('OCR_PREPROCESS_FAILED', 'Preprocess input artifact is missing.', {
      path: normalizedInputPath,
    });
  }

  const baseStatsRes = buildPreprocessRunnerJsonOutput({
    preprocessConfig,
    outputPath: normalizedInputPath,
    capEffects: {},
  });
  if (!baseStatsRes.ok) {
    return failPreprocess('OCR_PREPROCESS_FAILED', 'Unable to initialize preprocess stats output.', {
      errors: Array.isArray(baseStatsRes.errors) ? baseStatsRes.errors : [],
    });
  }

  const policy = resolvePreprocessSafetyPolicy(safetyPolicy);
  const timeoutMs = policy.timeoutPerPageSec * 1000;
  const requestedOperations = H01_OPERATION_ORDER.filter((operationKey) => {
    return preprocessConfig.operations[operationKey].mode !== 'off';
  });
  if (requestedOperations.length <= 0) {
    baseStatsRes.stats.capEffects = {
      resized: false,
      inputBytes: getFileSizeSafe(normalizedInputPath),
      outputBytes: getFileSizeSafe(normalizedInputPath),
      totalTempBytes: 0,
      maxInputBytes: policy.maxInputBytes,
      maxOutputBytes: policy.maxOutputBytes,
      tempStorageCapBytes: policy.tempStorageCapBytes,
    };
    return {
      ok: true,
      outputPath: normalizedInputPath,
      stats: baseStatsRes.stats,
    };
  }

  if (!tempDir || !ensurePathExists(tempDir)) {
    return failPreprocess('OCR_PREPROCESS_FAILED', 'Preprocess temp directory is unavailable.', {
      tempDir: String(tempDir || ''),
    });
  }

  const needsMagick = true;
  const needsUnpaper = requestedOperations.some((operationKey) => {
    const tool = H01_OPERATION_REGISTRY[operationKey].tool;
    return tool === 'unpaper';
  });

  const runtimeRes = ensurePreprocessRuntimeAvailable({
    sidecar,
    needsMagick,
    needsUnpaper,
  });
  if (!runtimeRes.ok) return runtimeRes;

  const inputSizeRes = ensureFileSizeWithinLimit(
    normalizedInputPath,
    policy.maxInputBytes,
    'Input preprocess artifact',
    { phase: 'preprocess_input_cap' }
  );
  if (!inputSizeRes.ok) return inputSizeRes;

  if (isCancelRequestedSafe(isCancelRequested)) {
    return failPreprocess('OCR_PREPROCESS_CANCELED', 'Preprocessing canceled by user.');
  }

  let totalTempBytes = 0;
  let currentPath = normalizedInputPath;
  let stepIndex = 0;
  const capEffects = {
    resized: false,
    originalWidth: 0,
    originalHeight: 0,
    finalWidth: 0,
    finalHeight: 0,
    scaleApplied: 1,
    inputBytes: inputSizeRes.sizeBytes,
    outputBytes: inputSizeRes.sizeBytes,
    totalTempBytes: 0,
    maxInputBytes: policy.maxInputBytes,
    maxOutputBytes: policy.maxOutputBytes,
    tempStorageCapBytes: policy.tempStorageCapBytes,
  };

  function nextTempPath(label) {
    stepIndex += 1;
    const safeLabel = String(label || 'step').replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `${outputPrefix}_${String(stepIndex).padStart(3, '0')}_${safeLabel}.png`;
    return path.join(tempDir, fileName);
  }

  function updateTempStorageUsage(targetPath, context = {}) {
    const sizeRes = ensureFileSizeWithinLimit(
      targetPath,
      policy.maxOutputBytes,
      'Output preprocess artifact',
      context
    );
    if (!sizeRes.ok) return sizeRes;
    totalTempBytes += sizeRes.sizeBytes;
    if (totalTempBytes > policy.tempStorageCapBytes) {
      return failPreprocess('OCR_PREPROCESS_FAILED', 'Preprocess temp artifact storage cap exceeded.', Object.assign({}, context, {
        totalTempBytes,
        tempStorageCapBytes: policy.tempStorageCapBytes,
      }));
    }
    capEffects.outputBytes = sizeRes.sizeBytes;
    capEffects.totalTempBytes = totalTempBytes;
    return {
      ok: true,
      sizeBytes: sizeRes.sizeBytes,
    };
  }

  // Identify image dimensions before heavy transforms and apply deterministic cap-downscale.
  const identifyRes = await runProcessWithTimeout({
    executablePath: runtimeRes.magickPath,
    args: ['identify', '-format', '%w %h', currentPath],
    workingDirectory: path.dirname(runtimeRes.magickPath),
    timeoutMs,
    onChildProcess,
    isCancelRequested,
  });
  if (!identifyRes.ok) {
    return mapProcessFailureToPreprocessError(identifyRes, {
      phase: 'preprocess_identify',
    });
  }

  const dims = parseDimensionsFromIdentify(identifyRes.stdout);
  if (!dims) {
    return failPreprocess('OCR_PREPROCESS_FAILED', 'Unable to read image dimensions for preprocess caps.', {
      phase: 'preprocess_identify_parse',
      stdout: identifyRes.stdout || '',
    });
  }
  capEffects.originalWidth = dims.width;
  capEffects.originalHeight = dims.height;
  capEffects.finalWidth = dims.width;
  capEffects.finalHeight = dims.height;

  const resizePlan = computeResizeTarget({
    width: dims.width,
    height: dims.height,
    maxLongSidePx: policy.maxLongSidePx,
    maxAreaPx: policy.maxAreaPx,
  });
  if (resizePlan.resized) {
    if (isCancelRequestedSafe(isCancelRequested)) {
      return failPreprocess('OCR_PREPROCESS_CANCELED', 'Preprocessing canceled by user.');
    }
    const resizedOutputPath = nextTempPath('cap_resize');
    const resizeRes = await runProcessWithTimeout({
      executablePath: runtimeRes.magickPath,
      args: [
        currentPath,
        '-resize',
        `${resizePlan.width}x${resizePlan.height}`,
        resizedOutputPath,
      ],
      workingDirectory: path.dirname(runtimeRes.magickPath),
      timeoutMs,
      onChildProcess,
      isCancelRequested,
    });
    if (!resizeRes.ok) {
      return mapProcessFailureToPreprocessError(resizeRes, {
        phase: 'preprocess_cap_resize',
        width: resizePlan.width,
        height: resizePlan.height,
      });
    }
    const storageRes = updateTempStorageUsage(resizedOutputPath, {
      phase: 'preprocess_cap_resize',
    });
    if (!storageRes.ok) return storageRes;
    currentPath = resizedOutputPath;
    capEffects.resized = true;
    capEffects.finalWidth = resizePlan.width;
    capEffects.finalHeight = resizePlan.height;
    capEffects.scaleApplied = resizePlan.scale;
  }

  // Execute requested operations in fixed scoped-lock order.
  for (let idx = 0; idx < H01_OPERATION_ORDER.length; idx += 1) {
    const operationKey = H01_OPERATION_ORDER[idx];
    const operationCfg = preprocessConfig.operations[operationKey];
    const opStat = baseStatsRes.stats.operations[idx];

    if (!operationCfg || operationCfg.mode === 'off') {
      continue;
    }
    if (isCancelRequestedSafe(isCancelRequested)) {
      return failPreprocess('OCR_PREPROCESS_CANCELED', 'Preprocessing canceled by user.', {
        operation: operationKey,
      });
    }

    const tool = H01_OPERATION_REGISTRY[operationKey].tool;
    const outputPath = nextTempPath(operationKey);
    const startedAt = Date.now();
    let processRes = null;
    if (tool === 'ImageMagick') {
      const opArgs = buildMagickOperationArgs(operationKey, operationCfg);
      if (!Array.isArray(opArgs)) {
        return failPreprocess('OCR_PREPROCESS_UNAVAILABLE', 'Preprocess operation is not available for ImageMagick runtime.', {
          operation: operationKey,
          tool,
        });
      }
      processRes = await runProcessWithTimeout({
        executablePath: runtimeRes.magickPath,
        args: [currentPath, ...opArgs, outputPath],
        workingDirectory: path.dirname(runtimeRes.magickPath),
        timeoutMs,
        onChildProcess,
        isCancelRequested,
      });
    } else if (tool === 'unpaper') {
      const opArgs = buildUnpaperOperationArgs(operationKey, operationCfg);
      if (!Array.isArray(opArgs)) {
        return failPreprocess('OCR_PREPROCESS_UNAVAILABLE', 'Preprocess operation is not available for unpaper runtime.', {
          operation: operationKey,
          tool,
        });
      }
      processRes = await runProcessWithTimeout({
        executablePath: runtimeRes.unpaperPath,
        args: [...opArgs, currentPath, outputPath],
        workingDirectory: path.dirname(runtimeRes.unpaperPath),
        timeoutMs,
        onChildProcess,
        isCancelRequested,
      });
    } else {
      return failPreprocess('OCR_PREPROCESS_UNAVAILABLE', 'Unsupported preprocess operation tool.', {
        operation: operationKey,
        tool,
      });
    }

    if (!processRes.ok) {
      return mapProcessFailureToPreprocessError(processRes, {
        operation: operationKey,
        tool,
      });
    }
    if (!ensurePathExists(outputPath)) {
      return failPreprocess('OCR_PREPROCESS_FAILED', 'Preprocess operation produced no output artifact.', {
        operation: operationKey,
        tool,
        outputPath,
      });
    }
    const storageRes = updateTempStorageUsage(outputPath, {
      operation: operationKey,
      tool,
    });
    if (!storageRes.ok) return storageRes;

    opStat.applied = true;
    opStat.skipped = false;
    opStat.durationMs = Math.max(0, Date.now() - startedAt);
    currentPath = outputPath;
  }

  baseStatsRes.stats.capEffects = capEffects;
  baseStatsRes.outputPath = currentPath;
  return {
    ok: true,
    outputPath: currentPath,
    stats: baseStatsRes.stats,
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  hasRequestedPreprocessOperations,
  resolvePreprocessSafetyPolicy,
  runPreprocessForImage,
};

// =============================================================================
// End of electron/import_ocr/preprocess_runtime.js
// =============================================================================
