// electron/text_extraction_platform/native_extraction_route.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Native extraction route for text-like local files.
// Responsibilities:
// - Map supported file extensions to the native parser used for that source.
// - Normalize extracted text into a stable apply-ready representation.
// - Convert parser warnings into bounded warning codes for callers.
// - Classify parser failures into the route error contract used by text extraction.
// - Return a structured route result without owning orchestration or IPC.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { getNativeParserForExt } = require('./text_extraction_supported_formats');

// =============================================================================
// Text normalization helpers
// =============================================================================

function normalizeTextPipeline(rawText) {
  const asString = typeof rawText === 'string' ? rawText : String(rawText || '');
  const normalizedNewlines = asString
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const normalizedSpaces = normalizedNewlines
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\t/g, ' ');

  const lines = normalizedSpaces.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  return lines.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeUtf8Text(rawText) {
  const asString = typeof rawText === 'string' ? rawText : String(rawText || '');
  return asString
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function decodeMinimalHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(htmlRaw) {
  const withoutScripts = String(htmlRaw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const stripped = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeMinimalHtmlEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trimEnd();
}

// =============================================================================
// Parser warnings / failure classification helpers
// =============================================================================

function mapMammothWarnings(messages) {
  if (!Array.isArray(messages)) return [];
  const warnings = [];

  messages.forEach((messageObj) => {
    if (!messageObj || typeof messageObj !== 'object') return;
    const type = typeof messageObj.type === 'string' ? messageObj.type.trim() : '';
    const message = typeof messageObj.message === 'string' ? messageObj.message.trim() : '';
    if (!message) return;
    const safeType = type || 'info';
    warnings.push(`docx_${safeType}:${message.slice(0, 160)}`);
  });

  return warnings;
}

function isCorruptOrUnreadableParserError(parserType, err) {
  if (!err) return false;
  const code = typeof err.code === 'string' ? err.code.trim() : '';
  const message = String(err && err.message ? err.message : '').toLowerCase();

  if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES' || code === 'EPERM') {
    return true;
  }

  if (parserType === 'docx_text') {
    if (message.includes('end of central directory')
      || message.includes('invalid signature')
      || message.includes('cant find end of central directory')
      || message.includes('could not find file')
      || message.includes('invalid or unsupported zip')) {
      return true;
    }
  }

  if (parserType === 'pdf_text_layer') {
    if (message.includes('invalid pdf')
      || message.includes('bad xref')
      || message.includes('unexpected response')
      || message.includes('formaterror')
      || message.includes('missing pdf')) {
      return true;
    }
  }

  return false;
}

function isPdfPasswordProtectedParserError(err) {
  if (!err) return false;
  const name = String(err && err.name ? err.name : '').toLowerCase();
  const message = String(err && err.message ? err.message : '').toLowerCase();
  const code = String(err && err.code ? err.code : '').trim();

  return (
    name.includes('passwordexception')
    || (name.includes('password') && name.includes('exception'))
    || message.includes('password')
    || message.includes('encrypted')
    || code === '1'
  );
}

// =============================================================================
// Native parser execution
// =============================================================================

async function runNativeParser(parserType, absPath) {
  if (parserType === 'plain_text') {
    const rawText = fs.readFileSync(absPath, 'utf8');
    return { text: normalizeUtf8Text(rawText), warnings: [] };
  }

  if (parserType === 'markdown_text') {
    const rawText = fs.readFileSync(absPath, 'utf8');
    return { text: normalizeUtf8Text(rawText), warnings: [] };
  }

  if (parserType === 'html_text') {
    const rawHtml = fs.readFileSync(absPath, 'utf8');
    return { text: htmlToPlainText(rawHtml), warnings: [] };
  }

  if (parserType === 'docx_text') {
    const extraction = await mammoth.extractRawText({ path: absPath });
    return {
      text: String(extraction && extraction.value ? extraction.value : ''),
      warnings: mapMammothWarnings(extraction ? extraction.messages : []),
    };
  }

  if (parserType === 'pdf_text_layer') {
    const pdfBuffer = fs.readFileSync(absPath);
    const extraction = await pdfParse(pdfBuffer);
    const warnings = [];
    if (extraction && Number.isFinite(extraction.numpages) && extraction.numpages > 0) {
      warnings.push(`pdf_pages:${extraction.numpages}`);
    }
    return {
      text: String(extraction && extraction.text ? extraction.text : ''),
      warnings,
    };
  }

  const parserError = new Error(`Unsupported native parser: ${parserType}`);
  parserError.code = 'UNSUPPORTED_NATIVE_PARSER';
  throw parserError;
}

// =============================================================================
// Source and result shaping helpers
// =============================================================================

function getSourceInfo(filePath) {
  const absPath = path.resolve(String(filePath || ''));
  const fileName = path.basename(absPath);
  const fileExtWithDot = path.extname(absPath).toLowerCase();
  const fileExt = fileExtWithDot.replace('.', '');
  const sourceFileKind = fileExtWithDot === '.pdf' ? 'pdf' : 'text_document';
  return {
    absPath,
    fileName,
    fileExt,
    fileExtWithDot,
    sourceFileKind,
    parserType: getNativeParserForExt(fileExtWithDot),
  };
}

function buildResult({
  state,
  text = '',
  warnings = [],
  summary = '',
  error = null,
  provenance,
}) {
  return {
    state,
    executedRoute: state === 'precondition_rejected' ? null : 'native',
    text,
    warnings,
    summary,
    provenance,
    error,
  };
}

function buildError(code, message, detailsSafeForLogs = {}) {
  return {
    code,
    message,
    detailsSafeForLogs,
  };
}

function ensureNotAborted(isAborted) {
  if (typeof isAborted === 'function' && isAborted()) {
    const abortError = new Error('Native extraction cancelled by user.');
    abortError.code = 'aborted_by_user';
    throw abortError;
  }
}

function buildFailureResultForError({
  source,
  parserType,
  err,
}) {
  const isPdfPasswordProtected = parserType === 'pdf_text_layer' && isPdfPasswordProtectedParserError(err);
  const corruptOrUnreadable = isCorruptOrUnreadableParserError(parserType, err);
  let errorCode = 'native_extraction_failed';
  let errorMessage = 'Native extraction failed due to parser/runtime error.';
  let summary = 'Native extraction route failed during parsing.';
  let nativeFailureType = 'parser_runtime_error';

  if (isPdfPasswordProtected) {
    errorCode = 'native_encrypted_or_password_protected';
    errorMessage = 'Selected PDF is encrypted or password-protected for native extraction.';
    summary = 'Native extraction route failed: encrypted/password-protected PDF.';
    nativeFailureType = 'pdf_password_protected';
  } else if (corruptOrUnreadable) {
    errorCode = 'unreadable_or_corrupt';
    errorMessage = 'Selected file is unreadable or corrupt for native extraction.';
    summary = 'Native extraction route failed: unreadable or corrupt source.';
    nativeFailureType = 'corrupt_or_unreadable';
  }

  return {
    summary,
    error: buildError(
      errorCode,
      errorMessage,
      {
        stage: 'parse',
        nativeFailureType,
        parserType,
        sourceFileExt: source.fileExt,
        errorName: String(err && err.name ? err.name : 'Error'),
        errorCode: String(err && err.code ? err.code : ''),
        errorMessage: String(err && err.message ? err.message : err || ''),
      }
    ),
  };
}

// =============================================================================
// Route entrypoint
// =============================================================================

async function runNativeExtractionRoute({
  filePath,
  isAborted,
  log,
} = {}) {
  const source = getSourceInfo(filePath);
  const provenance = {
    sourceFileName: source.fileName,
    sourceFileExt: source.fileExt,
    sourceFileKind: source.sourceFileKind,
    ocrProvider: null,
    metadataSafeForLogs: {
      parserType: source.parserType || 'none',
    },
  };

  if (!source.absPath || !fs.existsSync(source.absPath)) {
    return buildResult({
      state: 'failure',
      summary: 'Native route failed before parse: source file is missing.',
      provenance,
      error: buildError(
        'unreadable_or_corrupt',
        'Selected file is missing or unreadable.',
        { stage: 'preflight', reason: 'missing_source_file' }
      ),
    });
  }

  try {
    const stats = fs.statSync(source.absPath);
    if (!stats.isFile()) {
      return buildResult({
        state: 'failure',
        summary: 'Native route failed before parse: selected path is not a file.',
        provenance,
        error: buildError(
          'unreadable_or_corrupt',
          'Selected path is not a readable file.',
          { stage: 'preflight', reason: 'not_a_file', sourceFileExt: source.fileExt }
        ),
      });
    }
  } catch (err) {
    return buildResult({
      state: 'failure',
      summary: 'Native route failed before parse: file metadata check failed.',
      provenance,
      error: buildError(
        'unreadable_or_corrupt',
        'Selected file is missing or unreadable.',
        {
          stage: 'preflight',
          reason: 'stat_failed',
          errorName: String(err && err.name ? err.name : 'Error'),
          errorCode: String(err && err.code ? err.code : ''),
        }
      ),
    });
  }

  if (!source.parserType) {
    return buildResult({
      state: 'failure',
      summary: 'Native route blocked: unsupported format.',
      provenance,
      error: buildError(
        'unsupported_format',
        'Selected file format is not supported by native extraction route.',
        {
          stage: 'preflight',
          reason: 'unsupported_extension',
          sourceFileExt: source.fileExt,
        }
      ),
    });
  }

  try {
    ensureNotAborted(isAborted);
    const parsed = await runNativeParser(source.parserType, source.absPath);
    ensureNotAborted(isAborted);

    const normalizedText = normalizeTextPipeline(parsed.text);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 20) : [];
    if (!normalizedText) warnings.push('native_empty_text');

    return buildResult({
      state: 'success',
      text: normalizedText,
      warnings,
      summary: normalizedText
        ? 'Native extraction route succeeded.'
        : 'Native extraction route succeeded with empty text output.',
      provenance,
      error: null,
    });
  } catch (err) {
    if (String(err && err.code || '') === 'aborted_by_user') {
      return buildResult({
        state: 'cancelled',
        summary: 'Native extraction route cancelled by user.',
        provenance,
        error: buildError(
          'aborted_by_user',
          'Native extraction was cancelled by user.',
          { stage: 'runtime', reason: 'user_abort' }
        ),
      });
    }

    log.warn('Native extraction route failed:', {
      sourceFileExt: source.fileExt,
      parserType: source.parserType,
      errorName: String(err && err.name ? err.name : 'Error'),
      errorCode: String(err && err.code ? err.code : ''),
    });

    const failure = buildFailureResultForError({
      source,
      parserType: source.parserType,
      err,
    });

    return buildResult({
      state: 'failure',
      summary: failure.summary,
      provenance,
      error: failure.error,
    });
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  runNativeExtractionRoute,
};

// =============================================================================
// End of electron/text_extraction_platform/native_extraction_route.js
// =============================================================================


