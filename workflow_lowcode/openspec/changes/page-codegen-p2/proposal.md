## Why

出码主线已通过 6 轮 spike 验证内核与真机路径（语料 88/98 节点可出码、C 保真桶 0、产物能在宿主中完成渲染/编辑/写回），但仍停在 spike 形态：`@lc/runtime` 只是宿主 alias 的 re-export shim，产物离开本仓库无法独立编译；fcTable 布局容器没有出码载体；动作链只做配置登记、产物不执行；没有自动化的双渲染 Gate。这四项不解决，出码无法作为产品交付。

## What Changes

- 引入独立 IR 层（schema → IR → template），7C fcTable 作为首个按 IR 实现的新载体：支持 `node.children` 与 `slot:"行:列"` 分组，并从产物单元格几何（colspan/rowspan）回读 slot 坐标。
- 抽出 `@lc/runtime` 独立包（列表 / 容器 / 字段控件 / 取数 / 工具），产物改为真包依赖；删除宿主 alias shim，产物可独立编译。
- 补组件动作触发所需的 emit，并生成动作链与事件脚本 handler（按钮链 / 列链 / 组件链），保证组件内部自派发与产物 handler 不双执行。
- 双渲染 e2e（列表页、表单容器页、dashboard 三类起底）与语料体检 Gate；新增生成报告面（可出码率、A/B/C 桶、unsupported 明细）。仓库无 CI 定义，故 Gate 落地为「一条 `npx playwright test` + 一条 `npx vitest run` 的人工口径」，明确记为未自动化（见 tasks 5.7）。
- 新增出码验证台 `/codegen-lab/:pageKey?`（dev-only）：同一份定义一屏出报告、宿主/产物并排双渲染与产物源码，供人工核对。这条是 2026-10-22 用户追加的需求，据此撤下 design D6 原有的「报告只作返回值、不建 UI」。
- 出码动作做进应用里：页面设计器工具栏「出码」按钮（仅开发构建，吃当前画布定义含未保存改动）与验证台「落盘产物」按钮，产物经一个 dev-only 的 vite 中间件写进 `codegen/probe/`，出完直接开 `/codegen-probe/<pageKey>` 渲染。中间件不进生产构建、只认同源、对请求带来的文件名按白名单拒绝越界写入。
- 保留并沿用 manifest 四张登记表（dropped / warnings / renames / wireOnly）与回读零空洞约束；每次补契约 C 桶必须为 0。
- **非目标**：material 节点（业务页零引用）、移动端 P3、任意 Vue 源码反向导入。

## Capabilities

### New Capabilities
- `page-codegen`: 页面 schema 到可独立编译 Vue 产物的生成、回读保真、独立运行时包与质量 Gate。
- `page-codegen-actions`: 产物内动作链与事件脚本的执行语义（按钮 / 列 / 组件链，防双执行）。

### Modified Capabilities

（无。现有运行时渲染、设计器与后端接口行为不变；组件新增 emit 只增不改。）

## Impact

- 前端 `src/views/page/codegen/`：`generate.ts` / `contract.ts` / `reverse.ts` 重构为 IR 流水线，新增 fcTable 载体、报告与动作 handler 生成；验证台四个新文件（`probe-index.ts` + `CodegenReportPanel.vue` + `CodegenComparePane.vue` + `CodegenLabPage.vue`）、出码落盘客户端 `codegen-run.ts`，以及 `router/index.ts` 的 dev-only 路由注册。
- 前端构建与设计器：新增 dev-only 写盘中间件 `vite.codegen-probe-writer.ts`（挂在 `vite.config.ts`，`configureServer` 只 `vite dev` 执行），`PageDesigner.vue` 加「出码」按钮（动态 `import()` 出码模块 + 函数首行 `import.meta.env.DEV` 早退，让带 `@vue/compiler-sfc` 的出码 chunk 在生产构建里根本不被产出，实测 `dist/assets/` 8.4M → 7.5M）。不新增后端接口。
- 新增 `@lc/runtime` workspace 包及构建配置；调整 vite / vitest / tsconfig 的 alias，使宿主与产物各自可编译。
- 运行时组件：补齐动作链所需 emit（page-table / page-list-cards / page-form / page-data-container 等），保持既有事件语义。
- 测试：新增双渲染 e2e（Playwright 四 project：登录 / 双渲染 / 验证台 / 设计器出码，共 17 条）与人工 Gate；现有 codegen 测试与语料 fixture 作为回归基线（33 文件 267 条）。
- 部署：产物构建不再依赖宿主应用。spike 分支 `spike/page-codegen-6` 保持原样，本变更在 `feat/page-codegen-p2` 上开发。
- 不改后端接口与数据库。
