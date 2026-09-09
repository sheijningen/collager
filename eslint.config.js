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

  // the renderer is ES modules with explicit imports, so every identifier is
  // checkable per file
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser }
    }
  }
];
