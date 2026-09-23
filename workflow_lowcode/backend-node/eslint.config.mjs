import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * 模块边界强制。
 *
 * spec §3.2 要求依赖方向 api → engine → {system, notification} → framework → common
 * 用工具固化，而不是靠自觉。等到有 300 个文件时再补，违规已经遍地都是。
 *
 * 为什么用 no-restricted-imports 而不是 eslint-plugin-import 的 no-restricted-paths：
 *   no-restricted-paths 基于**解析后的绝对路径**判断，需要 TS resolver 才能把
 *   `../framework/config/env`（无扩展名）解析到 .ts 文件。实测未配 resolver 时该规则
 *   完全不报错 —— 一条永远不报错的边界规则比没有规则更危险。
 *   no-restricted-imports 直接匹配 import 语句里的模块说明符字符串，无需解析，可靠。
 *
 * 各层允许的依赖（自下而上）：
 *   common      → 无（叶子，只有纯类型与纯函数）
 *   framework   → common
 *   system      → framework, common
 *   notification→ framework, common
 *   engine      → system, notification, framework, common
 *   api         → engine, system, notification, framework, common
 */

/** 生成一组禁止导入的路径 glob。 */
function forbid(...segments) {
  return segments.flatMap((s) => [`**/${s}/**`, `../${s}/**`, `../../${s}/**`, `../../../${s}/**`])
}

const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'tools/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ---- common：叶子模块，不得依赖任何兄弟模块 ----
  {
    files: ['src/common/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbid('framework', 'engine', 'api', 'system', 'notification'),
              message: 'common 是叶子模块（纯类型与纯函数），不得依赖任何其它模块',
            },
          ],
        },
      ],
    },
  },

  // ---- framework：只可依赖 common ----
  {
    files: ['src/framework/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbid('engine', 'api', 'system', 'notification'),
              message: 'framework 不得依赖上层模块（engine / api / system / notification）',
            },
          ],
        },
      ],
    },
  },

  // ---- system：只可依赖 framework 与 common ----
  {
    files: ['src/system/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbid('engine', 'api', 'notification'),
              message: 'system 不得依赖 engine / api / notification',
            },
          ],
        },
      ],
    },
  },

  // ---- notification：只可依赖 framework 与 common ----
  {
    files: ['src/notification/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbid('engine', 'api', 'system'),
              message: 'notification 不得依赖 engine / api / system',
            },
          ],
        },
      ],
    },
  },

  // ---- engine：不得依赖 api（api 在最上层） ----
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: forbid('api'), message: 'engine 不得依赖 api 层' }],
        },
      ],
    },
  },

  // ---- tools：必须独立于应用（Node 应用未完成时录制器就要能用） ----
  {
    files: ['tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbid('src'),
              message: 'tools 不得依赖 src（录制器必须独立于应用）',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // ---- 测试：允许 any 与非空断言 ----
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
)

export default config
