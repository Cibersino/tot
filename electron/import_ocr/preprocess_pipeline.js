// electron/import_ocr/preprocess_pipeline.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Define the H01 Batch 1 scoped-lock preprocess operation registry.
// - Provide strict preprocessConfig validation and normalization helpers.
// - Enforce bounded manual schemas and first-cut exclusion constraints.
// - Build canonical adapter input payloads for later runtime integration.
// - Build runner JSON-output foundations with per-operation stats.

// =============================================================================
// Constants / scoped-lock declarations
// =============================================================================

const PREPROCESS_MODES = Object.freeze(['off', 'auto', 'manual']);
const PREPROCESS_CONFIG_ALLOWED_KEYS = Object.freeze(['operations']);
const OPERATION_CONFIG_ALLOWED_KEYS = Object.freeze(['mode', 'manual']);
const ADAPTER_INPUT_ALLOWED_KEYS = Object.freeze([
  'preprocessConfig',
  'inputPath',
  'outputPath',
  'safetyPolicy',
  'timeoutPolicy',
]);
const RUNNER_OUTPUT_INPUT_ALLOWED_KEYS = Object.freeze([
  'preprocessConfig',
  'outputPath',
  'capEffects',
]);

const H01_OPERATION_ORDER = Object.freeze([
  'normalize_contrast',
  'local_illumination_correction',
  'adaptive_contrast',
  'binarize',
  'denoise',
  'text_sharpen',
  'deskew',
  'page_cleanup',
]);

const H01_OPERATION_REGISTRY = Object.freeze({
  normalize_contrast: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      blackClipPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 20,
      }),
      whiteClipPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 20,
      }),
    }),
  }),
  local_illumination_correction: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      windowPx: Object.freeze({
        type: 'integer',
        min: 9,
        max: 101,
      }),
      offsetPct: Object.freeze({
        type: 'number',
        min: 1,
        max: 30,
      }),
    }),
  }),
  adaptive_contrast: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      tilePct: Object.freeze({
        type: 'number',
        min: 5,
        max: 40,
      }),
      clipLimit: Object.freeze({
        type: 'number',
        min: 1,
        max: 8,
      }),
      bins: Object.freeze({
        type: 'integer',
        min: 64,
        max: 256,
      }),
    }),
  }),
  binarize: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      thresholdPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 100,
      }),
    }),
  }),
  denoise: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      passes: Object.freeze({
        type: 'integer',
        min: 1,
        max: 4,
      }),
    }),
  }),
  text_sharpen: Object.freeze({
    tool: 'ImageMagick',
    manualSchema: Object.freeze({
      radiusPx: Object.freeze({
        type: 'number',
        min: 0,
        max: 2,
      }),
      sigmaPx: Object.freeze({
        type: 'number',
        min: 0.3,
        max: 3,
      }),
      amount: Object.freeze({
        type: 'number',
        min: 0.2,
        max: 2,
      }),
      threshold: Object.freeze({
        type: 'number',
        min: 0,
        max: 0.2,
      }),
    }),
  }),
  deskew: Object.freeze({
    tool: 'unpaper',
    manualSchema: Object.freeze({
      scanRangeDeg: Object.freeze({
        type: 'number',
        min: 0.1,
        max: 15,
      }),
      scanStepDeg: Object.freeze({
        type: 'number',
        min: 0.1,
        max: 5,
      }),
    }),
  }),
  page_cleanup: Object.freeze({
    tool: 'unpaper',
    manualSchema: Object.freeze({
      maskScanSize: Object.freeze({
        type: 'integer',
        min: 10,
        max: 80,
      }),
      grayfilterSize: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
      }),
      noisefilterIntensity: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
      }),
      blackfilterIntensity: Object.freeze({
        type: 'integer',
        min: 0,
        max: 32,
      }),
      blurfilterSize: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
      }),
    }),
  }),
});

// =============================================================================
// Helpers (validation, normalization, shaping)
// =============================================================================

function failPreprocessConfig(message, errors = []) {
  return {
    ok: false,
    code: 'OCR_PREPROCESS_FAILED',
    message: message || 'Invalid preprocess configuration.',
    reason: 'PREPROCESS_CONFIG_INVALID',
    errors: Array.isArray(errors) ? errors : [],
  };
}

function failAdapterInput(message, errors = []) {
  return {
    ok: false,
    code: 'OCR_PREPROCESS_FAILED',
    message: message || 'Invalid preprocess adapter input.',
    reason: 'PREPROCESS_ADAPTER_INPUT_INVALID',
    errors: Array.isArray(errors) ? errors : [],
  };
}

function isPlainObject(value) {
  return !!(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
  );
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function listUnknownKeys(sourceObj, allowedKeys) {
  const allowed = new Set(Array.isArray(allowedKeys) ? allowedKeys : []);
  return Object.keys(sourceObj || {}).filter((key) => !allowed.has(key));
}

function normalizeMode(rawMode) {
  return toTrimmedString(rawMode).toLowerCase();
}

function buildDefaultPreprocessConfig() {
  return {
    operations: {
      normalize_contrast: { mode: 'off' },
      local_illumination_correction: { mode: 'off' },
      adaptive_contrast: { mode: 'off' },
      binarize: { mode: 'off' },
      denoise: { mode: 'off' },
      text_sharpen: { mode: 'off' },
      deskew: { mode: 'off' },
      page_cleanup: { mode: 'off' },
    },
  };
}

function validateAndNormalizeManualParams(operationKey, rawManual, errors) {
  const manualErrors = Array.isArray(errors) ? errors : [];
  if (!isPlainObject(rawManual)) {
    manualErrors.push(`${operationKey}.manual must be an object in manual mode.`);
    return null;
  }

  const opSpec = H01_OPERATION_REGISTRY[operationKey];
  const schema = (opSpec && opSpec.manualSchema) || {};
  const expectedKeys = Object.keys(schema);
  const unknownManualKeys = listUnknownKeys(rawManual, expectedKeys);
  if (unknownManualKeys.length > 0) {
    manualErrors.push(
      `${operationKey}.manual contains unknown keys: ${unknownManualKeys.join(', ')}.`
    );
  }

  const normalized = {};
  expectedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(rawManual, key)) {
      manualErrors.push(`${operationKey}.manual.${key} is required in manual mode.`);
      return;
    }

    const rawValue = rawManual[key];
    const rule = schema[key];
    if (!rule || typeof rule !== 'object') {
      manualErrors.push(`${operationKey}.manual.${key} has invalid schema definition.`);
      return;
    }

    if (rule.type === 'integer') {
      if (!Number.isInteger(rawValue)) {
        manualErrors.push(`${operationKey}.manual.${key} must be an integer.`);
        return;
      }
    } else if (rule.type === 'number') {
      if (!Number.isFinite(rawValue)) {
        manualErrors.push(`${operationKey}.manual.${key} must be a finite number.`);
        return;
      }
    } else {
      manualErrors.push(`${operationKey}.manual.${key} has unsupported schema type.`);
      return;
    }

    if (Number.isFinite(rule.min) && rawValue < rule.min) {
      manualErrors.push(`${operationKey}.manual.${key} must be >= ${rule.min}.`);
      return;
    }
    if (Number.isFinite(rule.max) && rawValue > rule.max) {
      manualErrors.push(`${operationKey}.manual.${key} must be <= ${rule.max}.`);
      return;
    }

    normalized[key] = rawValue;
  });

  return normalized;
}

function normalizeOperationConfig(operationKey, rawOperationConfig, errors) {
  const opErrors = Array.isArray(errors) ? errors : [];
  if (!isPlainObject(rawOperationConfig)) {
    opErrors.push(`operations.${operationKey} must be an object.`);
    return null;
  }

  const unknownOperationKeys = listUnknownKeys(rawOperationConfig, OPERATION_CONFIG_ALLOWED_KEYS);
  if (unknownOperationKeys.length > 0) {
    opErrors.push(
      `operations.${operationKey} contains unknown keys: ${unknownOperationKeys.join(', ')}.`
    );
  }

  const mode = normalizeMode(rawOperationConfig.mode);
  if (!PREPROCESS_MODES.includes(mode)) {
    opErrors.push(
      `operations.${operationKey}.mode must be one of: ${PREPROCESS_MODES.join('|')}.`
    );
    return null;
  }

  if (mode !== 'manual') {
    if (Object.prototype.hasOwnProperty.call(rawOperationConfig, 'manual')) {
      opErrors.push(`operations.${operationKey}.manual is only allowed when mode is manual.`);
    }
    return { mode };
  }

  const manual = validateAndNormalizeManualParams(
    operationKey,
    rawOperationConfig.manual,
    opErrors
  );
  if (!manual) return null;
  return { mode, manual };
}

function validateAndNormalizePreprocessConfig(rawConfig) {
  if (rawConfig === undefined || rawConfig === null) {
    return {
      ok: true,
      preprocessConfig: buildDefaultPreprocessConfig(),
    };
  }

  const errors = [];
  if (!isPlainObject(rawConfig)) {
    return failPreprocessConfig('preprocessConfig must be an object.', [
      'preprocessConfig must be an object.',
    ]);
  }

  const unknownConfigKeys = listUnknownKeys(rawConfig, PREPROCESS_CONFIG_ALLOWED_KEYS);
  if (unknownConfigKeys.length > 0) {
    errors.push(`preprocessConfig contains unknown keys: ${unknownConfigKeys.join(', ')}.`);
  }

  if (!Object.prototype.hasOwnProperty.call(rawConfig, 'operations')) {
    errors.push('preprocessConfig.operations is required.');
  }

  const operationsRaw = rawConfig.operations;
  if (!isPlainObject(operationsRaw)) {
    errors.push('preprocessConfig.operations must be an object.');
  }

  if (errors.length > 0) {
    return failPreprocessConfig('Invalid preprocessConfig payload.', errors);
  }

  const unknownOperationKeys = listUnknownKeys(operationsRaw, H01_OPERATION_ORDER);
  if (unknownOperationKeys.length > 0) {
    errors.push(`preprocessConfig.operations contains unknown operations: ${unknownOperationKeys.join(', ')}.`);
  }

  H01_OPERATION_ORDER.forEach((operationKey) => {
    if (!Object.prototype.hasOwnProperty.call(operationsRaw, operationKey)) {
      errors.push(`preprocessConfig.operations.${operationKey} is required.`);
    }
  });

  if (errors.length > 0) {
    return failPreprocessConfig('Invalid preprocessConfig payload.', errors);
  }

  const normalizedOperations = {};
  H01_OPERATION_ORDER.forEach((operationKey) => {
    const normalizedOperation = normalizeOperationConfig(
      operationKey,
      operationsRaw[operationKey],
      errors
    );
    if (normalizedOperation) {
      normalizedOperations[operationKey] = normalizedOperation;
    }
  });

  if (errors.length > 0) {
    return failPreprocessConfig('Invalid preprocessConfig payload.', errors);
  }

  return {
    ok: true,
    preprocessConfig: {
      operations: normalizedOperations,
    },
  };
}

function buildPreprocessAdapterInput(rawInput = {}) {
  if (!isPlainObject(rawInput)) {
    return failAdapterInput('Preprocess adapter input must be an object.', [
      'adapter input must be an object.',
    ]);
  }

  const errors = [];
  const unknownKeys = listUnknownKeys(rawInput, ADAPTER_INPUT_ALLOWED_KEYS);
  if (unknownKeys.length > 0) {
    errors.push(`adapter input contains unknown keys: ${unknownKeys.join(', ')}.`);
  }

  const preprocessRes = validateAndNormalizePreprocessConfig(rawInput.preprocessConfig);
  if (!preprocessRes.ok) {
    errors.push(...(Array.isArray(preprocessRes.errors) ? preprocessRes.errors : []));
  }

  const inputPath = toTrimmedString(rawInput.inputPath);
  const outputPath = toTrimmedString(rawInput.outputPath);
  if (!inputPath) errors.push('adapter inputPath is required.');
  if (!outputPath) errors.push('adapter outputPath is required.');

  const safetyPolicy = rawInput.safetyPolicy === undefined ? {} : rawInput.safetyPolicy;
  const timeoutPolicy = rawInput.timeoutPolicy === undefined ? {} : rawInput.timeoutPolicy;
  if (!isPlainObject(safetyPolicy)) errors.push('adapter safetyPolicy must be an object.');
  if (!isPlainObject(timeoutPolicy)) errors.push('adapter timeoutPolicy must be an object.');

  if (errors.length > 0) {
    return failAdapterInput('Invalid preprocess adapter input.', errors);
  }

  return {
    ok: true,
    adapterInput: {
      preprocessConfig: preprocessRes.preprocessConfig,
      inputPath,
      outputPath,
      safetyPolicy: Object.assign({}, safetyPolicy),
      timeoutPolicy: Object.assign({}, timeoutPolicy),
    },
  };
}

function buildPreprocessRunnerJsonOutput(rawInput = {}) {
  if (!isPlainObject(rawInput)) {
    return failAdapterInput('Runner JSON input must be an object.', [
      'runner JSON input must be an object.',
    ]);
  }

  const errors = [];
  const unknownKeys = listUnknownKeys(rawInput, RUNNER_OUTPUT_INPUT_ALLOWED_KEYS);
  if (unknownKeys.length > 0) {
    errors.push(`runner JSON input contains unknown keys: ${unknownKeys.join(', ')}.`);
  }

  const preprocessRes = validateAndNormalizePreprocessConfig(rawInput.preprocessConfig);
  if (!preprocessRes.ok) {
    errors.push(...(Array.isArray(preprocessRes.errors) ? preprocessRes.errors : []));
  }

  const outputPath = toTrimmedString(rawInput.outputPath);
  if (!outputPath) {
    errors.push('runner JSON outputPath is required.');
  }

  const capEffects = rawInput.capEffects === undefined ? {} : rawInput.capEffects;
  if (!isPlainObject(capEffects)) {
    errors.push('runner JSON capEffects must be an object.');
  }

  if (errors.length > 0) {
    return failAdapterInput('Invalid preprocess runner JSON input.', errors);
  }

  const operationsStats = H01_OPERATION_ORDER.map((operationKey) => {
    const opCfg = preprocessRes.preprocessConfig.operations[operationKey];
    const mode = opCfg.mode;
    const manualParams = mode === 'manual' ? Object.assign({}, opCfg.manual || {}) : {};
    return {
      operation: operationKey,
      tool: H01_OPERATION_REGISTRY[operationKey].tool,
      requestedMode: mode,
      effectiveMode: mode,
      applied: mode !== 'off',
      skipped: mode === 'off',
      params: manualParams,
      durationMs: 0,
    };
  });

  return {
    ok: true,
    outputPath,
    stats: {
      operationOrder: H01_OPERATION_ORDER.slice(),
      operations: operationsStats,
      capEffects: Object.assign({}, capEffects),
    },
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  PREPROCESS_MODES,
  H01_OPERATION_ORDER,
  H01_OPERATION_REGISTRY,
  buildDefaultPreprocessConfig,
  validateAndNormalizePreprocessConfig,
  buildPreprocessAdapterInput,
  buildPreprocessRunnerJsonOutput,
};

// =============================================================================
// End of electron/import_ocr/preprocess_pipeline.js
// =============================================================================
