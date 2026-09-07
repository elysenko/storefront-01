// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat config (ESLint 10). Type-aware linting over `src/` and `test/` only —
 * build output, the Prisma client and the plain-CommonJS seed runner are out
 * of scope.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/seed/**', '*.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS DI relies on decorator metadata and empty constructors/interfaces.
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
