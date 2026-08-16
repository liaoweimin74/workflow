# custom-page-designer Specification

## Purpose
自定义页面轨（阶段二）：使用 form-create 拖拽式设计器（PageDesigner）创建自由布局页面（type=PAGE），注册页面组件库（布局/展示/数据组件），通过数据源注入绑定业务表单数据，支持 form-create 原生 on 事件、effect 联动与脚本交互。覆盖视图轨无法表达的异形风格（卡片/看板/日历等）与复杂交互。

## Requirements

### Requirement: 自定义页面创建与保存

系统 SHALL 支持创建 type=PAGE 的页面定义（复用 query-view-definition 的创建/更新/发布接口，type 传 PAGE）。
自定义页面 schema SHALL 为标准 form-create 结构 `{rule, option}`，rule 中的组件类型 SHALL 来自已注册组件库。
页面 schema 保存时，系统 SHALL 校验 rule 格式合法（可被 FormRenderer 解析），非法 SHALL 返回 400。

#### Scenario: 创建自定义页面
- **WHEN** 用户创建 type=PAGE 的页面定义，schema 为 {rule: [el-card 容器 + el-table 数据组件], option: {}}
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
- 展示组件：el-table（数据表格）、el-descriptions（详情）、el-statistic（统计卡）、el-tag、el-progress
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

### Requirement: 数据源绑定与注入

页面运行时（PageRenderer）SHALL 向页面注入 PageDataSource 对象：formKey、query（分页查询）、detail（详情）、create、update、remove。
数据组件的 props 声明绑定数据源时，系统 SHALL 将组件与 PageDataSource 对应方法关联。
页面数据查询 SHALL 同样受字段白名单约束：查询字段仅接受绑定表单 column_config 与页面 schema 声明的字段。
PageDataSource 的 query 方法 SHALL NOT 绕过租户过滤。

#### Scenario: 表格数据源绑定
- **WHEN** 自定义页面包含 el-table 数据组件
- **AND** 该组件配置绑定 formKey="leave" 的数据源
- **THEN** 页面渲染时表格调用 PageDataSource.query 加载 wf_biz_leave 数据
- **AND** 查询结果仅包含当前租户数据

#### Scenario: 无数据源绑定表格
- **WHEN** 自定义页面包含 el-table 组件但未配置数据源
- **THEN** 表格渲染为空状态
- **AND** 不发起数据请求

---

### Requirement: 页面事件与脚本交互

自定义页面 SHALL 支持 form-create 原生能力：rule 的 on 事件、effect 联动、watch。
页面组件交互（如按钮触发表格刷新、行点击打开详情）SHALL 通过注入的事件总线与 PageDataSource 实现。
页面内的脚本扩展 SHALL 复用 ScriptSandbox（与视图脚本共享执行引擎与安全边界）。
页面脚本上下文 SHALL 包含：ds（PageDataSource）、api（form-create api）、event 触发对象、actions（动作执行器）。

#### Scenario: 按钮触发表格刷新
- **WHEN** 自定义页面含"刷新"按钮与数据表格
- **AND** 按钮 on 事件配置为调用表格数据源刷新
- **THEN** 点击按钮后表格重新调用 PageDataSource.query
- **AND** 表格数据更新

#### Scenario: 行点击打开详情
- **WHEN** 自定义页面表格行点击事件绑定详情动作
- **THEN** 点击行后使用该行数据打开详情展示（el-descriptions 或详情弹窗）
- **AND** 详情数据来自 PageDataSource.detail

---

### Requirement: 自定义页面发布校验

发布 type=PAGE 页面时，系统 SHALL 校验：
- rule 格式可被 FormRenderer 解析
- 数据组件引用的字段存在于绑定表单 column_config（若有绑定 form_key）
- 绑定 form_key 对应业务表单存在且已发布（若配置了绑定）

发布仍遵守 query-view-definition 发布通用规则：不建表、不执行 DDL、版本管理、内容未变化拒绝。

#### Scenario: 发布自定义页面
- **WHEN** 自定义页面 schema 合法且绑定表单已发布
- **THEN** 系统发布成功（status=PUBLISHED）
- **AND** 不执行任何 DDL

#### Scenario: 引用字段不存在
- **WHEN** 发布自定义页面
- **AND** 数据组件引用了绑定表单 column_config 中不存在的字段
- **THEN** 系统返回 400 错误
- **AND** 不发布