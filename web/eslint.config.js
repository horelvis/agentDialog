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
    // Turned on directory by directory as each surface is translated. A literal
    // left in the JSX is the one failure mode a key-parity test cannot see:
    // the catalogues agree perfectly and the string was never in them.
    files: ['src/**/*.tsx'],
    plugins: { i18next },
    rules: {
      // jsx-text-only: only text nodes. Checking attributes as well drowns the
      // signal in className and viewBox.
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
])
