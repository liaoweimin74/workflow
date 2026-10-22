## Context

出码模块在阶段 1 拆分前的规模：`generate.ts` 1854 行、`contract.ts` 778 行、`reverse.ts` 468 行，22 个测试文件与 13 页语料 fixture。能力面已覆盖列表/卡片/容器/字段控件/公式/选择器/dash 族/数据容器，语料可出码 88/98 节点（56.1% 是 7D 修仪器后的旧数，7E/7F/8/9/10 与嵌套容器递归后实测 88/98），C 保真桶 0。阶段 1 已把生成器拆成 `ir.ts` / `parse.ts` / `emit.ts`，并以 golden 快照守住产物字节不变。

但代码仍是 spike 形态：

- 生成器内部用 `plans` / `flattenPlans` 直接产模板，没有独立 IR；节点形状与 form-create 规则耦合。
- `src/lc-runtime/` 是 16 个一行的 re-export shim，靠宿主 vite / vitest / tsconfig alias 解析，产物离开宿主无法独立编译。
- 动作链（按钮/列/组件）只做 manifest 登记与内建按钮兜底，配了链的按钮在产物中不执行；事件脚本不出码。组件内部仍保留自派发路径，直接补 handler 会双执行。
- `fcTable` 未登记：语料中它 2 行 3 列，`props.rule` 含 `row/col/style/class/layout[{top,left,row,col}]`，子节点在 `children` 且带 `slot:"0:0"` 形式地址。
- 双渲染验证靠临时探测路由（`/codegen-probe`）与人工浏览器操作，没有自动化 Gate。

约束：spike 分支 `spike/page-codegen-6` 保持原样；本变更在 `feat/page-codegen-p2` 开发；回读零空洞与 C 桶 0 是持续 Gate；真机 A/B 优先于像素一致。

## Goals / Non-Goals

**Goals:**

- 建立独立 IR，使模板生成只读 IR，并为移动端保留第二目标消费可能。
- fcTable 整页出码与几何回读（slot 分组、合并单元格）。
- `@lc/runtime` 成为可独立消费的包，产物不再依赖宿主 alias。
- 动作链与事件脚本在产物中真执行，且与组件内部派发互斥。
- 双渲染 e2e 与语料体检自动化，作为 CI Gate 和生成报告。

**Non-Goals:**

- 不支持 material 节点、移动端目标、任意 Vue 源码反向导入。
- 不承诺动作链覆盖现网样本（现网零样本，验收用合成样本），也不做动作链可视化编排。
- 不在本期发布 `@lc/runtime` 到 npm registry；先以仓库内包消费。
- 不重写 page-* 组件的业务逻辑，只补事件出口。

## Decisions

### D1：显式 IR 节点树，替代 plans 直出模板

新增 `IrPage { nodes, dataSources, actions, formOption }` 与 `IrNode { id, rulePath, type, kind, field, props, children, slot?, cells?, bindings, anchor }`。`kind` 区分 list/container/field/display/layout。生成流程固定为 `parse(schema) → IR → emitTemplate(IR) → emitManifest(IR)`，渲染函数不得直接读取 schema 节点。

- 备选：继续用 `plans` 作为隐式 IR —— 否决：`planNode` 同时承担判定、登记与模板片段生成，fcTable 的 slot/几何无法在不拆层的情况下表达。
- 备选：以 Babel AST 作为中间层 —— 否决：生成目标是文本模板而非表达式，AST 只会增加双向转换成本。
- 过渡策略：先让现有输出经 IR 重放且**产物字节不变**（golden 测试为 Gate），再逐步把判定逻辑搬进 IR。

### D2：fcTable 出成静态表格，而非复用 form-create 组件

产物用 `<table class="lc-fc-table">` + `<tr>/<td>` 还原 `props.rule`：按 `row/col` 与 `layout[{top,left,row,col}]` 计算 colspan/rowspan，`style["r:c"].width` 落列宽，子节点按 `slot` 放入对应 td。回读时扫描 td 的几何坐标（行列跨度 + 文本/锚点）还原 slot 键。

- 备选：产物直接使用 `@lc/runtime/fc-table` 包一层 form-create FcTable —— 否决：产物重新引入 form-create 运行时，与「真实模板、可转换移动端」的 B 档目标冲突。
- 备选：CSS grid 布局 —— 否决：合并单元格语义会丢失，回读无法稳定还原 slot。
- 语料只有 1 条 `layout` 合并项；首版按通用几何算法实现，但 A/B 只对语料与合成样本负责，未覆盖的布局形态进 unsupported。

### D3：`@lc/runtime` 用仓库内包 + file 依赖

包落在 `frontend/packages/lc-runtime`，子路径 exports 对应 `@lc/runtime/page-table`、`/page-data-container`、`/dash-*`、`/http`、`/lookupFetch` 等。宿主 `frontend/package.json` 以 `file:packages/lc-runtime` 依赖它；产物工程同样声明该依赖。删除 `src/lc-runtime` 与三处 alias 后，宿主和产物都必须能解析。

- 备选：`pnpm workspace` + `workspace:*` —— 当前 frontend 无 workspace 配置且同时存在两套 lockfile，引入 workspace 会波及安装链路；file 依赖已能满足「同一实现、两处消费」的目标，工具链迁移成本最低。
- 备选：直接发布 npm 包 —— 否决：发布凭据与版本流程不在本期，且会锁死迭代速度。
- 构建：vite library 模式，`vue` / `element-plus` / `@form-create/*` 作为 external，由消费方提供。
- 实现边界：16 个入口的传递依赖有 68 个宿主源文件（含 api / store / composable），整体搬包等同抽应用；因此包内模块以相对路径指回 `src/` 的现网实现，library 构建把宿主源一并 external，dist 只留 re-export。宿主与产物拿到的是同一模块实例，代价是包只在仓库内可用（与「本期只承诺仓库内独立编译」一致）。

### D4：动作链 handler 生成 + 内部派发关闭

- 生成期把每条链编译成 `function onChain(ctx, params)` 分支；按钮链绑定 `@button-click`，列链绑定列事件，组件链绑定对应组件 emit。参数中的 `$row` 等占位符在生成期转成 `ctx.row` 取值，不保留字符串模板。
- 组件内部派发与产物 handler 的互斥沿用 `externalActions` 思路，并扩展到列链与组件链载体：产物传 `external-actions`，组件在该模式下只 emit，不自行 `pageActionBus.dispatch`。宿主不传该 prop，保持原行为。
- 事件脚本：生成期把脚本正文嵌入普通函数体 `function script(ctx) { ... }`，禁用 `new Function`/`eval`。产物定义受限上下文（form、row、rowIndex、page、message、http），超出白名单的标识符在生成期扫描并记 unsupported。
- 备选：运行时解释脚本 —— 否决：小程序禁 `new Function`，且与「出码规避脚本沙箱」的既有判断矛盾。

#### 触发器 → emit 白名单（4.1 盘点结论，代码里的对位是三张表：`list.events` / `list.chainCarriers` / `ACTION_OPS`）

| 载体 | 链来源（schema 路径） | 触发器 | 产物出口 | 组件侧事实依据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| page-table | `props.viewActions.buttons[].events[].actions` | 按钮 key（`edit/view/create` 映射 `row-edit/row-view/row-create`，其余 `click`） | `@button-click` → `onButtonClick` 的 `case '<key>'` | PageDataTable 抛 `{key,label,row}`；分发时**忽略** `ev.trigger`，按按钮 key 取事件组 | 已接线 |
| page-table | `props.columns[].onCellClick.actions` | `cell-click` | `@cell-click`（`when:'chain'`）→ `onCellClick` 先按 `(c.key ?? c.prop)` 命中列 | `handleCellClick` 先查列链、未命中才走表级链 | 已接线 |
| page-table | `props.viewEvents[]` | `row-click` / `cell-click` / `selection-change` / `sort-change` | 四个同名 handler | `triggerViewEvents` 存在，且 `ev.target` 非 `'table'` 就跳过（`SELF_TARGET`） | 白名单内已接线；其它 trigger 记 unsupported |
| page-list-cards | 同上三支 | `button-click` / `row-click` | 两个 handler | PageDataCards **没有** `handleCellClick`、没有 `triggerViewEvents`（契约未声明 `chainCarriers`） | 只有按钮链真执行；列链与组件链整支 unsupported |
| 列表类（form 内嵌同规则） | 总线 `schema.actions[]` | `row-click`（`BUS_CHAIN_TRIGGERS`） | 复用同一 handler | 总线与链共用一份 op 表 | 已接线 |
| formContainer | op `open-container` / `load-record` / `close-container` / `save-container` | — | 容器段自带的 `openContainer` / `closeContainer` / `confirmSave` | `gates: ['container']` 且 target 必须命中页面容器 | 已接线 |
| formContainer / page-data-container | 任一支 | — | — | PageDataForm 只 emit `saved`、PageDataContainer 只 emit `ready`，两者都没有 `viewActions` / `onCellClick` / `triggerViewEvents` 分发器 | 4.2 盘点结论：**没有 emit 要补**；它们只作为 op 的 target 出现在上一行 |
| dash 族 / 字段控件 / 布局容器 | — | — | — | 运行期无链载体 | 不登记 |

op 面：`ACTION_OPS` 表内 14 项，两类 gate —— `list-ref` 要求列表组件真被 ref 且是链的载体，`container` 要求页面有 formContainer 且 target 命中；表外 op 一律不接线。`ACTION_OPS_REJECTED` 7 项（`open-detail` / `open-create` / `edit` / `new-record` / `set-value` / `reload-record` / `save-record`）登记在册但不产码：执行体在组件内部的本地表单/详情弹窗，产物没有那层，换成页面容器等于改语义。

缺口（本期不补，全部落 unsupported / 丢弃登记，不许假挂点）：

1. cards 要接列链与组件链得在组件里新增分发器，属 Non-Goal 挡住的「重写 page-* 业务逻辑」，只做登记。
2. cards `expose: 'none'`（无 `defineExpose`）→ 卡片载体上 `list-ref` 类 op 整步不接线，产物留一行 `lc:todo` 注释。
3. `rowIndex` 在脚本白名单里，但三个事件出口的 payload 都给不到行号 → 用到就整条链拒绝。
4. `form` 上下文只在页面真出了 formContainer 时存在（emit 只渲染第一个容器）；没容器还写 `form` 就拒绝。
5. 运行期的脚本开关 `VITE_PAGE_SCRIPT_ENABLED` **不移植**：那是沙箱 `new Function` 的执行门，产物里脚本已是普通函数，没有对位物。代价是产物默认带可执行脚本，安全性由生成期白名单兜。
6. 链参数与 `$param.*` 只在生成期展开成字面量/`ctx` 取值；展开完就把常量里那支配置剥掉并登记 `chain-compiled` 丢弃，避免产物里存在第二份「看起来会执行」的 `$row.*` 模板。

### D5：双渲染 e2e 用 Playwright

产物构建后起静态预览与宿主预览，用 Playwright 分别打开 `/codegen-probe/<case>` 与 `/page/<key>?preview=true`，对文本、字段值、行数做断言。首版覆盖列表、表单容器、dashboard 三类。

- 备选：vitest + happy-dom 双渲染 —— 否决：两个渲染路径的 DOM/表单组件行为差异大，jsdom 下测不出真实交互。
- 备选：继续人工 browser-use 探测 —— 否决：无法进 CI，作为 Gate 不成立。
- 成本：新增 devDependency 与浏览器下载；CI 需要缓存浏览器。若 CI 环境暂不具备，先落本地脚本并标记 Gate 为「准入项」，不伪装成已自动化。

落地形态（5.3）**修正本条原文的「两个 webServer」为一个 webServer 两条路由**：`@lc/runtime` 的导出指回宿主 `src/views/page/components/*.vue`（阶段 3 口径是宿主与产物共用同一实现、不复制组件），另起一个产物 shell 服务只会把宿主源码整包再拖一遍，多一个端口换不到任何隔离。

- 一个 dev server：`frontend/playwright.config.ts`，`testDir ./e2e/codegen`，端口 5300（`E2E_PORT` 可覆盖，`strictPort`），**不碰本机 3000**（其他会话在用）；`workers: 1` + `fullyParallel: false`，两侧读数必须来自同一时刻的同一份活库。
- 两个 project：`login`（`auth.setup.ts`）→ `dual-render`（`dependencies: ['login']`，带 storageState）。登录走 dev server 的 `/api` 代理而不是直连 8080：直连拿到的 token 存在后端 origin 上，浏览器侧 `localStorage` 读不到。
- 两条路由：`/page/<key>?preview=true`（宿主，吃活库最新定义含 DRAFT）与 `/codegen-probe/<key>`（产物，按归一化页名命中 `codegen/probe/*.vue`）。产物是生成物不进 git，落盘命令见 `runtime-probe.test.ts` 头注释。
- 外部依赖：后端 8080 + 活库必须在跑。不具备时 Gate 只能标「未自动化」，不伪装成已跑通。
- 跨侧定位口径（5.4–5.6 实测）：表单项只能按「`.el-form-item` filter 到 `.el-form-item__label` 全文精确」取。宿主侧 form-create 把标题包进 `<span class="fc-form-title">`，`:text-is()` 只命中产物；input-number 与公式框没有可访问名，`getByRole(name)` 只命中部分字段。写回类用例还必须挑一条**与当前值不同**的候选，否则「两侧都没写回」也能绿。
- 旁路观察（本期不改）：产物里 `<tr>` 直挂 `<table>` 会触发 vue 编译告警，与宿主运行期组件 `src/vendor/components/table/Table.vue:4-6` 同一形态，属 vendor 存量而非出码新引入；生成器单方面加 `<tbody>` 反而背离「与宿主同一实现」的口径。

人工版双渲染（5.10）另开一屏：`/codegen-lab/<pageKey>`（dev-only，见 D6 改向）。它不新造渲染路径，宿主侧直接挂 `PageRendererPage`（与 `/page/<key>?preview=true` 同一棵子树），产物侧挂 `codegen/probe/*.vue`（与 `/codegen-probe/<key>` 同一份文件）。一条硬约束：`PageRendererPage` 的组件身份 `pageKey` 取自 `route.params.pageKey`，所以验证台把页名放进**路由参数**并在换页时先 `router.replace` 再生成，否则内联渲染出来的宿主侧与真路由不是同一口径。

按钮版出码（5.11）再加一个 project：`designer-codegen`（`e2e/codegen/designer.spec.ts`，`dependencies: ['codegen-lab']` 排在最后——它会重写磁盘产物，而前面几条比的是「磁盘 vs 本次生成」，换了顺序就互相插队）。守的三件事：页 id 按 key 从接口现取（设计器路由只认 `?id=`，id 每个库都不同）、等 `.page-key-input input` 填上才点（`pageKey` 与 `setRule` 在同一个加载函数里，早一步 `getRule()` 还是空数组，出一张空页还把它写上盘）、断 popup 落到 `/codegen-probe/<key>` 且行出得来。落盘是否发生用**文件 mtime 前进**判定，不比正文——同一份定义出的正文本来就一模一样，正文相等证明不了写过盘。用例进出都要快照/还原 `codegen/probe/`（`e2e/codegen/probe-fs.ts`），否则下一轮「右侧没有落盘产物」那条会看执行顺序的脸色。

### D6：报告作为生成返回值（5.10 起另加人工验证界面）

`generatePage` 返回 `report { codegenRate, buckets: { A, B, C }, unsupported, registryCounts }`，由语料体检测试与 CLI 输出消费。设计器暂不加入口。

落地形态（5.1）：`codegen/report.ts` 出 `GenerateReport`，实际字段是 `reportVersion / pageKey / codegenRate{totalNodes, registeredNodes, emittableNodes, rate} / buckets{A,B,C} / holes[] / renameFailures[] / unsupported[] / registryCounts{dropped, warnings, renames, wireOnly} / nodes[]`。三条口径约束，防止报告长成第二套真相：

1. 三桶必须来自空洞，空洞只能来自回读 —— `generatePage` 生成完就地跑一次 `reverseToSchema`（回读器只 type-import，`generate → report → reverse` 单向不成环）。代价是每次出码多解析一遍产物（12 页语料全量体检 18s，可接受）。
2. 分母的「走不走得到」由契约表算：`report.ts` 的节点采集器与 `parse.ts` 的子规则递归开关同一口径（`props.rule.emit==='children'` / `contract.table` / `props.columns.emit==='children'`），采集器随出码进入生产路径，体检测试不再自带一份 —— 仪器和被测物必须同一个函数算出来的数。
3. `registryCounts` 直接累加本次 manifest（warnings 跨节点级 / 行为级 / 数据源级三张表），报告不做任何新判定。

- 备选：设计器生成报告弹窗 —— 否决：入口不在设计器（它是生产工具，塞进一条 dev-only 调试链路会污染产品导航），也不做弹窗（要的是能停留、能跳两侧全屏对照的一整屏）。

改向（5.10，2026-10-22 用户要求「一个能在前端界面上人工验证的界面」）：**「不建 UI」这条撤下**，形态是 dev-only 的出码验证台 `/codegen-lab/<pageKey>`（`CodegenLabPage.vue` + `CodegenReportPanel.vue` + `CodegenComparePane.vue` + `probe-index.ts`）。原决策的三条理由仍然成立并被保留：

1. 报告不另立真相 —— 界面只排版 `generatePage().report`，一个判定都不自己算（面板的 C 桶警示读的就是 `report.buckets.C` 与 `report.holes`）。
2. 生产包不带出码产物 —— 路由只在 `import.meta.env.DEV` 登记（与 `/codegen-probe` 同纪律），语料 fixture glob 与产物 glob 都只被这条 dev-only 路由引用。
3. 验收仍以命令行为准 —— 体检测试、golden、Playwright 是 Gate；界面是**人工**核对入口，不替代它们。

界面上必须自己讲清的三件事（都是「人工结论可信」的前置）：
  · 可出码率连着分子分母显示（只有百分比看不出节点数变了）；
  · 定义来源二选一且写明：语料 fixture（不依赖后端）/ 活库 `preview=true`（与 e2e 宿主路由同口径）；
  · 右侧产物来自磁盘 `codegen/probe/`，与本次生成**逐字节**比对，不一致就红色点名列出差异文件——否则人是拿着新报告看旧产物。

改向第二刀（5.11，用户纠正原话「我的界面是指前端应用需要有出码按钮控制出码，出完码直接在开发服务器中渲染查看」）：上一段那屏只**读**定义、落盘仍要人敲 `PROBE_PAGES=…` 命令行，出码这个动作本身还没交到用户手里。三处落地与它们的取舍：

1. **写盘通道是 dev-only 的 vite 中间件，不是新后端接口**（`vite.codegen-probe-writer.ts`，`configureServer` 只在 `vite dev` 执行，`vite build` 带不出去）。出码产物本来就只活在开发服务器里（不进 git、生产包不带），给它做接口反而会把「线上能写源码文件」这条路开出来。
2. **两个入口**：设计器工具栏「出码」（`isDev` 才渲染，成功后 `window.open` 到产物路由，正是用户要的那句「出完码直接渲染查看」）+ 验证台「落盘产物」（把 5.10 那条命令做成按钮，写完必须重读磁盘 glob，否则警示还挂着）。设计器吃**当前画布定义**而不是回读接口——`handleSave` 序列化的就是 `{rule: getRule(), option: getOption(), dataSources, actions}`，内存态即保存态，未保存的改动照样出码，这也让「改完立刻看出码结果」成立。
3. **浏览器给的文件名一律不可信**：只收 `.vue`/`.ts`、最多一层子目录、段首不得为点、段名不得等于 `probe`、禁反斜杠、正文必须是字符串且 ≤512KB；再叠同源校验与「`path.resolve` 后必须仍在 `codegen/probe/` 下」的双保险。客户端对 200 但非 JSON 的响应（dev 的 SPA fallback 会把未知路径回成 200 + index.html）必须报失败——**假装落盘成功比不落盘更坏**，人会拿着不存在的产物读报告。

两条纪律未动：报告仍不另立真相（按钮只调 `generatePage` 并落盘，不新算任何判定）；验收仍以命令行为准（`codegen-run` 的产物 md5 与 `PROBE_PAGES=…` 命令行生成的**逐字节一致**，2026-10-22 实测 `5d8c03c0…` / `6275d2c3…`）。

「不进生产构建」这条要真的成立，光靠动态 `import()` 不够：rollup 仍会把出码 chunk 产出到 `dist/assets/`（实测 `codegen-run-*.js` 1.06MB，里面是 `@vue/compiler-sfc` + 生成器整栈），生产里没有任何路径能取它，纯死重。口径改成**动态 import + 函数首行 `if (!import.meta.env.DEV) return`**，构建期把整段剪掉，`npx vite build` 后 `dist/assets/` 再无 codegen 文件（8.4M → 7.5M）。

### D7：分阶段迁移，每阶段独立可回滚

顺序：IR（输出字节不变）→ fcTable → runtime 包 → emit + 动作链 → e2e/report。每阶段独立提交，前阶段的 golden 与语料 Gate 必须保持通过。

## Risks / Trade-offs

- [IR 重构触及 22 个测试文件，回归面大] → 先做「IR 重放、字节不变」再改判定逻辑；每阶段以语料体检 + golden 为 Gate。
- [fcTable 静态表格与 form-create 渲染存在像素/结构差异] → 以结构、文本、单元格几何为验收口径；真机 A/B 只对语料与合成样本负责，其余形态进 unsupported。
- [runtime 抽包重演 element-plus 库 chunk 循环依赖（生产白屏根因）] → 包内 external 化，宿主保留 manualChunks 断环配置并加构建冒烟。
- [动作链零现网样本，可能做出无人使用的功能] → 用户已拍板保留；验收只以合成样本为准，并在报告中标注该能力的样本来源。
- [Playwright 在 CI 中的浏览器依赖] → 优先缓存浏览器；若环境不满足，Gate 明确标为未自动化，不以本地手工结果冒充。
- [file 依赖在产物离开仓库后失效] → 本期只承诺仓库内独立编译；发布到 registry 作为部署阶段的前置项记录在任务中。

## Migration Plan

1. **IR 层**：新增 `ir.ts` / `parseIr` / `emitTemplate`，现有生成器改为经 IR；golden 与语料体检必须零差异。回滚点：删除 IR 适配层即可回到直出。
2. **fcTable**：登记契约、IR 载体、静态表格模板、几何回读与变异用例；dashboard 页进 Gate。
3. **runtime 包**：抽 `packages/lc-runtime`，宿主切依赖、删 alias；产物独立编译冒烟。
4. **emit + 动作链**：补组件 emit、externalActions 扩展、handler 生成、脚本嵌入；合成样本 e2e。
5. **e2e / report**：Playwright 三类页面、报告接口、CI Gate 接入；最后更新基线数字。

每阶段结束跑：`tsc --noEmit`、全量 vitest、codegen 语料体检；数字与基线对比后才能进入下一阶段。

## Open Questions

- fcTable 的 `layout` 是否存在跨行合并以外（如嵌套表、固定表头）的形态？语料只有 1 例，需在阶段 2 用现有编辑器能力补合成样本确认。
- Playwright 是否被 CI 环境接受？若不接受，Gate 退化为本地准入项还是换测试载体？
- 事件脚本上下文白名单的首批 API 边界（现网 `scriptSandbox` 支持的上下文与产物可提供的能力不完全重合）。
- `file:` 依赖是否可接受，还是要求在 P2 内完成包的首次发布流程？
