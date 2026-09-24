# data-picker Specification

## Purpose
数据引用组件：表单字段从已发布业务表单选取数据（存 id 引用 + `_text` 展示缓存），支持过滤条件、级联、允许新增、跳转查看与引用感知。
TBD - created by archiving change data-picker-v2. Update Purpose after archive.
## Requirements
### Requirement: 数据引用组件可视化配置

表单设计器 SHALL 提供"数据引用"（dataPicker）组件，用户 SHALL 能通过可视化配置弹窗完成数据源配置。

配置弹窗 SHALL 支持：选择目标业务表单（仅列出已发布 BUSINESS 类型表单）、选择显示字段（目标表单非隐藏列）、选择弹窗列表列（目标表单非隐藏列）、选择模式（单选/多选）。

配置弹窗 SHALL 支持配置级联依赖（当前表单字段 + 目标表单列），级联依赖可选。

配置结果 SHALL 以 rule props 形式存入表单 schema，包含 sourceFormKey、displayField、columns、mode、filters、clearOnCascadeChange、allowCreate、viewLink 字段。

#### Scenario: 配置数据引用组件

- **WHEN** 用户在设计器中拖入"数据引用"组件并打开配置弹窗
- **AND** 选择目标表单 emp_profile、显示字段 name、列表列 [name, dept]、单选模式
- **THEN** 组件 rule props 写入 sourceFormKey=emp_profile、displayField=name、columns=[name,dept]、mode=single

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

组件 SHALL 支持级联：配置了依赖条件（filters 中 valueType=field 的条目，或兼容形态 dependOn）时，依赖字段值变化 SHALL 刷新选项列表（以依赖字段值作为 filter 查询目标表）。

级联行为 SHALL 由 clearOnCascadeChange 配置控制（默认 false）：
- 为 false 时，依赖字段值变化 SHALL 保留当前选择值，仅刷新选项列表；
- 为 true 时，依赖字段值变化 SHALL 清空当前选择值，并刷新选项列表。

组件 SHALL 支持清除：清空选择时 SHALL 清空组件值。

#### Scenario: 单选选择记录

- **WHEN** 用户打开选择弹窗并点击一条记录
- **THEN** 组件值更新为该记录 id
- **AND** 输入框显示该记录显示字段文本
- **AND** 弹窗关闭

#### Scenario: 多选选择记录

- **WHEN** 用户以多选模式勾选多条记录并点击确定
- **THEN** 组件值更新为多个 id（逗号分隔）
- **AND** 输入框显示多条显示文本（逗号分隔）

#### Scenario: 级联依赖刷新（默认保留已选值）

- **WHEN** 用户修改依赖字段的值
- **AND** 组件配置了依赖条件且 clearOnCascadeChange=false（默认）
- **THEN** 当前选择值被保留
- **AND** 选项列表按新依赖值重新查询

#### Scenario: 级联依赖刷新（配置清空）

- **WHEN** 用户修改依赖字段的值
- **AND** 组件配置了依赖条件且 clearOnCascadeChange=true
- **THEN** 当前选择值被清空
- **AND** 选项列表按新依赖值重新查询

#### Scenario: 清除选择

- **WHEN** 用户点击输入框清除按钮
- **THEN** 组件值清空

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

### Requirement: 筛选条件配置

数据引用组件 SHALL 支持配置筛选条件（filters），结构化格式 `{logic, conditions}`：logic 为 AND（所有满足，默认）或 OR（任一满足），每条 condition 包含目标表单列（column）、操作符（op）与值。

值来源 SHALL 支持两种：
- 固定值（value）：直接作为查询过滤条件；
- 表单字段（field）：动态引用当前表单某个字段的值，字段值变化时作为查询过滤条件刷新选项。

操作符 SHALL 支持：eq（等于）、ne（不等于）、like（包含）、in（属于，值逗号分隔为数组）、isEmpty（为空）、isNotEmpty（不为空）。

配置弹窗 SHALL 提供筛选条件编辑器：AND/OR 切换、动态行添加/删除条件，每行配置目标列、操作符、值来源（固定值/表单字段）与值（固定值时输入，表单字段时选择当前表单字段）。

搜索 SHALL 支持配置搜索列（searchColumns）：目标表单列多选（默认仅显示字段），弹窗搜索框按所选列模糊匹配，多列以 / 分隔提示。

兼容性：运行时 SHALL 归一化兼容 v1 的 dependOn 配置（等价于单条 field 型 eq 条件）与 v2 的数组型 filters（valueType static/field），结构化 filters 存在时优先使用。

发布校验 SHALL 验证 filters 中每条 column 存在于目标表单 column_config（非 hidden 列），校验失败返回 400 并提示具体缺失项。

#### Scenario: 配置固定值筛选条件

- **WHEN** 用户在配置弹窗添加筛选条件：目标列 status、操作符 eq、固定值 active
- **THEN** rule props 的 filters 包含 {"logic":"AND","conditions":[{"column":"status","op":"eq","value":"active"}]}

#### Scenario: 配置字段动态筛选条件

- **WHEN** 用户在配置弹窗添加筛选条件：目标列 dept、操作符 eq、表单字段 dept_field
- **THEN** rule props 的 filters 包含 {"logic":"AND","conditions":[{"column":"dept","op":"eq","field":"dept_field"}]}

#### Scenario: 配置 OR 与非等值操作符

- **WHEN** 用户在配置弹窗设置 logic=OR 并添加条件 status ne closed、dept isEmpty
- **THEN** rule props 的 filters 包含 {"logic":"OR","conditions":[{"column":"status","op":"ne","value":"closed"},{"column":"dept","op":"isEmpty"}]}

#### Scenario: 配置搜索列

- **WHEN** 用户在配置弹窗选择搜索列 name、dept
- **THEN** rule props 的 searchColumns 包含 ["name","dept"]
- **AND** 弹窗搜索框提示为"搜索姓名/部门"

#### Scenario: 筛选条件参与选项查询

- **WHEN** 用户打开选择弹窗且组件配置了固定值筛选条件 status=active
- **THEN** 选项列表仅返回目标表单中 status=active 的记录

#### Scenario: 字段动态筛选条件联动刷新

- **WHEN** 用户修改当前表单字段 dept_field 的值
- **AND** 组件配置了 field 型筛选条件
- **THEN** 选项列表按新值重新查询

#### Scenario: 发布校验筛选条件引用列

- **WHEN** 发布 schema 含 dataPicker 且 filters 中某条 column 已不在目标表单 column_config
- **THEN** 系统返回 400，提示筛选条件引用列已不存在

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

快速创建提交成功 SHALL：刷新选项列表 → 自动选中新创建的记录 → 更新组件值。

权限 SHALL 沿用 v1 数据范围策略（能管理目标表单即能新增）。

#### Scenario: 启用允许新增后现场创建

- **WHEN** 用户在配置弹窗开启 allowCreate
- **THEN** 选择弹窗显示"新增"按钮

#### Scenario: 新增记录并自动选中

- **WHEN** 用户在选择弹窗点击"新增"并填写目标表单提交
- **THEN** 选项列表刷新
- **AND** 新记录被自动选中
- **AND** 组件值更新为新记录 id

#### Scenario: 未启用时无新增入口

- **WHEN** 组件未配置 allowCreate（默认 false）
- **THEN** 选择弹窗不显示"新增"按钮

---

### Requirement: 已选值 Tag 展示与记录详情弹窗

dataPicker 字段有已选值时，SHALL 以 Tag 形式展示每条被引用记录（替代文本输入框），Tag 文本为显示字段值。

编辑态 Tag SHALL 右上角提供 x 角标，点击 SHALL 移除该条引用：
- 单选：移除后组件值清空，回到可点击输入框形态；
- 多选：剔除该 id 保留其余，并同步回写 `_text` 展示缓存。

只读态 Tag SHALL 无 x 角标（不可移除）。

点击 Tag 主体 SHALL 打开记录详情弹窗（默认开启，配置项 viewLink 可关闭）：弹窗 SHALL 加载目标记录（基于 sourceFormKey 与记录 id）并展示目标表单非隐藏列的各字段值（label 为列中文名）。

编辑态已选值时，Tag 旁 SHALL 提供"选择"按钮用于重新打开选择弹窗。

#### Scenario: 编辑态已选值显示 Tag 并可移除

- **WHEN** 编辑态下 dataPicker 值包含记录 t1（显示"张三"）
- **THEN** 组件显示 Tag"张三"（右上角 x 角标）
- **AND** 点击 x 后值清空并回到输入框形态

#### Scenario: 多选移除单个 Tag 保留其余

- **WHEN** 多选模式下值包含 t1,t2（显示"张三,李四"）且点击第一个 Tag 的 x
- **THEN** 组件值更新为 t2、展示缓存更新为"李四"

#### Scenario: 点击 Tag 打开记录详情弹窗

- **WHEN** 用户点击已选记录 Tag
- **AND** 组件配置 viewLink=true（默认）
- **THEN** 打开详情弹窗并展示目标记录各字段（如"姓名：张三"）

#### Scenario: 关闭 viewLink 后 Tag 不可点击

- **WHEN** 组件配置 viewLink=false
- **THEN** 点击 Tag 不打开详情弹窗

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

### Requirement: DataPicker SHALL reference data source via dataSourceId

DataPicker 组件 SHALL 通过 `dataSourceId`（页面内数据源标识）引用数据源，不再直接选择表单。

#### Scenario: DataPicker 配置包含 dataSourceId
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 提供 dataSourceId 字段，值为页面数据源绑定中的 id

#### Scenario: DataPicker 不再包含 sourceFormKey
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL NOT 包含 sourceFormKey 字段（直接选表单）

---

### Requirement: DataPicker filter SHALL support component-level override

DataPicker 组件 SHALL 支持组件级 filter 配置，可覆盖或补充数据源级 filter。

#### Scenario: DataPicker 配置组件级 filter
- **WHEN** 配置 DataPicker 组件时提供 filter 字段
- **THEN** SHALL 使用该 filter 与数据源级 filter 合并（AND 方式）

#### Scenario: DataPicker 不配置组件级 filter
- **WHEN** 配置 DataPicker 组件时未提供 filter 字段
- **THEN** SHALL 仅使用数据源级 filter（如有）

---

### Requirement: DataPicker SHALL retain display and behavior configuration

DataPicker 组件 SHALL 保留 displayField、columns、searchColumns、maxCount 等显示和行为配置。

#### Scenario: DataPicker 显示配置
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 支持 displayField（显示字段）、columns（列表列）、searchColumns（搜索列）配置

#### Scenario: DataPicker 行为配置
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 支持 maxCount（最多可选数）、clearOnCascadeChange（级联变化清空）、allowCreate（允许新增）、detailReadonly（详情只读）配置

