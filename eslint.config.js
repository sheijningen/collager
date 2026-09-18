'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/'] },
  js.configs.recommended,

  // `try { ... } catch {}` is the codebase idiom for best-effort cleanup; the
  // rest are conventions the code already follows, kept from drifting
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow': 'error',
      'no-param-reassign': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-else-return': 'error',
      'object-shorthand': 'error',
      'no-lonely-if': 'error',
      'consistent-return': 'error'
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
