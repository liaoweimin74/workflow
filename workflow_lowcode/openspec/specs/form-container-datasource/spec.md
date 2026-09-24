# form-container-datasource Specification

## Purpose
TBD - created by archiving change form-container-datasource. Update Purpose after archive.
## Requirements
### Requirement: FORM 容器组件

系统 SHALL 在表单设计器与页面设计器组件库中提供 FORM 容器组件（type 标识为 `formContainer`），作为可绑定数据源的单对象容器（form-create `subForm: 'object'` 语义）。

FORM 容器组件 SHALL 支持将基础表单组件拖入容器内部，容器内子组件的字段（field）SHALL 为数据源列 key（平铺命名，不加前缀），容器自身字段 SHALL 全局唯一。

FORM 容器组件 SHALL 支持在一个表单中放置多个实例，每个实例 SHALL 独立绑定不同数据源，容器即字段命名空间边界，不同容器内同名字段 SHALL 不冲突（数据模型为 `{ containerField: { name, amount } }`）。

FORM 容器组件 SHALL 支持容器内嵌套子表单容器（object 套 array，如容器内嵌套 group 子表单），嵌套数据 SHALL 作为容器记录对象的数组属性提交。

#### Scenario: 拖入基础组件到容器
- **WHEN** 用户在表单设计器中将 FORM 容器组件拖入画布
- **AND** 将"单行文本"组件拖入容器内部
- **THEN** 单行文本成为容器的子组件
- **AND** 单行文本的字段值为容器记录对象的属性

#### Scenario: 多容器同名字段不冲突
- **WHEN** 表单包含两个 FORM 容器（字段分别为 fc_a 与 fc_b）
- **AND** 两个容器内各有名为 "name" 的子组件
- **THEN** 表单数据模型为 `{ fc_a: { name: "张三" }, fc_b: { name: "李四" } }`
- **AND** 两个 name 字段独立取值互不覆盖

#### Scenario: 容器内嵌套子表单
- **WHEN** 用户向 FORM 容器内拖入 group 子表单（array 容器）
- **AND** 子表单包含字段 product 与 qty
- **THEN** 容器数据模型为 `{ fc_a: { name: "订单", items: [{ product: "A", qty: 2 }] } }`
- **AND** items 数组随容器记录对象一并提交

### Requirement: 容器数据源绑定配置

FORM 容器组件属性面板 SHALL 提供数据源绑定配置：`dataSourceId`（引用全局数据源，选项来自 `GET /api/v1/data-sources/enabled`）与 `recordLocator`（记录定位方式）。

记录定位方式 SHALL 至少支持"当前表单记录"（业务表单编辑场景，以当前记录 ID 回显/保存）。

容器绑定数据源后，属性面板 SHALL 根据数据源 metadata（`GET /api/v1/data-sources/{id}/metadata`）校验容器内子字段存在性：子组件字段不在数据源列中 SHALL 标记非法。

#### Scenario: 配置容器数据源
- **WHEN** 用户选中 FORM 容器组件
- **AND** 在属性面板从已启用数据源下拉中选择一个数据源
- **THEN** 容器 rule 的 props 写入 `dataSourceId`
- **AND** 记录定位默认设为"当前表单记录"

#### Scenario: 校验子字段存在性
- **WHEN** 容器绑定数据源后
- **AND** 容器内某子组件字段不在数据源 metadata 列中
- **THEN** 设计器将该子组件标记为非法字段
- **AND** 提示用户修正

### Requirement: 数据源读取回显

渲染层（FormRenderer/PageRendererPage 共用）SHALL 提供数据源绑定引擎，负责按容器配置从数据源读取记录并回显到容器内组件。

当记录上下文变化（树点击、路由参数变化、联动动作 set-filter）时，引擎 SHALL 解析当前记录 ID，调用 `GET /api/v1/data-sources/{id}/data/{rowId}` 获取记录，并按容器内子字段名映射填充组件值（含嵌套子表单数组）。

引擎 SHALL 为容器级加载状态（loading），避免整表/整表单闪烁。

#### Scenario: 业务表单编辑回显
- **WHEN** 业务表单进入编辑模式
- **AND** 当前记录 ID 已知
- **THEN** 引擎按记录 ID 从数据源加载记录
- **AND** 容器内组件显示记录字段值

#### Scenario: 记录上下文变化刷新
- **WHEN** 页面左侧树节点点击
- **AND** 右侧表单区容器绑定数据源
- **THEN** 引擎重新解析当前记录 ID
- **AND** 重新加载数据源记录并刷新容器内组件值

### Requirement: 数据源写入保存

绑定引擎 SHALL 支持将容器内组件值变化写回数据源：组件值变化时，引擎 SHALL 防抖（300ms）后收集容器绑定字段，调用 `PUT /api/v1/data-sources/{id}/data/{rowId}` 更新记录。

写入 SHALL 携带乐观锁版本（version），版本冲突（后端 400）时 SHALL 提示"数据已被修改，请刷新"并重新加载记录。

容器绑定只读数据源（metadata.writable=false，如 WORKFLOW/SYSTEM 数据源）时，引擎 SHALL 不发起写请求，容器仅回显。

表单整体提交（save-record 动作或业务表单保存）前，引擎 SHALL 强制 flush 未决的防抖写入，确保数据一致。

#### Scenario: 组件值变化实时写入
- **WHEN** 用户在容器内修改某字段值
- **AND** 停止输入超过 300ms
- **THEN** 引擎调用 updateData 将该字段值写回数据源记录
- **AND** 携带乐观锁 version

#### Scenario: 乐观锁冲突
- **WHEN** 引擎写入时后端返回版本冲突
- **THEN** 引擎提示"数据已被修改，请刷新"
- **AND** 重新加载数据源记录
- **AND** 不覆盖本地未确认修改

#### Scenario: 只读数据源不写
- **WHEN** 容器绑定 WORKFLOW 或 SYSTEM 数据源（writable=false）
- **THEN** 引擎不发起任何写请求
- **AND** 容器内组件仅展示数据源记录值

#### Scenario: 表单提交前 flush
- **WHEN** 用户触发表单整体提交
- **AND** 存在未决的防抖写入
- **THEN** 引擎先完成未决写入
- **AND** 再执行提交动作

### Requirement: 数据联动动作总线

系统 SHALL 提供统一数据联动模型（事件总线 + 模板变量 + 动作链），贯穿四层联动：数据源→组件（读回显）、组件→数据源（写保存）、组件→组件（复用 form-create control）、组件→数据源→组件（跨组件联动）。

动作链 SHALL 由触发器与有序动作步骤组成，触发器 SHALL 支持：`field-change`（组件值变化）、`record-change`（记录上下文变化）、`data-source-change`（数据源数据变化）。

动作步骤 SHALL 支持：`set-filter`（为目标数据源追加查询参数）、`refresh`（目标数据源重新取数）、`reload-record`（重新加载当前记录回显）、`set-value`（设置目标组件值）、`save-record`（写回数据源）。

动作值 SHALL 支持模板变量：`{node.id}`（树节点）、`{row.xxx}`（表格行字段）、`{field.xxx}`（表单组件值）、`{record.xxx}`（当前记录字段）、`{param.xxx}`（路由/查询参数）。

页面场景 SHALL 复用现有页面动作总线（`schema.actions`），仅泛化触发器类型；表单场景 SHALL 支持在表单 schema 中配置联动动作链。

#### Scenario: 字段变化触发跨数据源联动
- **WHEN** 表单内"部门"组件（绑定数据源A）值变化
- **AND** 联动配置为 set-filter（目标=人员数据源，field=deptId，value={field.dept}）+ refresh（人员数据源）
- **THEN** 人员数据源按 deptId=部门值重新取数
- **AND** 人员组件选项刷新为过滤后的数据

#### Scenario: 记录变化触发刷新
- **WHEN** 页面树节点点击触发 record-change
- **AND** 动作链包含 set-filter + refresh
- **THEN** 目标数据源按节点 ID 过滤并重新取数
- **AND** 绑定组件显示新数据

#### Scenario: 模板变量解析
- **WHEN** 动作值包含 `{node.id}` 或 `{field.xxx}` 模板变量
- **THEN** 动作执行时模板变量替换为实际上下文值
- **AND** 未知模板变量替换为空字符串

