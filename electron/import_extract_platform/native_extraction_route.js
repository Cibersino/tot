'use strict';

const fs = require('fs');
const path = require('path');

const NATIVE_PARSER_BY_EXT = Object.freeze({
  '.txt': 'plain_text',
  '.md': 'markdown_as_text',
  '.html': 'html_text',
  '.htm': 'html_text',
});

function normalizeText(rawText) {
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
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getSourceInfo(filePath) {
  const absPath = path.resolve(String(filePath || ''));
  const fileName = path.basename(absPath);
  const fileExtWithDot = path.extname(absPath).toLowerCase();
  const fileExt = fileExtWithDot.replace('.', '');
  return {
    absPath,
    fileName,
    fileExt,
    fileExtWithDot,
    parserType: NATIVE_PARSER_BY_EXT[fileExtWithDot] || '',
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

async function runNativeExtractionRoute({
  filePath,
  isAborted,
  logger,
} = {}) {
  const source = getSourceInfo(filePath);
  const provenance = {
    sourceFileName: source.fileName,
    sourceFileExt: source.fileExt,
    sourceFileKind: 'text_document',
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

    const raw = fs.readFileSync(source.absPath, 'utf8');
    ensureNotAborted(isAborted);

    let text = '';
    if (source.parserType === 'plain_text' || source.parserType === 'markdown_as_text') {
      text = normalizeText(raw).trim();
    } else if (source.parserType === 'html_text') {
      text = htmlToPlainText(raw);
    } else {
      throw new Error(`Unsupported native parser: ${source.parserType}`);
    }

    return buildResult({
      state: 'success',
      text,
      warnings: text ? [] : ['native_empty_text'],
      summary: text
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

    if (logger && typeof logger.warn === 'function') {
      logger.warn('Native extraction route failed:', {
        sourceFileExt: source.fileExt,
        parserType: source.parserType,
        errorName: String(err && err.name ? err.name : 'Error'),
      });
    }

    return buildResult({
      state: 'failure',
      summary: 'Native extraction route failed during parsing.',
      provenance,
      error: buildError(
        'native_extraction_failed',
        'Native extraction failed due to parser/runtime error.',
        {
          stage: 'parse',
          parserType: source.parserType,
          errorName: String(err && err.name ? err.name : 'Error'),
          errorMessage: String(err && err.message ? err.message : err || ''),
        }
      ),
    });
  }
}

module.exports = {
  runNativeExtractionRoute,
};
