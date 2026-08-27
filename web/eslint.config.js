import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import i18next from 'eslint-plugin-i18next'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Covers all of src/**/*.tsx now that every surface behind login is
    // translated. It was turned on directory by directory while that was in
    // progress; narrowing this glob again is not the normal state. A literal
    // left in the JSX is the one failure mode a key-parity test cannot see:
    // the catalogues agree perfectly and the string was never in them.
    files: ['src/**/*.tsx'],
    plugins: { i18next },
    rules: {
      // jsx-text-only: bare JSX text nodes only — the most common way a
      // hard-coded string slips in, and the one a key-parity test can't see.
      // Not because attribute-checking would "drown in className and
      // viewBox": the plugin already excludes className, style, id, width
      // and height by default (see its jsx-attributes.exclude), so that
      // specific fear doesn't hold. The real cost of widening this mode is
      // that it's a bigger call than this comment should make on its own —
      // it would also flag title/aria-label/placeholder/alt, which are
      // exactly the interface text this mode currently misses, but touching
      // it is a separate decision from this task.
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
])
