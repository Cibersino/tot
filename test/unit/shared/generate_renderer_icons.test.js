'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const {
  buildGeneratedRegistrySource,
  collectCanonicalIcons,
  generateRendererIconsFile,
} = require('../../../tools/generate_renderer_icons');

test('collectCanonicalIcons reads the canonical SVG set in deterministic order', () => {
  const { iconNames, icons } = collectCanonicalIcons();
  assert.deepEqual(iconNames, [
    'abort-extraction',
    'arrow-down-strong',
    'arrow-down',
    'arrow-up-strong',
    'arrow-up',
    'clipboard-append',
    'clipboard-overwrite',
    'close',
    'collapse',
    'expand',
    'floating-stopwatch',
    'folder',
    'open-target',
    'pause',
    'play',
    'preset-edit',
    'preset-new',
    'reading-speed-test',
    'reset',
    'stop',
    'task-comment',
    'task-load',
    'task-new',
    'task-row-load',
    'task-row-save',
    'task-text-snapshot-load',
    'text-editor',
    'text-extraction-wide',
    'text-snapshot-load',
    'text-snapshot-save',
    'trash',
    'unlink',
  ]);
  assert.equal(typeof icons.close, 'string');
  assert.match(icons.close, /<svg/);
  assert.equal(typeof icons['task-comment'], 'string');
  assert.match(icons['task-comment'], /mask=/);
});

test('buildGeneratedRegistrySource creates an executable browser registry source', () => {
  const { iconNames, icons } = collectCanonicalIcons();
  const source = buildGeneratedRegistrySource({
    sourceDir: 'assets/icons',
    iconNames,
    icons,
  });
  const context = { window: {} };
  vm.runInNewContext(source, context);

  assert.deepEqual(Array.from(context.window.GeneratedRendererIcons.iconNames), iconNames);
  assert.equal(context.window.GeneratedRendererIcons.sourceDir, 'assets/icons');
  assert.equal(context.window.GeneratedRendererIcons.icons['text-extraction-wide'], icons['text-extraction-wide']);
});

test('generateRendererIconsFile writes the generated registry to disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-generate-icons-'));
  const outputFile = path.join(tempDir, 'generated_icons.js');

  try {
    const result = generateRendererIconsFile({ outputFile });
    const writtenSource = fs.readFileSync(outputFile, 'utf8');

    assert.equal(path.resolve(result.outputFile), path.resolve(outputFile));
    assert.equal(writtenSource, result.fileSource);
    assert.match(writtenSource, /window\.GeneratedRendererIcons/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
