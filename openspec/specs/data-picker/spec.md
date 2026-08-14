# data-picker Specification

## Purpose
数据引用组件：表单字段从已发布业务表单选取数据（存 id 引用 + `_text` 展示缓存），支持过滤条件、级联、允许新增、跳转查看与引用感知。
TBD - created by archiving change data-picker-v2. Update Purpose after archive.
## Requirements
### Requirement: 数据引用组件可视化配置

表单设计器 SHALL 提供"数据引用"（dataPicker）组件，用户 SHALL 能通过可视化配置弹窗完成数据源配置。

配置弹窗 SHALL 支持：选择目标业务表单（仅列出已发布 BUSINESS 类型表单）、选择显示字段（目标表单非隐藏列）、选择弹窗列表列（目标表单非隐藏列）、选择模式（单选/多选）。

配置弹窗 SHALL 支持配置返回字段映射（目标表字段 → 当前表单字段），选中记录后自动回填到当前表单对应字段。

配置弹窗 SHALL 支持配置级联依赖（当前表单字段 + 目标表单列），级联依赖可选。

配置结果 SHALL 以 rule props 形式存入表单 schema，包含 sourceFormKey、displayField、columns、mode、returnFields、dependOn 字段。

#### Scenario: 配置数据引用组件

- **WHEN** 用户在设计器中拖入"数据引用"组件并打开配置弹窗
- **AND** 选择目标表单 emp_profile、显示字段 name、列表列 [name, dept]、单选模式
- **THEN** 组件 rule props 写入 sourceFormKey=emp_profile、displayField=name、columns=[name,dept]、mode=single

#### Scenario: 配置返回字段映射

- **WHEN** 用户在配置弹窗中添加返回字段映射 dept → emp_dept
- **THEN** rule props 的 returnFields 包含 {"dept":"emp_dept"}

#### Scenario: 配置级联依赖

- **WHEN** 用户在配置弹窗中配置级联依赖：当前表单字段 dept_field → 目标表列 dept
- **THEN** rule props 的 dependOn 包含 {"field":"dept_field","sourceColumn":"dept"}

#### Scenario: 配置弹窗仅列出已发布业务表单

- **WHEN** 用户打开配置弹窗选择目标表单
- **THEN** 下拉仅包含已发布（PUBLISHED）的 BUSINESS 类型表单

---

### Requirement: 数据引用运行时选择与级联

数据引用组件运行时 SHALL 渲染为可点击输入框，点击 SHALL 打开选择弹窗。

选择弹窗 SHALL 展示目标表单的数据列表（列与分页），SHALL 支持按显示字段关键词搜索，SHALL 支持单选（点击行选中）与多选（勾选后确认）。

单选模式下点击行 SHALL 立即选中并关闭弹窗；多选模式下 SHALL 提供确认按钮。

选中后 SHALL 触发返回字段回填：按 returnFields 配置将目标记录字段写入当前表单对应字段。

组件 SHALL 支持级联：配置了依赖条件（filters 中 valueType=field 的条目，或兼容形态 dependOn）时，依赖字段值变化 SHALL 刷新选项列表（以依赖字段值作为 filter 查询目标表）。

级联行为 SHALL 由 clearOnCascadeChange 配置控制（默认 false）：
- 为 false 时，依赖字段值变化 SHALL 保留当前选择值与回填字段，仅刷新选项列表；
- 为 true 时，依赖字段值变化 SHALL 清空当前选择与回填字段，并刷新选项列表。

组件 SHALL 支持清除：清空选择时 SHALL 同时清空回填字段。

#### Scenario: 单选选择记录

- **WHEN** 用户打开选择弹窗并点击一条记录
- **THEN** 组件值更新为该记录 id
- **AND** 输入框显示该记录显示字段文本
- **AND** 弹窗关闭

#### Scenario: 多选选择记录

- **WHEN** 用户以多选模式勾选多条记录并点击确定
- **THEN** 组件值更新为多个 id（逗号分隔）
- **AND** 输入框显示多条显示文本（逗号分隔）

#### Scenario: 选中后回填

- **WHEN** 用户选中记录且配置了 returnFields
- **THEN** 按映射将目标记录字段值写入当前表单对应字段

#### Scenario: 级联依赖刷新（默认保留已选值）

- **WHEN** 用户修改依赖字段的值
- **AND** 组件配置了依赖条件且 clearOnCascadeChange=false（默认）
- **THEN** 当前选择值与回填字段被保留
- **AND** 选项列表按新依赖值重新查询

#### Scenario: 级联依赖刷新（配置清空）

- **WHEN** 用户修改依赖字段的值
- **AND** 组件配置了依赖条件且 clearOnCascadeChange=true
- **THEN** 当前选择值与回填字段被清空
- **AND** 选项列表按新依赖值重新查询

#### Scenario: 清除选择

- **WHEN** 用户点击输入框清除按钮
- **THEN** 组件值清空
- **AND** returnFields 对应的回填字段清空

---

### Requirement: 数据引用发布校验

发布含 dataPicker 字段的业务表单时，系统 SHALL 校验：目标表单存在且已发布（同租户），引用列（displayField、columns、dependOn.sourceColumn）仍存在于目标表单 column_config。

校验失败 SHALL 返回 400 并提示具体缺失项。

#### Scenario: 目标表单未发布

- **WHEN** 发布 schema 含 dataPicker（sourceFormKey=emp_profile）的业务表单
- **AND** emp_profile 不存在或未发布
- **THEN** 系统返回 400，提示目标表单不存在或未发布

#### Scenario: 引用列已删除

- **WHEN** 发布 schema 含 dataPicker（displayField=deleted_col）的业务表单
- **AND** deleted_col 不在目标表单 column_config
- **THEN** 系统返回 400，提示引用列已不存在

### Requirement: 过滤条件配置

数据引用组件 SHALL 支持配置多条过滤条件（filters），每条条件包含目标表单列（column）、操作符（operator）、值类型（valueType）与值（value）。

值类型 SHALL 支持两种：
- static：固定值，直接作为查询过滤条件；
- field：动态引用当前表单某个字段的值，字段值变化时作为查询过滤条件刷新选项。

操作符 v2 SHALL 仅支持等值（"="）。

配置弹窗 SHALL 提供过滤条件编辑器：动态行添加/删除条件，每行配置目标列、操作符、值类型、值（static 时输入固定值，field 时选择当前表单字段）。

兼容性：运行时 SHALL 归一化兼容 v1 的 dependOn 配置（等价于单条 valueType=field 的过滤条件），filters 存在时优先使用 filters。

发布校验 SHALL 验证 filters 中每条 column 存在于目标表单 column_config（非 hidden 列），校验失败返回 400 并提示具体缺失项。

#### Scenario: 配置固定值过滤条件

- **WHEN** 用户在配置弹窗添加过滤条件：目标列 status、操作符 =、值类型 static、值 active
- **THEN** rule props 的 filters 包含 {"column":"status","operator":"=","valueType":"static","value":"active"}

#### Scenario: 配置字段动态过滤条件

- **WHEN** 用户在配置弹窗添加过滤条件：目标列 dept、操作符 =、值类型 field、当前表单字段 dept_field
- **THEN** rule props 的 filters 包含 {"column":"dept","operator":"=","valueType":"field","value":"dept_field"}

#### Scenario: 过滤条件参与选项查询

- **WHEN** 用户打开选择弹窗且组件配置了 static 过滤条件 status=active
- **THEN** 选项列表仅返回目标表单中 status=active 的记录

#### Scenario: 字段动态过滤条件联动刷新

- **WHEN** 用户修改当前表单字段 dept_field 的值
- **AND** 组件配置了 valueType=field 的过滤条件
- **THEN** 选项列表按新值重新查询

#### Scenario: 发布校验过滤条件引用列

- **WHEN** 发布 schema 含 dataPicker 且 filters 中某条 column 已不在目标表单 column_config
- **THEN** 系统返回 400，提示过滤条件引用列已不存在

---

### Requirement: 数据引用展示语义（展示缓存）

数据引用组件存储 SHALL 以被引用记录 id 为业务数据（`<key>` 列，多选逗号分隔）。

`<key>_text` 冗余列 SHALL 定位为展示缓存（非业务数据）：系统在 CRUD 时自动维护其为"尽力而为"，不承担数据一致性语义。

显示优先级 SHALL 为：编辑态与审批页实时调用解析接口获取显示文本（失败时回退 `_text`）；列表页与只读态直接使用 `_text`。

目标表单记录被修改导致显示字段值变化时，历史表单的 `_text` SHALL NOT 被强制刷新（缓存语义，文档标注可能滞后）。

#### Scenario: 编辑态实时解析显示

- **WHEN** 用户打开包含 dataPicker 字段的表单（编辑态）且组件值非空
- **THEN** 输入框显示实时解析的显示文本
- **AND** 解析失败时回退显示 `_text` 缓存值

#### Scenario: 只读态使用缓存文本

- **WHEN** 列表页或只读态渲染 dataPicker 字段
- **THEN** 直接显示 `_text` 缓存值，不发起实时解析请求

#### Scenario: 目标记录修改后缓存不刷新

- **WHEN** 目标表单记录的显示字段值被修改
- **AND** 已提交表单包含该记录的 dataPicker 引用
- **THEN** 已提交表单的 `_text` 保持不变（缓存语义）

---

### Requirement: 允许新增

数据引用组件 SHALL 支持配置 allowCreate（默认 false）。

allowCreate=true 时，选择弹窗 SHALL 提供"新增"入口；点击 SHALL 打开目标表单的快速创建界面。

快速创建提交成功 SHALL：刷新选项列表 → 自动选中新创建的记录 → 执行 returnFields 回填 → 更新组件值。

权限 SHALL 沿用 v1 数据范围策略（能管理目标表单即能新增）。

#### Scenario: 启用允许新增后现场创建

- **WHEN** 用户在配置弹窗开启 allowCreate
- **THEN** 选择弹窗显示"新增"按钮

#### Scenario: 新增记录并自动选中

- **WHEN** 用户在选择弹窗点击"新增"并填写目标表单提交
- **THEN** 选项列表刷新
- **AND** 新记录被自动选中
- **AND** 组件值更新为新记录 id
- **AND** returnFields 回填执行

#### Scenario: 未启用时无新增入口

- **WHEN** 组件未配置 allowCreate（默认 false）
- **THEN** 选择弹窗不显示"新增"按钮

---

### Requirement: 跳转查看关联记录

数据引用组件 SHALL 支持配置跳转查看（默认开启，配置项 viewLink 可关闭）。

有值且非编辑态时，显示文本 SHALL 可点击跳转至目标记录详情页。

跳转目标 SHALL 基于 sourceFormKey 与记录 id 解析（复用目标表单详情能力）。

#### Scenario: 点击显示文本跳转详情

- **WHEN** 只读态下用户点击 dataPicker 的显示文本
- **AND** 组件值非空
- **THEN** 跳转至目标表单（sourceFormKey）对应记录（id）的详情页

#### Scenario: 关闭跳转后不可点击

- **WHEN** 组件配置 viewLink=false
- **THEN** 显示文本不可点击跳转

---

### Requirement: 引用悬空降级

解析接口（resolve）无法解析引用 id（目标记录已删除）时，组件 SHALL 降级显示：

- 编辑态：该引用值 SHALL 标红提示"引用数据已删除"，不静默；
- 只读态：SHALL 显示原始 id；
- 列表页：SHALL 直接使用 `_text` 缓存值，不发起解析。

悬空引用 SHALL NOT 阻断表单提交（缓存语义，非强一致校验）。

#### Scenario: 编辑态悬空标红

- **WHEN** 编辑态下组件值包含目标表单中已不存在的记录 id
- **THEN** 该值显示为标红提示"引用数据已删除"

#### Scenario: 只读态显示原始 id

- **WHEN** 只读态下组件值包含已删除记录 id 且无 `_text` 缓存
- **THEN** 显示原始 id 文本

#### Scenario: 悬空不阻断提交

- **WHEN** 表单包含悬空引用的 dataPicker 字段并提交
- **THEN** 提交成功（不因悬空返回校验错误）

---

### Requirement: 引用感知

系统 SHALL 提供被引用统计能力：统计全部业务表单 column_config 中 dataPicker 引用（pickerConfig.sourceFormKey）各目标表单的次数，按租户隔离。

表单管理列表 SHALL 为被引用的业务表单显示"被 N 个表单引用"标记。

删除被引用表单时，系统 SHALL 弹出确认警告，提示影响范围（"该表单被 N 个表单引用，删除后引用将无法解析"）。

修改被引用表单的列配置（删除被引用列）时，系统 SHALL 提示影响范围。

数据引用组件配置弹窗的目标表单选择器 SHALL 支持关键字搜索与分类分组。

#### Scenario: 表单列表显示被引用计数

- **WHEN** 业务表单 emp_profile 被表单 A、B 的 dataPicker 字段引用
- **THEN** emp_profile 在表单管理列表显示"被 2 个表单引用"标记

#### Scenario: 删除被引用表单弹出警告

- **WHEN** 用户尝试删除被 2 个表单引用的业务表单 emp_profile
- **THEN** 弹出确认警告提示"该表单被 2 个表单引用，删除后引用将无法解析"
- **AND** 用户确认后才执行删除

#### Scenario: 配置弹窗目标表单搜索

- **WHEN** 用户在数据引用配置弹窗的目标表单选择器中输入关键字
- **THEN** 下拉列表按关键字过滤并分组展示

