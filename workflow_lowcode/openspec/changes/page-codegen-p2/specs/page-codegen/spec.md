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

每次出码 SHALL 产出机器可读的报告，至少包含：可出码节点率、A/B/C 三桶空洞计数、unsupported 明细、四张登记表计数（dropped / warnings / renames / wireOnly）。语料体检 SHALL 作为持续 Gate：C 桶必须为 0，可出码率不得低于上一基线。双渲染 e2e SHALL 覆盖列表页、表单容器页与 dashboard 三类，并随 CI 自动执行。

#### Scenario: 保真退化触发 Gate 失败

- **WHEN** 某次改动使语料体检的 C 桶大于 0，或可出码率低于基线
- **THEN** Gate 判定失败并输出退化节点与归因

#### Scenario: 三类页面双渲染一致

- **WHEN** 对列表页、表单容器页、dashboard 分别做宿主渲染与产物渲染
- **THEN** 关键 DOM 文本、字段值与交互结果一致
- **AND** e2e 在 CI 中自动运行

### Requirement: 回读保真与登记表语义

产物与 manifest SHALL 支撑零空洞回读；默认值省略仅在 schema 值确实等于登记默认时豁免；被丢弃或重命名的键 SHALL 在对应登记表中有可核对证据。新增组件或布局载体 SHALL NOT 通过放宽登记表来掩盖差异。

#### Scenario: 有意丢弃与静默丢失可区分

- **WHEN** 某节点的一个键被有意丢弃
- **THEN** 该键出现在 `dropped` 或 `warnings`（kind 属于 `dropKinds`）中
- **AND** 回读不把它当作丢失的差异

#### Scenario: 变异注入仍能照见多造与丢失

- **WHEN** 手改产物中的一个 prop 值或删除一个绑定
- **THEN** 回读报告精确指出对应 schema 路径的差异
