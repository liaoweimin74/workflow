## ADDED Requirements

### Requirement: IR 分层与目标无关性

出码器 SHALL 先将页面 schema 归一化为独立中间表示（IR），再由 IR 生成目标端模板，不得从 form-create 规则直接拼接模板。IR SHALL 保留节点类型、字段、数据源绑定、布局与动作引用，且 SHALL NOT 依赖 form-create 运行时类型，使后续移动端目标可复用同一 IR。

#### Scenario: PC 产物经 IR 生成

- **WHEN** 对一个含列表、容器与字段控件的页面执行出码
- **THEN** 生成流程中 `schema → IR → template` 三阶段可分别观测
- **AND** 模板生成只读取 IR，不直接读取原始 schema 节点

#### Scenario: IR 不依赖 form-create

- **WHEN** 对 IR 类型定义做依赖检查
- **THEN** IR 模块不 import `@form-create/*` 或 form-create 运行时对象
- **AND** 同一 IR 可被一个不渲染 form-create 的目标消费

### Requirement: fcTable 出码与几何回读

出码器 SHALL 支持 `fcTable` 布局容器：其子节点来自 `children` 且携带 `slot:"行:列"` 地址；产物 SHALL 按 slot 分组渲染，并保留合并单元格（colspan/rowspan）与列宽/行高几何。回读器 SHALL 从产物单元格几何反推 slot 坐标，还原出与源 schema 等价的 `fcTable` 节点。

#### Scenario: dashboard 页整页出码

- **WHEN** 对语料中的 `dashboard` 页执行出码并回读
- **THEN** 回读零空洞、重命名失败为 0、保真桶（C）为 0
- **AND** `fcTable` 的每个子节点都能按 slot 还原到正确行列

#### Scenario: 几何变异可被回读发现

- **WHEN** 手工把产物中某个单元格的 colspan 或 slot 地址改错
- **THEN** 回读报告对应的差异，而不是静默通过

### Requirement: 产物依赖独立运行时包

产物 SHALL 只依赖 `@lc/runtime` 包获取页面组件、取数与通用工具，不得依赖宿主应用的路径别名或源码目录。`@lc/runtime` SHALL 以 workspace 包形式提供，并可被宿主应用与独立产物共同消费。

#### Scenario: 删除宿主 alias 后产物仍可编译

- **WHEN** 移除宿主 vite/tsconfig 中指向 `src/lc-runtime` 的 alias，直接对产物执行类型检查与构建
- **THEN** 构建成功，且产物中所有 `@lc/runtime/*` import 均能解析

#### Scenario: 宿主与产物共享同一运行时实现

- **WHEN** 同一页面分别通过宿主渲染器与出码产物渲染
- **THEN** 两者使用同一份 `@lc/runtime` 组件实现
- **AND** 关键字段、列表数据与容器行为一致

### Requirement: 生成报告与质量 Gate

每次出码 SHALL 产出机器可读的报告，至少包含：可出码节点率、A/B/C 三桶空洞计数、unsupported 明细、四张登记表计数（dropped / warnings / renames / wireOnly）。语料体检 SHALL 作为持续 Gate：C 桶必须为 0，可出码率不得低于上一基线。双渲染 e2e SHALL 覆盖列表页、表单容器页与 dashboard 三类。本仓库当前没有任何 CI 定义（无 `.github/workflows/`、`.gitlab-ci.yml`、`Jenkinsfile`），故该 Gate 在本期明确为**未自动化**，按 tasks 5.7 记录的人工步骤执行（先 `PROBE_PAGES=…` 落盘产物，再 `npx playwright test`）。

#### Scenario: 保真退化触发 Gate 失败

- **WHEN** 某次改动使语料体检的 C 桶大于 0，或可出码率低于基线
- **THEN** Gate 判定失败并输出退化节点与归因

#### Scenario: 三类页面双渲染一致

- **WHEN** 对列表页、表单容器页、dashboard 分别做宿主渲染与产物渲染
- **THEN** 关键 DOM 文本、字段值与交互结果一致
- **AND** 用例由 `npx playwright test` 一条命令跑齐（自动化到 CI 属后续，本期不算达成）

### Requirement: 出码验证台（人工验证界面）

出码 SHALL 提供一个 dev-only 的前端界面，让不读代码的人在同一屏内对同一份页面定义核对三件事：报告、宿主渲染与产物渲染的并排对照、产物源码。该界面 SHALL NOT 进入生产构建，且 SHALL NOT 自己重新判定——只排版 `generatePage().report`。界面 SHALL 显式给出可出码率的分子与分母、定义来源（语料 fixture 或活库 `preview=true`），并把磁盘落盘产物与浏览器本次生成的差异逐字节比出来后点名文件。

#### Scenario: 一屏出齐三块且口径自证

- **WHEN** 打开 `/codegen-lab/<pageKey>` 并选一页语料
- **THEN** 报告面板显示 `可出码/总节点` 两个数与 A/B/C 桶计数，C 桶为 0 时不出告警条
- **AND** 左格宿主渲染与右格产物渲染并排，两侧关键 DOM 数量相等
- **AND** 下方显示产物源码文本

#### Scenario: 产物未落盘时给命令而不是空白

- **WHEN** 所选页面在 `codegen/probe/` 下没有落盘产物
- **THEN** 右格显示可复制的 `PROBE_PAGES=<pageKey> npx vitest run …/runtime-probe.test.ts`，并给出「落盘产物」按钮
- **AND** 不出现空白格或被误读为「渲染不一致」

#### Scenario: 磁盘产物与本次生成不一致时点名

- **WHEN** 浏览器本次生成的任一文件与磁盘落盘产物字节不同
- **THEN** 界面列出差异文件名并提示重新落盘

### Requirement: 应用内出码入口与开发服务器落盘通道

出码动作 SHALL 能从前端应用里发起：页面设计器工具栏 SHALL 提供「出码」入口（仅开发构建可见），吃**当前画布定义**（含未保存改动），产物 SHALL 经开发服务器的落盘通道写进 `codegen/probe/`，并 SHALL 直接在产物路由 `/codegen-probe/<pageKey>` 渲染供查看。验证台 SHALL 提供同一通道的「落盘产物」入口，写完 SHALL 重读磁盘产物而不是沿用旧的文件清单。该通道 SHALL NOT 进入生产构建，SHALL NOT 接受同源之外的请求，且 SHALL NOT 信任请求带来的目标文件名——白名单（仅 `.vue`/`.ts`、最多一层子目录、段首不得为点、段名不得为 `probe`、正文有体积上限）之外的写入 MUST 被拒绝并回报原因；端点不存在时 MUST 报失败而不是把「没写进去」说成写好了。

#### Scenario: 设计器一键出码并在开发服务器渲染

- **WHEN** 在 `/page/designer?id=…` 载入一页后点工具栏「出码」
- **THEN** 产物写进 `codegen/probe/`，且与 `PROBE_PAGES=<pageKey> npx vitest run …/runtime-probe.test.ts` 生成的内容逐字节一致
- **AND** 浏览器随即打开 `/codegen-probe/<pageKey>` 并渲染出该页的数据行

#### Scenario: 未落盘的页面点一次按钮即可对照

- **WHEN** 验证台右格正提示「磁盘上没有这一页的产物」，用户点「落盘产物」
- **THEN** 缺产物提示与不一致警示都消失，右格出现产物渲染
- **AND** 磁盘上的正文与界面展示的本次生成结果逐字节相同

#### Scenario: 非法目标文件名与跨源请求被拒

- **WHEN** 落盘请求带来 `../evil.vue`、`x.js`、`a/b/c.vue` 之类的目标名，或请求的 Origin 与请求主机不同
- **THEN** 请求被拒绝并说明原因
- **AND** `codegen/probe/` 之外没有任何文件被创建或改写

#### Scenario: 通道缺失时不假装成功

- **WHEN** 落盘端点没装（dev server 的 SPA fallback 把未知路径回成 200 + HTML）
- **THEN** 界面报「响应不是 JSON / 这个 dev server 没装出码中间件」，磁盘上不出产物

### Requirement: 回读保真与登记表语义

产物与 manifest SHALL 支撑零空洞回读；默认值省略仅在 schema 值确实等于登记默认时豁免；被丢弃或重命名的键 SHALL 在对应登记表中有可核对证据。新增组件或布局载体 SHALL NOT 通过放宽登记表来掩盖差异。

#### Scenario: 有意丢弃与静默丢失可区分

- **WHEN** 某节点的一个键被有意丢弃
- **THEN** 该键出现在 `dropped` 或 `warnings`（kind 属于 `dropKinds`）中
- **AND** 回读不把它当作丢失的差异

#### Scenario: 变异注入仍能照见多造与丢失

- **WHEN** 手改产物中的一个 prop 值或删除一个绑定
- **THEN** 回读报告精确指出对应 schema 路径的差异
