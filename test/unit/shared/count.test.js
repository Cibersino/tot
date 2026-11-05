'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('count bootstrap defers graph-derived default locale resolution until Precise counting needs it', () => {
  let countUtilsOptions = null;
  const requestedLanguageIds = [];
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
        };
      },
      AppConstants: {
        DEFAULT_LANG: 'app-default-spanish',
      },
      RendererI18n: {
        getLocaleTag(languageId) {
          requestedLanguageIds.push(languageId);
          return 'es-419';
        },
      },
      CountCore: {
        createCountUtils(options) {
          countUtilsOptions = options;
          return {
            contarTexto() {},
            isPreciseCountFailure() {},
          };
        },
      },
    },
    Intl,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/count.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/count.js' });

  assert.equal(typeof countUtilsOptions.getDefaultLocaleTag, 'function');
  assert.deepEqual(requestedLanguageIds, []);
  assert.equal(countUtilsOptions.getDefaultLocaleTag(), 'es-419');
  assert.deepEqual(requestedLanguageIds, ['app-default-spanish']);
});
