import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

/**
 * 出码 P2 双渲染 e2e（design D5）：同一份页面 schema 的两条渲染路径摆在一起比。
 *  - 宿主预览：/page/<key>?preview=true —— 现网渲染器吃活库里的最新定义（含 DRAFT）
 *  - 产物预览：/codegen-probe/<key> —— 出码器吃仓库里的语料 fixture，产物直接挂路由
 *
 * 一个 webServer 两条路由，不是 D5 原文写的「两个 webServer」：@lc/runtime 包的导出指回宿主
 * src/views/page/components/*.vue（阶段 3 的口径是「宿主与产物共用同一实现，不复制组件」），
 * 独立起一个产物 shell 服务只会把宿主源码整包拖进去，多一个端口换不到任何隔离。
 *
 * 依赖：后端 8080 + 活库在跑（数据断言读的是同一份库，两边同刻取数才可比）。
 * 端口：不动本机 3000（别的会话在用），e2e 自己起 5300，已起就复用。
 */
const PORT = Number(process.env.E2E_PORT || 5300)
const BASE_URL = `http://127.0.0.1:${PORT}`
// 不用 __dirname：package.json 是 "type": "module"，配置文件按 ESM 加载时没有这个全局；
// playwright test 的 cwd 就是本目录，直接相对 cwd 解析
const AUTH_STATE = path.resolve('e2e/.auth/codegen.json')

export default defineConfig({
  testDir: './e2e/codegen',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // 双渲染的读数必须来自同一时刻的同一份库：并行会互相插队
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'login', testMatch: /auth\.setup\.ts/ },
    {
      name: 'dual-render',
      testMatch: /dual-render\.spec\.ts/,
      dependencies: ['login'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
    },
    {
      // 出码验证台（人工入口的自动化替身）：同一份登录态，走 /codegen-lab/<pageKey>
      name: 'codegen-lab',
      testMatch: /lab\.spec\.ts/,
      dependencies: ['login'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
    },
    {
      // 设计器工具栏的「出码」按钮：画布定义 → dev 中间件落盘 → 产物路由渲染，放在最后跑
      // （它会重写磁盘产物，前面几条用例比的是「磁盘 vs 本次生成」，顺序换了就互相插队）
      name: 'designer-codegen',
      testMatch: /designer\.spec\.ts/,
      dependencies: ['codegen-lab'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
    },
    {
      // 产物级预览（Task 8.1/8.2）：uni 产物落盘 + uni build h5 + 5301 iframe 重挂。
      // 构建是分钟级贵操作，默认不进常规 project；真跑归 10.1 uni-dual-render（plan Task 10.1）
      name: 'uni-preview',
      testMatch: /uni-preview\.spec\.ts/,
      dependencies: ['designer-codegen'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

export { AUTH_STATE, BASE_URL }
