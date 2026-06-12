'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  extractEpubText,
} = require('../../../electron/text_extraction_platform/epub_text_extraction');

const MAX_EPUB_CONTAINER_XML_BYTES = 256 * 1024;
const MAX_EPUB_OPF_BYTES = 4 * 1024 * 1024;
const MAX_EPUB_ARCHIVE_ENTRY_COUNT = 20000;
const MAX_EPUB_CONTENT_ENTRY_BYTES = 16 * 1024 * 1024;

function createEpubArchive(t, {
  opfPath = 'OPS/content.opf',
  opfXml,
  containerXml = null,
  files = {},
} = {}) {
  const dir = createTestTempDir('epub-text-extraction');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const archivePath = path.join(dir, 'fixture.epub');
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));

  if (containerXml !== false) {
    const containerSource = typeof containerXml === 'string'
      ? containerXml
      : [
        '<?xml version="1.0"?>',
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
        '  <rootfiles>',
        `    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>`,
        '  </rootfiles>',
        '</container>',
      ].join('');
    zip.addFile('META-INF/container.xml', Buffer.from(containerSource, 'utf8'));
  }

  if (typeof opfXml === 'string') {
    zip.addFile(opfPath, Buffer.from(opfXml, 'utf8'));
  }

  Object.entries(files).forEach(([entryPath, value]) => {
    zip.addFile(entryPath, Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'));
  });

  zip.writeZip(archivePath);
  return archivePath;
}

function buildOpf({ manifestItems, spineIds, metadataTitle = 'Package Title' }) {
  const manifestXml = manifestItems.map((item) => (
    `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType || 'application/xhtml+xml'}"/>`
  )).join('\n');
  const spineXml = spineIds.map((idref) => `    <itemref idref="${idref}"/>`).join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">',
    '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `    <dc:title>${metadataTitle}</dc:title>`,
    '  </metadata>',
    '  <manifest>',
    manifestXml,
    '  </manifest>',
    '  <spine>',
    spineXml,
    '  </spine>',
    '</package>',
  ].join('\n');
}

test('extractEpubText extracts visible spine text and ignores package metadata and scripts', async (t) => {
  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
      metadataTitle: 'Injected Package Title',
    }),
    files: {
      'OPS/chapter1.xhtml': [
        '<html xmlns="http://www.w3.org/1999/xhtml">',
        '  <head><title>Head Title</title><style>.x { color: red; }</style></head>',
        '  <body>',
        '    <h1>Visible Heading</h1>',
        '    <p>Hello <b>world</b> &amp; friends.</p>',
        '    <script>alert("ignored")</script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    },
  });

  const result = await extractEpubText(archivePath);

  assert.deepEqual(result.warnings, []);
  assert.match(result.text, /Visible Heading/);
  assert.match(result.text, /Hello world & friends\./);
  assert.doesNotMatch(result.text, /Injected Package Title/);
  assert.doesNotMatch(result.text, /Head Title/);
  assert.doesNotMatch(result.text, /ignored/);
});

test('extractEpubText follows spine order instead of filename order', async (t) => {
  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'b', href: 'chapter-b.xhtml' },
        { id: 'a', href: 'chapter-a.xhtml' },
      ],
      spineIds: ['b', 'a'],
    }),
    files: {
      'OPS/chapter-a.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Alpha chapter</p></body></html>',
      'OPS/chapter-b.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Beta chapter</p></body></html>',
    },
  });

  const result = await extractEpubText(archivePath);

  assert.ok(result.text.indexOf('Beta chapter') < result.text.indexOf('Alpha chapter'));
});

test('extractEpubText fails when container.xml is missing', async (t) => {
  const archivePath = createEpubArchive(t, {
    containerXml: false,
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      'OPS/chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_MISSING_CONTAINER_XML'
  );
});

test('extractEpubText fails when a spine target document is missing', async (t) => {
  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'missing.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {},
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_MISSING_SPINE_DOCUMENT'
  );
});

test('extractEpubText allows parent segments in OPF-relative hrefs when the final archive path stays internal', async (t) => {
  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: '../chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      'chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  const result = await extractEpubText(archivePath);

  assert.match(result.text, /Hello/);
});

test('extractEpubText still rejects parent segments when OPF-relative hrefs escape the archive root', async (t) => {
  const archivePath = createEpubArchive(t, {
    opfPath: 'OPS/deep/content.opf',
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: '../../../chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      'chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_INVALID_INTERNAL_PATH'
  );
});

test('extractEpubText rejects archives that exceed the entry-count bound', async (t) => {
  const extraFiles = {};
  for (let index = 0; index < MAX_EPUB_ARCHIVE_ENTRY_COUNT; index += 1) {
    extraFiles[`OPS/extra-${String(index).padStart(5, '0')}.txt`] = '';
  }

  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      ...extraFiles,
      'OPS/chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_ARCHIVE_TOO_MANY_ENTRIES'
  );
});

test('extractEpubText rejects oversized container.xml', async (t) => {
  const oversizedContainer = [
    '<?xml version="1.0"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    '  <!--',
    'x'.repeat(MAX_EPUB_CONTAINER_XML_BYTES + 1),
    '  -->',
    '  <rootfiles>',
    '    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>',
    '  </rootfiles>',
    '</container>',
  ].join('');

  const archivePath = createEpubArchive(t, {
    containerXml: oversizedContainer,
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      'OPS/chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_CONTAINER_XML_TOO_LARGE'
  );
});

test('extractEpubText rejects oversized OPF package documents', async (t) => {
  const oversizedOpf = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package version="3.0" xmlns="http://www.idpf.org/2007/opf">',
    '  <metadata>',
    '    <!--',
    'y'.repeat(MAX_EPUB_OPF_BYTES + 1),
    '    -->',
    '  </metadata>',
    '  <manifest>',
    '    <item id="chapter-1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>',
    '  </manifest>',
    '  <spine>',
    '    <itemref idref="chapter-1"/>',
    '  </spine>',
    '</package>',
  ].join('\n');

  const archivePath = createEpubArchive(t, {
    opfXml: oversizedOpf,
    files: {
      'OPS/chapter1.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_OPF_TOO_LARGE'
  );
});

test('extractEpubText rejects oversized spine content documents', async (t) => {
  const oversizedChapter = [
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>',
    'z'.repeat(MAX_EPUB_CONTENT_ENTRY_BYTES + 1),
    '</p></body></html>',
  ].join('');

  const archivePath = createEpubArchive(t, {
    opfXml: buildOpf({
      manifestItems: [
        { id: 'chapter-1', href: 'chapter1.xhtml' },
      ],
      spineIds: ['chapter-1'],
    }),
    files: {
      'OPS/chapter1.xhtml': oversizedChapter,
    },
  });

  await assert.rejects(
    () => extractEpubText(archivePath),
    (err) => err && err.code === 'EPUB_CONTENT_ENTRY_TOO_LARGE'
  );
});
