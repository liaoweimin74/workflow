## 1. 基线与 IR 层

- [x] 1.1 固化基线：记录 tsc 错误数、全量 vitest 失败清单、语料可出码率（当前 88/98）、A/B/C 桶计数，写成测试常量
- [x] 1.2 新增 `ir.ts`：定义 `IrPage` / `IrNode` / `IrTable` 与节点 `kind` 分类，不 import form-create
- [x] 1.3 实现 `parseIr(schema)`，先把现有已登记类型逐一映射进 IR（列表/容器/字段/展示/dash/数据容器/group 族）
- [x] 1.4 模板生成改为只读 IR（`emitTemplate(IR)`），既有 golden 产物字节不变
- [x] 1.5 manifest 生成改为只读 IR，四张登记表语义不变
- [x] 1.6 增加 IR 目标无关性测试：IR 模块依赖检查 + 模板生成不直接读 schema 节点
- [x] 1.7 **Gate 1**：tsc、全量 vitest、语料体检（C=0、可出码率不低于 88/98）全部通过

## 2. fcTable（7C）

- [x] 2.1 补合成样本：覆盖跨行/跨列合并、不同行列数与空单元格，确认 `layout` 语义
- [x] 2.2 `contract.ts` 登记 `fcTable`：`props.rule` 几何、`children` 与 `slot` 地址、可丢弃/重命名键
- [x] 2.3 `parseIr` 支持 fcTable：`row/col/style/class/layout` 与子节点 slot 进入 IR
- [x] 2.4 生成静态表格模板：按几何计算 rowspan/colspan、列宽、边框样式，子节点放入对应单元格
- [x] 2.5 `reverse.ts` 实现几何回读：从 td 坐标与锚点还原 slot 键与布局
- [x] 2.6 变异用例：改错 slot、改错 colspan、删掉单元格，回读必须分别报差异
- [x] 2.7 dashboard 页整页出码，语料体检更新（验证可出码率提升且 C 桶仍为 0）
- [x] 2.8 真机 A/B：dashboard 产物与现网对比单元格结构、文本、几何
- [x] 2.9 **Gate 2**：fcTable 回读零空洞、dashboard 进语料 Gate、真机 A/B 记录留档

## 3. @lc/runtime 独立包

- [x] 3.1 新建 `frontend/packages/lc-runtime`：package.json、子路径 exports、vite library 构建
- [x] 3.2 把 `src/lc-runtime` 的 16 个 shim 迁成包内真实导出（组件/取数/工具）
- [x] 3.3 `vue` / `element-plus` / `@form-create/*` 设为 external，包不重复打包宿主库
- [x] 3.4 宿主改为 `file:packages/lc-runtime` 依赖，删除 vite / vitest / tsconfig 三处 alias
- [x] 3.5 产物侧声明并解析同一包，删除 alias 后独立执行类型检查与构建（产物位置可解析 16 子路径；vite build 含 probe 产物；vue-tsc 维持 67 条存量）
- [x] 3.6 增加构建冒烟：检查产物 chunk 不含宿主应用代码、element-plus 循环依赖未复现（包 dist 仅 16 个 re-export；宿主 113 chunks / 0 环）
- [x] 3.7 宿主回归：`/codegen-probe` 与现网页面渲染、编辑、写回不受影响（cardlist 编辑 PUT 200；dashboard 正常）
- [x] 3.8 **Gate 3**：删 alias 后产物可独立编译；宿主与产物共用同一实现；构建冒烟通过

## 4. 组件 emit 与动作链

- [x] 4.1 盘点按钮链/列链/组件链载体与所需 emit，形成「触发器 → emit」白名单与缺口表
- [x] 4.2 为 page-table / page-list-cards / page-form / page-data-container 等补齐缺失 emit，保持既有事件语义
- [x] 4.3 扩展 `externalActions` 到列链与组件链载体：产物模式只 emit，关闭内部 `pageActionBus` 派发
- [x] 4.4 IR 表达动作链：trigger、source、params、`$row` 上下文与目标地址
- [x] 4.5 生成三类链 handler：按钮 `@button-click`、列事件、组件事件；参数在生成期解析
- [x] 4.6 事件脚本出成普通函数：上下文白名单（form/row/rowIndex/page/message/http）+ 生成期扫描
- [x] 4.7 脚本中出现白名单外能力时记 unsupported，不生成假 handler
- [x] 4.8 合成样本覆盖：按钮链、列链、组件链各至少 1 条 + 读写字段脚本 1 条
- [x] 4.9 防双执行用例：产物中每次触发副作用计数为 1；宿主不传 externalActions 时行为不回归
- [x] 4.10 manifest `implementedBy` 与产物实际 case 对齐；无承载按钮的触发器保持 `not-wired` + unsupported
- [x] 4.11 **Gate 4**：三类链与脚本在产物中真执行、无双执行、回读零空洞（真机 /codegen-probe 合成链页各点一次：按钮链 message+脚本 2 条提示各 1 次、列链提示 1 次且只发 1 次取数请求、组件链提示 1 次，无重复；内建「编辑」兜底仍开 1 个容器。合成样本回读 holes=[]、unsupported=[]；语料 12 页 94/98 与 A8/B0/C0 未变、golden 产物字节不变；codegen 26 文件 213 条全绿，全量 vitest 2 失败文件/7 条为存量，vue-tsc 67 条存量）

## 5. 双渲染 e2e 与生成报告

- [x] 5.1 定义 `GenerateReport`（可出码率、A/B/C 桶、unsupported、登记表计数）并从 `generatePage` 返回（新增 `codegen/report.ts`：节点采集与分桶口径从体检测试搬进生产模块，`generatePage` 内部跑 `reverseToSchema` 取 holes；`GenerateResult` 多一个 `report` 字段。报告不另立真相——登记表计数直接累加本次 manifest，桶计数与当场回读的 holes 一一对应，`ir-independence.test.ts` 加一条静态断言：report 只依赖 `./contract` `./ir` `./reverse`，回读器不再反指 `./generate`）
- [x] 5.2 语料体检测试消费报告：C>0 或可出码率低于基线即失败（`corpus-audit.test.ts` 删掉自带的采集器/分桶函数，改读 `generatePage().report`；新增「持续 Gate」用例断言 C 桶求和为 0、可出码率 ≥ `BASELINE.corpus.nodeRate`。语料数字未变：98 节点 / 95 有契约 / 94 可出码 = 95.9%，A8/B0/C0，12 页产物字节仍由 golden 守住）
- [x] 5.3 搭 Playwright 脚手架：**一个 webServer 两条路由**（原文的「两个 webServer」做不到也不该做，理由记在 design D5 落地形态）——`playwright.config.ts`（5300 端口、strictPort、workers=1，绝不碰本机 3000；project `login` → `dual-render` 带 storageState）、`e2e/codegen/auth.setup.ts`（经 dev 的 `/api` 代理登录，token 落进 5300 origin）、`CodegenProbeShell.vue` + 路由 `/codegen-probe/:name?`（按归一化页名挂产物，不再取 glob 第一个）、`runtime-probe.test.ts` 改 `PROBE_PAGES=a,b` 多页落盘并断言 `report.buckets.C === 0`；`.gitignore` 补 `e2e/.auth/`、`playwright-report/`，`package.json` 补 `test:e2e`。自检 5 条全绿（宿主/产物 × cardlist_test/dashboard 渲染非空 + 登录），codegen 27 文件 221 条全绿，vue-tsc 仍 67 条存量、codegen 零错误
- [x] 5.4 列表页双渲染用例：行数、关键列文本、编辑按钮打开容器（`dual-render.spec.ts` 两条：逐张卡片的订单编号序列两侧必须相等；点 `.card-action-edit` 后两侧都出容器弹窗且回填同一条记录。先核对过 cardlist_test / dashboard / tmp_dash_todo_verify 三页的**现网 schema 与语料 fixture 逐字节相同**，比出的差异才只可能来自渲染路径）
- [x] 5.5 表单容器页双渲染用例：字段回填、公式计算、LookupPicker 写回（回填比 客户记录ID/联系人/联系电话 三档；公式改 `订单总金额=100`、`折扣率=0.1` 后两侧 `.formula-field__value` 必须同值且按表达式为 90；写回从候选表里**挑一条联系人不同于当前值的行**，断言两侧都落到该行值 + 产物带回 idField。跨侧定位器踩过坑：宿主把标签文字包进 `<span class="fc-form-title">`，`:text-is()` 与 `getByRole(name)` 只命中单侧，最终口径是「`.el-form-item` filter 到 label 全文精确」）
- [x] 5.6 dashboard 双渲染用例：dash 组件数量、筛选广播后的数据变化（dashboard 页比 `.dash-kpi`/`.page-data-chart`/`.dash-todo` 数量且两侧 KPI 都真出数；dashboard 里没有 dash-filter，广播用 tmp_dash_todo_verify —— 把日期区间收到 2000 年后 `.dash-todo-count` 必须下降，且两侧下降前后的值都相等）
- 5.4–5.6 证据：`npx playwright test` 12 passed（41s）。用例有牙已用改坏产物验过两刀：把 `FormulaField` 表达式改成 `+` → 公式用例红；把 `@select="onCustomerSelect"` 摘成空函数 → 写回用例红；随后 `PROBE_PAGES=...` 重新落盘恢复全绿。`runtime-probe.test.ts` 的数据源断言同时改成诚实口径（页面声明几条就必须出几条，dash 页本来不声明页面数据源）
- [x] 5.7 接入 CI；若 CI 暂不具备浏览器条件，把 Gate 明确标为「未自动化」并记录人工步骤（**Gate 未自动化**。核实过：仓库里没有任何 CI 定义（无 `.github/workflows/`、无 `.gitlab-ci.yml`、无 `Jenkinsfile`），本期不为此新建流水线。人工步骤，按序执行：
  1. 起后端 8080 并连活库（活库用例要用），账号 admin/admin123；
  2. 生成物落盘：在 `workflow_lowcode/frontend` 下 `PROBE_PAGES=cardlist_test,dashboard,tmp_dash_todo_verify npx vitest run src/views/page/codegen/__tests__/runtime-probe.test.ts`（`codegen/probe/` 是 gitignored 的生成物目录，必须先落盘，双渲染才不是拿旧产物比对）。等价入口也有两个界面按钮：设计器工具栏「出码」（5.11，出一页并跳产物路由）、验证台「落盘产物」（写当前这一页）；e2e 要三页齐还是得走命令行那条；
  3. `npx playwright test`（自行起/复用 5300 的 dev server，绝不占本机 3000）；
  4. `npx vitest run src/views/page/codegen`（33 文件 267 条，含 `corpus-audit.test.ts` 的 C 桶=0 与可出码率不降两条持续 Gate）+ `npx vue-tsc --noEmit`（67 条存量、codegen 零错误）；
  5. 人工抽查开 `/codegen-lab/<pageKey>`（见 5.10）——**只在 dev 构建下注册**，生产包不带这条路由）
- [x] 5.8 收口：更新基线数字、清理临时探测产物与脚本、确认 spike 分支未被改动（`__tests__/baseline.ts` 改到当前真值：codegen 27 文件/221 条 → 31 文件/249 条；全量 201 → 205 文件（203 通过、2 失败为存量）、2554 条（2547 通过、7 条失败为存量）；表头注释补 `npx playwright test` 3 文件 15 条与 5.7 的人工口径。清理：一次性截图脚本与 `shot-lab-*.png`、`vitest-*.txt`/`tsc-lab*.txt`/`pw-*.txt`/`vitest-full.txt` 全删，手起的 5300 dev server 已停（进程命令行核实过是本 worktree 的 vite，未碰 3000/8080），`vite-5300.log` 已删；`codegen/probe/` 仍由 `.gitignore:30` 挡住在忽略态。分支核实：`spike/page-codegen-6` 尖端仍是 `22b2b2e8`（本次全程未在其上提交），`feat/page-codegen-p2` 尖端仍是立项的 `9195d646`，阶段 2–5 的改动全部为未提交状态。`scripts/check-chunk-cycles.mjs` 是阶段 3 的构建冒烟交付物，不属临时产物，保留）
- [x] 5.9 **Gate 5（交付 Gate）**：三类 e2e 通过、C 桶 0、可出码率不低于基线、产物独立编译（四档实测：① `npx playwright test` 15 passed（54.4s）= 双渲染三类 12 条（列表页卡片序列/编辑回填、表单容器回填+公式+写回、dashboard 组件数量+筛选广播）+ 验证台 3 条；② 语料 12 页 `report.buckets.C` 求和为 0，`corpus-audit.test.ts` 的持续 Gate 绿；③ 可出码 94/98 = 95.9%，等于 `BASELINE.corpus.nodeRate` 不降，A=8/B=0/C=0 未变，12 页产物字节由 golden 守住；④ 产物独立编译在阶段 3.5/3.6 已证并仍在跑——`runtime-package-build.test.ts` 断言包能独立构建、`scripts/check-chunk-cycles.mjs` 断言宿主无循环 import。回归面：codegen 31 文件 249 条全绿，全量 vitest 仅 2 失败文件/7 条（均为存量，见 baseline.ts），vue-tsc 67 条存量、codegen 零错误）

### 5 追加（2026-10-22 用户新需求，先于 5.7/5.8 完成）

- [x] 5.10 出码验证台：把报告做成前端可人工验证的一屏（原话「一直继续直到实现一个可以在前端界面上人工验证的界面完成」；编号按递增排在末尾。撤下 design D6 原定的「报告只作生成返回值、不建 UI」，改向理由与界面自证口径记在 design D6、双渲染落位记在 design D5）
  - 路由 `/codegen-lab/:pageKey?`：`import.meta.env.DEV` 才注册（生产包带不出码器），`meta.fullScreen`，走全局登录。页名**必须**进路由参数——`PageRendererPage` 的组件身份取 `route.params.pageKey`，换页先 `router.replace` 再取数，前进/后退由 `watch(route.params.pageKey)` 接住。
  - 四个新文件：`probe-index.ts`（取数层：语料 `import.meta.glob` eager、产物组件 `./probe/*.vue` 懒加载、产物文本 `?raw`；`mismatchedFiles()` 把浏览器本次生成与磁盘落盘产物逐字节比，glob 键去掉 `./probe/` 前缀后与 `generatePage().files` 键同坐标系）、`CodegenReportPanel.vue`（纯排版不判定：分子分母同显 `94/98`、C 桶 >0 才出告警、丢弃/告警/重命名/仅接线计数、明细收进 `<details>` 且仅在有差异时自动展开——98 行节点表会把双渲染挤出首屏，这是截图暴露的 UX 缺陷）、`CodegenComparePane.vue`（左格直挂 `PageRendererPage`、右格 `<component :is="artifact">`；无产物时给可复制的 `PROBE_PAGES=<key> npx vitest run .../runtime-probe.test.ts` 命令而非空白格；不一致时点名差异文件）、`CodegenLabPage.vue`（编排：来源可选语料/活库 `getPageByKey(key, true)` 即 `preview=true`，重新生成递增 `revision` 令牌强制两侧重挂，产物源码按文件切换显示）。
  - 四个新测试文件先 RED 后绿：`codegen-report-panel.test.ts` 10 条、`codegen-compare-pane.test.ts` 5 条（含 `revision` 重挂断言比的是 DOM 元素身份 `not.toBe`）、`probe-index.test.ts` 5 条、`codegen-lab.test.ts` 8 条。两条设计缺陷是自查出来的并已补牙：`PageRendererPage` 只在 `onMounted` 读一次 `definition`，切来源/重新生成不重挂会「看着旧渲染读新报告」；`ref` 存组件对象触发 Vue 的 "made a reactive object" 警告，改 `shallowRef`（测试侧 `markRaw`）。
  - e2e 第三条 project：`playwright.config.ts` 的 project `testMatch` 会**限制文件收集**，新 spec 不在任何 project 的 testMatch 里就报 "No tests found"（连踩两次）；新增 `codegen-lab` project（依赖 `login`、复用 storageState），`e2e/codegen/lab.spec.ts` 3 条：语料来源一屏出齐（rate 文本、C 告警计数 0、明细默认折叠需点开、两侧 `.card-item` 数相等且 >0、`.codegen-compare__stale` 计数 0、源码含 `<template`）、无落盘产物时出命令不出空白、切活库来源先挂 `waitForResponse(/\/definition\?preview=true/)` 再断 200 且宿主侧 `.page-canvas` 可见。
  - 证据：`npx playwright test` 15 passed（含这 3 条）；codegen 31 文件/249 条全绿；vue-tsc 67 条存量、codegen 零错误。用例有牙用改坏实现验过五刀（`preview=true`→`false`、C 告警 `v-if` 恒假、stale 段 `v-if` 恒假、删 `router.replace`、`:mismatch="[]"`），每刀各红 1 条（第二刀红 2 条），恢复后全绿。真机截图人工看过两张：cardlist_test 与 dashboard 两侧并排同形（KPI/图表/待办一致），且磁盘产物与浏览器本次生成逐字节一致。

- [x] 5.11 出码按钮：在前端应用里控制出码，出完直接在 dev server 里渲染（用户纠正原话「我的界面是指前端应用需要有出码按钮控制出码，出完码直接在开发服务器中渲染查看」——5.10 那版只读语料/活库、落盘仍要人敲命令行，不算「在应用里控制出码」。形态与护栏口径记在 design D6 追加段）
  - `vite.codegen-probe-writer.ts`（**根级新文件**，不进 vue-tsc 程序：tsconfig `include` 只有 `src/**/*`，与 `vite.config.ts` 同状态）：dev-only 写盘中间件，挂在 `/__lc-codegen/probe`，`configureServer` 只在 `vite dev` 跑，生产构建根本带不出去。护栏按「文件名来自浏览器，一律不可信」做：只收 `.vue`/`.ts`、最多一层子目录、段首不得为点、段名不得等于 `probe`、禁反斜杠、正文必须是字符串且 ≤512KB；再叠同源校验（Origin/Referer 的 host 必须等于 `req.headers.host`，否则 403）、写盘前 `path.resolve` 后必须仍在 `codegen/probe/` 下的双保险、GET→405、非 2xx 回 JSON `error`。纯函数 `planProbeWrites()` 单独导出，让这套判定能被单测直接喂畸形请求造。
  - `codegen-run.ts`：浏览器侧只把 `generatePage` 的结果 POST 出去，错误一律归因清楚——非 2xx 拼 HTTP 状态与服务端 `error`；200 但 JSON 解析失败说「这个 dev server 没装出码中间件」（dev 的 SPA fallback 会把未知路径回成 200 + index.html，不写这条就会假装成功）；200 但没有 `written` 清单同样算失败。`exportedAt` 只进 manifest 不进 `files`，所以浏览器生成与磁盘产物仍可逐字节比。
  - 设计器工具栏「出码」（`PageDesigner.vue`，`v-if="isDev"`，排在「预览」前）：吃**当前画布定义**而不是回读接口——`handleSave` 序列化的就是 `{rule: getRule(), option: getOption(), dataSources, actions}`，内存态即保存态，未保存的改动照样出码。落盘成功后 `window.open(probeHref)` 直接开 `/codegen-probe/<pageKey>`。用 `await import('./codegen/codegen-run')` 动态加载**并且函数首行 `if (!import.meta.env.DEV) return`**：只动态 import 挡不住 rollup 把带 `@vue/compiler-sfc` 的出码 chunk 照样产出到 dist（实测 1.06MB 死重，生产里没有一条路径能取它），加构建期早退后 `dist/assets/` 再无 codegen 文件（8.4M → 7.5M，`npx vite build` exit 0）。C 桶 >0 走 `ElMessage.warning` 并指回验证台，不报成功。
  - 验证台加「落盘产物」按钮（`CodegenLabPage.vue`），把 5.10 那条命令行做成界面动作；写完必须重跑 `load()` 重读磁盘 glob，否则警示还挂着。`CodegenComparePane.vue` 的缺产物/不一致两段文案改指向这个按钮（保留 `PROBE_PAGES=…` 命令，e2e 断言它）。
  - 三个新测试文件 + 一处扩展，先 RED 后绿：`probe-writer-plugin.test.ts` 8 条（穿越/绝对/隐藏段/反斜杠/深目录/`.js`/正文非字符串/超 512KB/空 files/畸形请求体，末条跨文件断言 `codegen-run.PROBE_WRITE_URL === plugin.PROBE_WRITE_PATH`）、`codegen-run.test.ts` 8 条（含「POST 正文逐字节等于 `generatePage` 的 files」，用真语料 fixture 跑真生成器）、`codegen-lab.test.ts` +2 条（落盘成功 → mismatch 归零且重读产物；失败 → 显示归因且 mismatch 不动）。
  - e2e 补两条：`e2e/codegen/probe-fs.ts`（磁盘快照/还原——按钮会真写 gitignored 产物，不还原的话「右侧没有落盘产物」那条要看执行顺序的脸色）；`lab.spec.ts` 第 4 条从缺产物点按钮到两侧可比并逐字节比对磁盘正文与界面正文；新 spec `designer.spec.ts` + 新 project `designer-codegen`（`dependencies: ['codegen-lab']` 放最后，因为它重写磁盘产物）：页 id 按 key 从 `/api/v1/pages` 现取（每个库不同，用例不写死；`X-Tenant-Id: default`）、等 `.page-key-input input` 填上才点（早一步 `getRule()` 是空数组，会出一张空页还写上盘）、断 popup URL 含 `/codegen-probe/<key>` 且 `.card-item` 出得来、断至少一个产物文件 mtime 前进（正文可能一模一样，mtime 才证明写过盘）。
  - 证据：`npx playwright test` **17 passed**（1 登录 + 双渲染 11 + 验证台 4 + 设计器出码 1）；codegen **33 文件 / 267 条**全绿；全量 vitest 207 文件（204 通过）/ 2572 条（2565 通过，失败 7 条为存量；那次偶发第 8 条落在 `DataSourceListPage`，单跑 56 条全绿）；vue-tsc 67 条存量、codegen 零新增。真机：设计器点「出码」后落盘的 `CardlistTest.vue` / `api/cardlist-test.ts` md5（`5d8c03c0…` / `6275d2c3…`）与命令行 `PROBE_PAGES=…` 生成的**逐字节一致**；`/codegen-probe/cardlist_test` 渲染出活库数据；中间件护栏在真 vite 上逐条命中（GET→405、`../evil.vue`→非法产物文件名、`x.js`→拒、`a/b/c.vue`→拒、外域 Origin→403）。
  - 落地时踩到的一条 dev server 行为：写进新文件会让 vite 重跑整个模块图（`import.meta.glob` 失效 → 整页重载），所以 e2e 点完按钮要等产物源码面板出正文再读，早一步拿到的是空串（第一版就是这么红的）。

## 6. 撤下 / 延后（不在本期实现）

- material 节点出码（业务页零引用，动态加载语义未定）
- 移动端目标与 P3 后端（依赖本变更的 IR 与运行时包）
- 任意 Vue 源码反向导入（不可判定）
- `@lc/runtime` 发布到 npm registry（部署阶段前置）
