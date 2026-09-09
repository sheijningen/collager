'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/'] },
  js.configs.recommended,

  // `try { ... } catch {}` is the codebase idiom for best-effort cleanup
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },

  // main process, its libs and all tests: plain CommonJS under Node
  {
    files: ['src/main/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    }
  },

  // core modules are UMD-style: browser globals plus module.exports for Node
  {
    files: ['src/renderer/core/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.commonjs }
    }
  },

  // ui modules are classic scripts sharing one global scope (see index.html);
  // identifiers defined in one file are used in others, which per-file
  // analysis cannot see — so cross-file lookups can't be checked here
  {
    files: ['src/renderer/ui/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser }
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off'
    }
  }
];
