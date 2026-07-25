import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Deliberately close to the Vite React-TS default. The value here is the
// react-hooks rules — exhaustive-deps in particular, since the data layer's
// refetch-on-`version` pattern is entirely dependency-array-driven and a missed
// dep is a view that silently stops refreshing.
export default tseslint.config(
  { ignores: ['dist', 'src/database.types.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Warn, not error. The data hooks reset to their loading state in an
      // effect keyed on the handle/name they fetch ("reset only on a handle
      // change; version bumps refetch in place so the page never flashes"),
      // which predates this rule and is deliberate. Rewriting those to the
      // render-time adjustment or a remount key is worth doing, but it changes
      // fetch/flash behaviour on every page and belongs in its own pass —
      // not smuggled in under a lint fix.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Node scripts, not browser code.
    files: ['supabase/*.js', 'eslint.config.js', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },
);
