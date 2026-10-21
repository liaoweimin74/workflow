## Context

出码模块当前规模：`generate.ts` 1854 行、`contract.ts` 778 行、`reverse.ts` 468 行，22 个测试文件与 13 页语料 fixture。能力面已覆盖列表/卡片/容器/字段控件/公式/选择器/dash 族/数据容器，语料可出码 55/98 节点，C 保真桶 0。

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

### D4：动作链 handler 生成 + 内部派发关闭

- 生成期把每条链编译成 `function onChain(ctx, params)` 分支；按钮链绑定 `@button-click`，列链绑定列事件，组件链绑定对应组件 emit。参数中的 `$row` 等占位符在生成期转成 `ctx.row` 取值，不保留字符串模板。
- 组件内部派发与产物 handler 的互斥沿用 `externalActions` 思路，并扩展到列链与组件链载体：产物传 `external-actions`，组件在该模式下只 emit，不自行 `pageActionBus.dispatch`。宿主不传该 prop，保持原行为。
- 事件脚本：生成期把脚本正文嵌入普通函数体 `function script(ctx) { ... }`，禁用 `new Function`/`eval`。产物定义受限上下文（form、row、rowIndex、page、message、http），超出白名单的标识符在生成期扫描并记 unsupported。
- 备选：运行时解释脚本 —— 否决：小程序禁 `new Function`，且与「出码规避脚本沙箱」的既有判断矛盾。

### D5：双渲染 e2e 用 Playwright

产物构建后起静态预览与宿主预览，用 Playwright 分别打开 `/codegen-probe/<case>` 与 `/page/<key>?preview=true`，对文本、字段值、行数做断言。首版覆盖列表、表单容器、dashboard 三类。

- 备选：vitest + happy-dom 双渲染 —— 否决：两个渲染路径的 DOM/表单组件行为差异大，jsdom 下测不出真实交互。
- 备选：继续人工 browser-use 探测 —— 否决：无法进 CI，作为 Gate 不成立。
- 成本：新增 devDependency 与浏览器下载；CI 需要缓存浏览器。若 CI 环境暂不具备，先落本地脚本并标记 Gate 为「准入项」，不伪装成已自动化。

### D6：报告作为生成返回值，不建 UI

`generatePage` 返回 `report { codegenRate, buckets: { A, B, C }, unsupported, registryCounts }`，由语料体检测试与 CLI 输出消费。设计器暂不加入口。

- 备选：设计器生成报告弹窗 —— 否决：本期验收靠 CI 与命令输出，UI 会引入与生成器无关的样式与权限工作。

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
