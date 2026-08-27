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
      // Widening this mode is a separate decision from this task, not
      // something to change here — measuring it found ~105 errors, almost
      // all of them `size="lg"` / `variant="risk"` on this codebase's own
      // components (Button, Badge, ...) rather than noise on host elements:
      // isAllowedDOMAttr in the plugin's own helper allows any attribute on
      // an SVG tag, allows an attribute on a native DOM tag unless it's one
      // of five (placeholder, alt, aria-label, value, title), and never
      // allows one on anything else — so a custom component's props are
      // flagged categorically, not filtered by name.
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
])
