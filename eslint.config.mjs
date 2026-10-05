import prettier from 'eslint-config-prettier/flat'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['.output/**', 'coverage/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/multi-word-component-names': 'off',
    },
  },
  // Keep this last so formatting rules cannot conflict with Prettier.
  prettier,
)
