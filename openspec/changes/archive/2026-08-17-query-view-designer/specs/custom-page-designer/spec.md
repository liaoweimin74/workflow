# custom-page-designer Delta Specification

## ADDED Requirements

### Requirement: 自定义页面创建与保存

系统 SHALL 支持创建 type=PAGE 的页面定义（复用 query-view-definition 的创建/更新/发布接口，type 传 PAGE）。
自定义页面 schema SHALL 为扩展 form-create 结构 `{rule, option, dataSources, actions}`，rule 中的组件类型 SHALL 来自已注册组件库，dataSources 为页面级数据源绑定层，actions 为页面级动作总线。
页面 schema 保存时，系统 SHALL 校验 rule 格式合法（可被 FormRenderer 解析）且 dataSources/actions 格式合法，非法 SHALL 返回 400。

#### Scenario: 创建自定义页面（绑定多数据源）
- **WHEN** 用户创建 type=PAGE 的页面定义，schema 为 {rule: [树组件 + 表格组件], option: {}, dataSources: [{id:"ds-cats", refId:"ds_cat_tree_001"}, {id:"ds-products", refId:"ds_prod_list_002"}], actions: [...]}
- **THEN** 系统创建 version=1、status=DRAFT 的页面定义
- **AND** schema 原样保存

#### Scenario: 保存非法 schema
- **WHEN** 用户保存 schema 为非法 JSON 或 rule 非数组
- **THEN** 系统返回 400 错误
- **AND** 不保存

---

### Requirement: 页面组件库

系统 SHALL 提供注册到 form-create 的页面组件库，组件分类 SHALL 至少包含：
- 布局组件：el-row、el-col、el-card、el-tabs、el-divider、分组容器
- 展示组件：el-table（数据表格）、el-descriptions（详情）、el-statistic（统计卡）、el-tag、el-progress、el-tree（树形数据）
- 交互组件：el-button、el-input、el-select、el-date-picker（查询条件）及现有业务组件（DataPicker、LookupPicker 等）
- 数据组件：table 等可声明数据源绑定的组件

页面组件库 SHALL 为独立注册表，不得污染表单设计器组件库。

#### Scenario: 页面设计器使用页面组件库
- **WHEN** 用户打开 PageDesigner
- **THEN** 组件面板展示页面组件库（布局/展示/交互/数据组件）
- **AND** 表单设计器组件（如表单字段组件）与页面组件库相互独立

#### Scenario: 拖拽布局组件
- **WHEN** 用户拖拽 el-row/el-col 与 el-card 到画布并配置布局
- **THEN** 画布按配置渲染布局结构
- **AND** 生成的 rule 可被 FormRenderer 渲染

---

### Requirement: 页面级多数据源绑定

页面 schema 的 dataSources SHALL 为绑定层数组，每个条目包含：页面内唯一 id、refId（引用全局数据源，来自 data-source-management）、可选 searchFields/columns 白名单覆盖、可选默认 filter 参数。
页面运行时（PageRenderer）SHALL 按 refId 解析全局数据源并实例化 DataSourceRegistry，组件通过页面内 dataSourceId 声明绑定。
数据组件未显式绑定 dataSourceId 时 SHALL 默认绑定 dataSources[0]（兼容单数据源语义）。
FORM 数据源的查询 SHALL 受该绑定条目 searchFields 白名单约束（未声明 searchFields 时默认继承全局数据源绑定的表单 column_config 可见列）。
页面数据查询 SHALL NOT 绕过租户过滤。

#### Scenario: 表格绑定数据源
- **WHEN** 自定义页面包含 el-table 数据组件
- **AND** 该组件配置 dataSourceId="ds-products"
- **AND** 页面 dataSources 中 ds-products 的 refId 指向 type=FORM 全局数据源（formKey="product"）
- **THEN** 页面渲染时表格加载 wf_biz_product 数据
- **AND** 查询结果仅包含当前租户数据

#### Scenario: 多数据源同一页面
- **WHEN** 自定义页面同时包含树组件（绑定 ds-cats）与表格组件（绑定 ds-products）
- **AND** ds-cats 与 ds-products 分别引用不同全局数据源（如 category 与 product 两个表单）
- **THEN** 两个组件分别独立加载各自数据源的数据
- **AND** 互不干扰（各自维护分页/过滤状态）

#### Scenario: 组件未绑定数据源
- **WHEN** 自定义页面包含 el-table 组件但未配置 dataSourceId
- **AND** 页面 dataSources 为空数组
- **THEN** 表格渲染为空状态
- **AND** 不发起数据请求

#### Scenario: 单数据源默认绑定
- **WHEN** 自定义页面含 el-table、dataSources 仅一个条目（ds-main）
- **AND** 表格未显式配置 dataSourceId
- **THEN** 表格默认绑定 ds-main

---

### Requirement: 页面动作总线联动

自定义页面 SHALL 支持页面级 actions 动作链：trigger（任意组件事件）+ steps（有序动作）。
动作目标 SHALL 统一引用页面内数据源 id（set-filter / refresh / set-value / open-detail / call-api）或组件 id（set-value）。
联动动作 set-filter 的字段 SHALL 受目标数据源 searchFields 白名单约束（未声明的字段不得作为过滤条件）。
复杂联动（多数据源交叉、条件逻辑）SHALL 通过 ScriptSandbox 脚本实现，脚本上下文 SHALL 包含：registry（全部已注册数据源）、api（form-create api）、event 触发对象、actions（动作执行器）。
页面内非数据组件的交互（如按钮触发表格刷新、行点击打开详情）SHALL 通过同一动作总线实现。

#### Scenario: 树节点选中过滤表格（左树右表）
- **WHEN** 页面含树组件（ds-cats）与表格组件（ds-products）
- **AND** actions 配置：tree 的 node-click 事件触发 [{op:"set-filter", target:"ds-products", field:"categoryId", value:"{node.id}"}, {op:"refresh", target:"ds-products"}]
- **AND** categoryId 已声明在 ds-products 的 searchFields
- **THEN** 点击树节点后表格按 categoryId=节点id 重新查询
- **AND** 过滤字段未超出白名单

#### Scenario: 联动过滤字段未声明
- **WHEN** actions 中 set-filter 的 field="secretColumn"
- **AND** secretColumn 不在目标数据源 ds-products 的 searchFields 中
- **THEN** 页面发布时系统返回 400（动作引用未声明字段）
- **AND** 不发布

#### Scenario: 按钮触发表格刷新
- **WHEN** 自定义页面含"刷新"按钮与数据表格
- **AND** 按钮 on 事件配置为调用该表格数据源刷新
- **THEN** 点击按钮后表格重新调用数据源 query
- **AND** 表格数据更新

#### Scenario: 行点击打开详情
- **WHEN** 自定义页面表格行点击事件绑定详情动作
- **THEN** 点击行后使用该行数据打开详情展示（el-descriptions 或详情弹窗）
- **AND** 详情数据来自该数据源 detail 能力

---

### Requirement: 自定义页面发布校验

发布 type=PAGE 页面时，系统 SHALL 校验：
- rule 格式可被 FormRenderer 解析
- dataSources 条目 id 页面内唯一、refId 非空且指向存在且 ENABLED 的全局数据源
- rule 中数据组件的 dataSourceId 命中 dataSources[].id（悬空引用 400）
- FORM 绑定：refId 对应全局数据源的 formKey 表单已发布；searchFields/columns 引用列存在于绑定表单 column_config
- actions 引用的 componentId / target 存在；set-filter 字段命中目标数据源 searchFields
- 绑定 formKey 对应业务表单存在且已发布

发布仍遵守 query-view-definition 发布通用规则：不建表、不执行 DDL、版本管理、内容未变化拒绝。

#### Scenario: 发布自定义页面（多数据源）
- **WHEN** 自定义页面 schema 合法、两个 refId 均指向 ENABLED 且 formKey 已发布的全局数据源
- **THEN** 系统发布成功（status=PUBLISHED）
- **AND** 不执行任何 DDL

#### Scenario: 引用悬空数据源
- **WHEN** 发布自定义页面
- **AND** dataSources 中某条目 refId 指向不存在的全局数据源
- **THEN** 系统返回 400 错误
- **AND** 不发布

#### Scenario: 引用禁用数据源
- **WHEN** 发布自定义页面
- **AND** dataSources 中某条目 refId 指向 status=DISABLED 的全局数据源
- **THEN** 系统返回 400 错误
- **AND** 不发布

#### Scenario: 引用字段不存在
- **WHEN** 发布自定义页面
- **AND** 数据组件引用了绑定表单 column_config 中不存在的字段
- **THEN** 系统返回 400 错误
- **AND** 不发布

#### Scenario: 组件绑定未声明的数据源
- **WHEN** 发布自定义页面
- **AND** rule 中某数据组件 dataSourceId="ds-ghost" 但 dataSources 中无此 id
- **THEN** 系统返回 400 错误
- **AND** 不发布