// Root ESLint configuration (flat config). One config for the whole
// monorepo so every package lints identically (CODING_STANDARDS.md:
// strict-type-checked, zero warnings). Typed linting resolves each file's
// nearest tsconfig via the project service.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      '**/.deploy/**',
      '**/.vercel/**',
      'packages/db/migrations/**',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CODING_STANDARDS.md: `any` is banned; swallowed errors are lint failures.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Domain code communicates through typed results, not console noise.
      // Scripts (CLI output) override this locally.
      'no-console': 'error',
      // Predictable async: floating promises are the top silent-failure source.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Allow number/boolean in template literals (log/error messages).
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Scripts talk to humans through stdout by design (scripts/README.md).
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Storybook config files sit outside the project-service graph; they
    // are typechecked by tsc (package tsconfig includes .storybook) but
    // linted without type information.
    files: ['**/.storybook/**/*.{ts,tsx}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
