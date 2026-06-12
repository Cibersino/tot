// electron/text_extraction_platform/epub_text_extraction.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Local EPUB parser/extractor for native text extraction.
// Responsibilities:
// - Open EPUB archives through the existing direct ZIP runtime dependency.
// - Resolve EPUB reading order through container.xml -> OPF manifest/spine.
// - Enforce EPUB-specific ZIP/XML/content structural bounds.
// - Convert spine-linked XHTML/HTML documents into plain text without loading
//   remote resources or executing embedded scripts.

// =============================================================================
// Imports
// =============================================================================

const path = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');

// =============================================================================
// EPUB structural bounds
// =============================================================================

const MAX_EPUB_ENTRY_NAME_CHARS = 4096;
const MAX_EPUB_CONTAINER_XML_BYTES = 256 * 1024;
const MAX_EPUB_OPF_BYTES = 4 * 1024 * 1024;
const MAX_EPUB_ARCHIVE_ENTRY_COUNT = 20000;
const MAX_EPUB_SPINE_ITEM_COUNT = 5000;
const MAX_EPUB_CONTENT_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_EPUB_TOTAL_CONTENT_BYTES = 128 * 1024 * 1024;

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const IGNORED_TAGS = new Set([
  'head',
  'link',
  'math',
  'meta',
  'noscript',
  'script',
  'svg',
  'style',
  'template',
]);

const HTML_CONTENT_MIME_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
]);

// =============================================================================
// Error helpers
// =============================================================================

function createEpubError(code, message) {
  const err = new Error(message);
  err.name = 'EpubExtractionError';
  err.code = code;
  return err;
}

// =============================================================================
// Path / ZIP helpers
// =============================================================================

function sanitizeArchiveReference(rawPath) {
  const asString = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!asString) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path is missing.');
  }
  if (asString.length > MAX_EPUB_ENTRY_NAME_CHARS) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path exceeds length bound.');
  }

  const withoutFragment = asString.split('#')[0].split('?')[0].trim();
  if (!withoutFragment) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path resolves to empty reference.');
  }

  const withForwardSlashes = withoutFragment.replace(/\\/g, '/');
  if (withForwardSlashes.startsWith('/') || withForwardSlashes.startsWith('//') || /^[A-Za-z]:/.test(withForwardSlashes)) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path must stay relative to the archive.');
  }

  return withForwardSlashes;
}

function normalizeArchivePath(rawPath, { allowParentSegments = false } = {}) {
  const withForwardSlashes = sanitizeArchiveReference(rawPath);
  const segments = withForwardSlashes.split('/');
  if (!allowParentSegments && segments.includes('..')) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path contains traversal-like segments.');
  }

  const normalized = path.posix.normalize(withForwardSlashes);
  if (!normalized || normalized === '.' || normalized === '..') {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path resolves to invalid location.');
  }
  if (normalized.length > MAX_EPUB_ENTRY_NAME_CHARS) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB normalized internal path exceeds length bound.');
  }
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw createEpubError('EPUB_INVALID_INTERNAL_PATH', 'EPUB internal path escapes archive-relative boundaries.');
  }

  return normalized;
}

function resolveArchivePath(baseFilePath, relativePath) {
  const safeBaseFilePath = normalizeArchivePath(baseFilePath, { allowParentSegments: false });
  const withForwardSlashes = sanitizeArchiveReference(relativePath);
  const baseDir = path.posix.dirname(safeBaseFilePath);
  const combined = baseDir && baseDir !== '.'
    ? path.posix.join(baseDir, withForwardSlashes)
    : withForwardSlashes;
  return normalizeArchivePath(combined, { allowParentSegments: false });
}

function getZipEntrySize(entry) {
  if (!entry || !entry.header || !Number.isFinite(entry.header.size)) {
    return 0;
  }
  return Math.max(0, Math.floor(entry.header.size));
}

function buildZipEntryMap(zip) {
  const entries = zip && typeof zip.getEntries === 'function'
    ? zip.getEntries()
    : [];
  if (entries.length > MAX_EPUB_ARCHIVE_ENTRY_COUNT) {
    throw createEpubError('EPUB_ARCHIVE_TOO_MANY_ENTRIES', 'EPUB archive entry count exceeds structural bound.');
  }

  const entriesByPath = new Map();
  entries.forEach((entry) => {
    const safeEntryPath = normalizeArchivePath(entry && entry.entryName ? entry.entryName : '', {
      allowParentSegments: false,
    });
    if (!entriesByPath.has(safeEntryPath)) {
      entriesByPath.set(safeEntryPath, entry);
    }
  });
  return entriesByPath;
}

function getRequiredEntry(entriesByPath, entryPath, missingCode, missingMessage) {
  const safeEntryPath = normalizeArchivePath(entryPath, { allowParentSegments: false });
  const entry = entriesByPath.get(safeEntryPath) || null;
  if (!entry || entry.isDirectory) {
    throw createEpubError(missingCode, missingMessage);
  }
  return entry;
}

function readEntryUtf8(entry, maxBytes, oversizedCode, oversizedMessage) {
  return readEntryBuffer(entry, maxBytes, oversizedCode, oversizedMessage).toString('utf8');
}

function readEntryBuffer(entry, maxBytes, oversizedCode, oversizedMessage) {
  const declaredSize = getZipEntrySize(entry);
  if (declaredSize > maxBytes) {
    throw createEpubError(oversizedCode, oversizedMessage);
  }

  const buffer = entry.getData();
  if (!Buffer.isBuffer(buffer) || buffer.length > maxBytes) {
    throw createEpubError(oversizedCode, oversizedMessage);
  }
  return buffer;
}

function getChildNodeArray(node) {
  if (!node || !node.childNodes || !Number.isInteger(node.childNodes.length) || node.childNodes.length <= 0) {
    return [];
  }
  const children = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    children.push(node.childNodes[index]);
  }
  return children;
}

// =============================================================================
// XML/HTML parsing helpers
// =============================================================================

function parseXmlDocument(xmlSource, mimeType, errorCode, errorMessage) {
  const parseMessages = [];
  const parser = new DOMParser({
    errorHandler: {
      warning(message) {
        parseMessages.push({ level: 'warning', message: String(message || '') });
      },
      error(message) {
        parseMessages.push({ level: 'error', message: String(message || '') });
      },
      fatalError(message) {
        parseMessages.push({ level: 'fatal', message: String(message || '') });
      },
    },
  });
  const doc = parser.parseFromString(String(xmlSource || ''), mimeType);
  if (!doc || !doc.documentElement) {
    throw createEpubError(errorCode, errorMessage);
  }
  if (parseMessages.some((entry) => entry.level === 'error' || entry.level === 'fatal')) {
    throw createEpubError(errorCode, errorMessage);
  }
  return doc;
}

function getLocalName(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.localName === 'string' && node.localName) {
    return node.localName.toLowerCase();
  }
  return typeof node.nodeName === 'string' ? node.nodeName.toLowerCase() : '';
}

function getTrimmedAttribute(node, attributeName) {
  if (!node || typeof node.getAttribute !== 'function') {
    return '';
  }
  return String(node.getAttribute(attributeName) || '').trim();
}

function getElementChildrenByLocalName(parentNode, localName) {
  const matches = [];
  if (!parentNode) {
    return matches;
  }
  const expected = String(localName || '').toLowerCase();
  getChildNodeArray(parentNode).forEach((childNode) => {
    if (childNode && childNode.nodeType === 1 && getLocalName(childNode) === expected) {
      matches.push(childNode);
    }
  });
  return matches;
}

function findFirstDescendantByLocalName(rootNode, localName) {
  if (!rootNode) return null;
  const expected = String(localName || '').toLowerCase();
  const stack = [rootNode];

  while (stack.length > 0) {
    const current = stack.shift();
    if (current && current.nodeType === 1 && getLocalName(current) === expected) {
      return current;
    }
    getChildNodeArray(current).forEach((childNode) => stack.push(childNode));
  }

  return null;
}

// =============================================================================
// EPUB metadata parsing
// =============================================================================

function resolveRootfilePath(containerDoc) {
  const rootfileNodes = containerDoc.getElementsByTagName('rootfile');
  const rootfiles = [];
  if (rootfileNodes && Number.isInteger(rootfileNodes.length)) {
    for (let index = 0; index < rootfileNodes.length; index += 1) {
      rootfiles.push(rootfileNodes[index]);
    }
  }
  if (!rootfiles.length) {
    throw createEpubError('EPUB_INVALID_CONTAINER_XML', 'EPUB container.xml is missing rootfile metadata.');
  }

  const preferredRootfile = rootfiles.find((rootfileNode) => {
    const mediaType = getTrimmedAttribute(rootfileNode, 'media-type').toLowerCase();
    const fullPath = getTrimmedAttribute(rootfileNode, 'full-path');
    return mediaType === 'application/oebps-package+xml' && fullPath;
  }) || rootfiles.find((rootfileNode) => {
    const fullPath = getTrimmedAttribute(rootfileNode, 'full-path');
    return !!fullPath;
  });

  if (!preferredRootfile || typeof preferredRootfile.getAttribute !== 'function') {
    throw createEpubError('EPUB_INVALID_CONTAINER_XML', 'EPUB container.xml does not expose a readable rootfile.');
  }

  return normalizeArchivePath(getTrimmedAttribute(preferredRootfile, 'full-path'), {
    allowParentSegments: false,
  });
}

function shouldTreatManifestItemAsHtml(manifestItem) {
  const mediaType = String(manifestItem.mediaType || '').trim().toLowerCase();
  if (mediaType && HTML_CONTENT_MIME_TYPES.has(mediaType)) {
    return true;
  }

  const extWithDot = path.posix.extname(manifestItem.hrefResolved || '').toLowerCase();
  return extWithDot === '.xhtml' || extWithDot === '.html' || extWithDot === '.htm';
}

function parsePackageDocument(opfDoc, opfPath) {
  const manifestNode = findFirstDescendantByLocalName(opfDoc.documentElement, 'manifest');
  const spineNode = findFirstDescendantByLocalName(opfDoc.documentElement, 'spine');
  if (!manifestNode || !spineNode) {
    throw createEpubError('EPUB_INVALID_PACKAGE_DOCUMENT', 'EPUB package document is missing manifest or spine.');
  }

  const manifestItems = getElementChildrenByLocalName(manifestNode, 'item');
  if (!manifestItems.length) {
    throw createEpubError('EPUB_INVALID_PACKAGE_DOCUMENT', 'EPUB manifest is empty.');
  }

  const manifestById = new Map();
  manifestItems.forEach((manifestItemNode) => {
    const id = getTrimmedAttribute(manifestItemNode, 'id');
    const href = getTrimmedAttribute(manifestItemNode, 'href');
    if (!id || !href) {
      return;
    }
    const hrefResolved = resolveArchivePath(opfPath, href);
    manifestById.set(id, {
      id,
      href,
      hrefResolved,
      mediaType: getTrimmedAttribute(manifestItemNode, 'media-type'),
    });
  });

  const spineItemrefNodes = getElementChildrenByLocalName(spineNode, 'itemref');
  if (!spineItemrefNodes.length) {
    throw createEpubError('EPUB_INVALID_SPINE', 'EPUB spine is empty.');
  }
  if (spineItemrefNodes.length > MAX_EPUB_SPINE_ITEM_COUNT) {
    throw createEpubError('EPUB_SPINE_TOO_MANY_ITEMS', 'EPUB spine item count exceeds structural bound.');
  }

  const spineItems = spineItemrefNodes.map((itemrefNode) => {
    const idref = getTrimmedAttribute(itemrefNode, 'idref');
    if (!idref) {
      throw createEpubError('EPUB_INVALID_SPINE', 'EPUB spine contains itemref without idref.');
    }
    const manifestItem = manifestById.get(idref) || null;
    if (!manifestItem) {
      throw createEpubError('EPUB_INVALID_SPINE', 'EPUB spine references manifest item that does not exist.');
    }
    if (!shouldTreatManifestItemAsHtml(manifestItem)) {
      throw createEpubError('EPUB_UNSUPPORTED_SPINE_DOCUMENT', 'EPUB spine references unsupported non-HTML content.');
    }
    return manifestItem;
  });

  return spineItems;
}

// =============================================================================
// Plain-text shaping
// =============================================================================

function appendNormalizedText(chunks, rawText, preserveWhitespace) {
  const asString = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!asString) return;

  const normalized = preserveWhitespace
    ? asString.replace(/\u00A0/g, ' ')
    : asString.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return;

  chunks.push(normalized);
}

function appendNodeText(node, chunks, preserveWhitespace = false) {
  if (!node) return;

  if (node.nodeType === 3 || node.nodeType === 4) {
    appendNormalizedText(chunks, node.nodeValue, preserveWhitespace);
    return;
  }

  if (node.nodeType !== 1) {
    return;
  }

  const tagName = getLocalName(node);
  if (!tagName || IGNORED_TAGS.has(tagName)) {
    return;
  }

  if (tagName === 'br') {
    chunks.push('\n');
    return;
  }

  const nextPreserveWhitespace = preserveWhitespace || tagName === 'pre';
  const isBlock = BLOCK_TAGS.has(tagName);
  if (isBlock) {
    chunks.push('\n');
  }

  getChildNodeArray(node).forEach((childNode) => appendNodeText(childNode, chunks, nextPreserveWhitespace));

  if (tagName === 'td' || tagName === 'th') {
    chunks.push('\n');
  }

  if (isBlock) {
    chunks.push('\n');
  }
}

function finalizePlainText(rawText) {
  return String(rawText || '')
    .replace(/\uFEFF/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractContentDocumentText(contentSource) {
  const doc = parseXmlDocument(
    contentSource,
    'text/html',
    'EPUB_INVALID_CONTENT_DOCUMENT',
    'EPUB spine content document is malformed or unreadable.'
  );
  const bodyNode = findFirstDescendantByLocalName(doc, 'body');
  const rootNode = bodyNode || doc.documentElement;
  const chunks = [];
  appendNodeText(rootNode, chunks, false);
  return finalizePlainText(chunks.join(''));
}

// =============================================================================
// Public API
// =============================================================================

async function extractEpubText(absPath) {
  let zip = null;
  try {
    zip = new AdmZip(absPath);
  } catch (_err) {
    throw createEpubError('EPUB_ARCHIVE_OPEN_FAILED', 'EPUB archive could not be opened.');
  }

  const entriesByPath = buildZipEntryMap(zip);
  const containerEntry = getRequiredEntry(
    entriesByPath,
    'META-INF/container.xml',
    'EPUB_MISSING_CONTAINER_XML',
    'EPUB container.xml is missing.'
  );
  const containerXml = readEntryUtf8(
    containerEntry,
    MAX_EPUB_CONTAINER_XML_BYTES,
    'EPUB_CONTAINER_XML_TOO_LARGE',
    'EPUB container.xml exceeds structural size bound.'
  );
  const containerDoc = parseXmlDocument(
    containerXml,
    'application/xml',
    'EPUB_INVALID_CONTAINER_XML',
    'EPUB container.xml is malformed or unreadable.'
  );

  const opfPath = resolveRootfilePath(containerDoc);
  const opfEntry = getRequiredEntry(
    entriesByPath,
    opfPath,
    'EPUB_MISSING_PACKAGE_DOCUMENT',
    'EPUB package document is missing.'
  );
  const opfXml = readEntryUtf8(
    opfEntry,
    MAX_EPUB_OPF_BYTES,
    'EPUB_OPF_TOO_LARGE',
    'EPUB package document exceeds structural size bound.'
  );
  const opfDoc = parseXmlDocument(
    opfXml,
    'application/xml',
    'EPUB_INVALID_PACKAGE_DOCUMENT',
    'EPUB package document is malformed or unreadable.'
  );

  const spineItems = parsePackageDocument(opfDoc, opfPath);
  let totalContentBytes = 0;
  const textParts = [];

  spineItems.forEach((spineItem) => {
    const contentEntry = getRequiredEntry(
      entriesByPath,
      spineItem.hrefResolved,
      'EPUB_MISSING_SPINE_DOCUMENT',
      'EPUB spine references content document that is missing.'
    );
    const entrySize = getZipEntrySize(contentEntry);
    if (entrySize > MAX_EPUB_CONTENT_ENTRY_BYTES) {
      throw createEpubError('EPUB_CONTENT_ENTRY_TOO_LARGE', 'EPUB content document exceeds per-entry size bound.');
    }

    const contentBuffer = readEntryBuffer(
      contentEntry,
      MAX_EPUB_CONTENT_ENTRY_BYTES,
      'EPUB_CONTENT_ENTRY_TOO_LARGE',
      'EPUB content document exceeds per-entry size bound.'
    );
    totalContentBytes += contentBuffer.length;
    if (totalContentBytes > MAX_EPUB_TOTAL_CONTENT_BYTES) {
      throw createEpubError('EPUB_TOTAL_CONTENT_TOO_LARGE', 'EPUB total spine content exceeds structural size bound.');
    }

    const contentSource = contentBuffer.toString('utf8');
    const contentText = extractContentDocumentText(contentSource);
    if (contentText) {
      textParts.push(contentText);
    }
  });

  return {
    text: textParts.join('\n\n'),
    warnings: [],
  };
}

module.exports = {
  extractEpubText,
};

// =============================================================================
// End of electron/text_extraction_platform/epub_text_extraction.js
// =============================================================================
