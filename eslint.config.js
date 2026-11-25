import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/ui/**', '**/storage/**', '**/worker/**', 'vue'],
          message: 'src/core must stay pure: no imports from ui, storage, worker or vue.',
        }],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'fetch'],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'core must be deterministic; pass a seeded PRNG.' },
        { object: 'Date', property: 'now', message: 'core must be deterministic.' },
      ],
    },
  },
)
