import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

// 用 swc 而非 esbuild：NestJS 的依赖注入依赖 emitDecoratorMetadata 产出的
// design:paramtypes 元数据，esbuild 不支持该选项，会让 Test.createTestingModule
// 无法解析构造参数依赖。
//
// 注意：这里必须输出 ESM（module.type = 'es6'）。装饰器元数据的产出与模块格式无关，
// 而 Vitest 5 无法在 CommonJS 下被 require —— 若把输出设成 commonjs，
// 测试文件里的 `import { describe } from 'vitest'` 会被转成 require 并直接失败。
// 对外的 CJS 产物由 `tsc -p tsconfig.build.json` 单独生成，与此无关。
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 30_000,
  },
})
