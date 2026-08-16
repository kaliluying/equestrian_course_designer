import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
  },

  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),

  {
    name: 'app/page-component-names',
    files: ['src/views/Home.vue', 'src/views/Feedback.vue'],
    rules: {
      // 路由页面使用约定俗成的单词名，不影响可复用组件命名规范。
      'vue/multi-word-component-names': ['error', { ignores: ['Home', 'Feedback'] }],
    },
  },

  skipFormatting,
]
