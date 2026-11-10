import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'tests/unit/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // src/insignia.tsx is in tsconfig.app.json's program (tsc --listFiles
        // proves it) but the project service does not match it — the repo's
        // only .tsx file sharing a basename with a .ts file (src/insignia.ts).
        // Lint it against the app project explicitly; without defaultProject
        // the fallback project has no jsx setting and flags the JSX returns
        // as "unsafe return of type error" (false positives).
        projectService: {
          allowDefaultProject: ['src/insignia.tsx'],
          defaultProject: 'tsconfig.app.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
