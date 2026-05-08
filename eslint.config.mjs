// eslint.config.mjs
import { globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  globalIgnores([
    'dist/',
    'dist-electron/',
    'release/',
    'node_modules/',
    'coverage/',
    'docs/.vitepress/dist/',
    'docs/.vitepress/.temp/',
    'docs/.vitepress/cache/',
    'public/dictionaries/',
    'public/pdf-worker/',
    'public/pdf-worker/**',
    'scripts/notarize.cjs',
    'assets/',
    'cer/',
    '*.log',
    '*.tmp',
    '*.temp',
    '*.iwt',
    '*.tsbuildinfo',
    '.DS_Store',
    '.claude/',
    '.env',
    '.env.*.local',
    '.env.local',
    '.eslintcache',
  ]),
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  }
)
