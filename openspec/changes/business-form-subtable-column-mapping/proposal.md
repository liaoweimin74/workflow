# Proposal: BUSINESS 表单子表列映射

## Why

BUSINESS（物理表模型）表单当前拒绝任何子表组件发布（`UNSUPPORTED_COMPONENTS` 名单拦截），但 form-create 的 `group`/`tableForm`/`subForm` 子表组件在 WORKFLOW 表单已实测全链路可用（设计/渲染/只读/数据往返），能力割裂。且现有拦截名单（`subTable`/`nestedForm`/`dataTable`）与实际类型名不匹配，属历史遗留，校验形同虚设且无法引导用户。本变更将子表能力扩展至 BUSINESS 表单，以独立子表物理表（简道云式 1:N）持久化，使业务表单支持真实子表行数据（如报销明细、订单明细），对齐简道云产品语义。

## What Changes

**子表组件发布校验**
- From: `validateBusinessSchema` 以不匹配名单拒绝子表组件，报错"暂不支持子表/嵌套表单组件"
- To: 名单修正后 `group`/`tableForm` 走子表列映射分支，`subForm` 映射 JSON 列；`userPicker`/`deptPicker`/`divider`/`groupContainer` 仍拒绝
- Reason: 名单与 form-create 实际类型名不符，且子表能力已实测可用
- Impact: 非破坏性；此前被拦的表单现在可发布

**子表持久化（新增）**
- From: BUSINESS 表单无子表概念，子表数据无处落库
- To: 子表字段映射为独立物理表 `wf_biz_<formKey>_<field>`（1:N，`biz_id` 关联主表行，`sort_no` 保序）；主表 CRUD 默认内嵌子表数组 JSON 往返，同时提供独立子表行 CRUD 接口，传输方式由 `subMode` 配置切换；更新采用增量 diff
- Reason: 支持真实子表行数据，贴近简道云语义
- Impact: 非破坏性；旧表单 column_config 无 `subColumns` 字段，行为不变

**前端列映射 UI**
- From: `ColumnConfigDialog` 将子表组件标记为 unsupported 并从映射中过滤
- To: 子表字段以可展开行呈现，支持子列映射配置（复用现有列映射控件）与传输方式选择
- Reason: 发布需在 UI 层完成子表列配置
- Impact: 非破坏性；仅新增配置能力

## Capabilities

### New Capabilities
- `business-form-subtable`: BUSINESS 表单子表字段的物理表持久化（独立子表建表/结构变更）、主表 CRUD 内嵌子表数据往返与增量 diff、独立子表行 CRUD 接口、传输方式配置

### Modified Capabilities
- `business-form-data`: 移除"发布时拒绝子表/嵌套表单组件"的限制，改为支持子表组件（group/tableForm 映射独立子表，subForm 映射 JSON 列）

## Impact

- **后端**：`FormDefinitionService`（校验名单、发布流程）、`ColumnTypeMapper`（subForm→JSON、group/tableForm 不再拦截）、`DdlBuilder`（子表建表/变更 SQL）、`DynamicTableManager`（子表 ensureTable）、`BizDataService`（子表写入/读取/diff/级联删除）、新增子表行 CRUD 接口；`ColumnConfig` 增加 `subColumns`/`subMode` 字段
- **前端**：`ColumnConfigDialog.vue`（子表子列配置 UI、名单修正）、可能涉及 `BizDataListPage.vue` 子表数据显示
- **数据库**：发布含子表表单时动态创建 `wf_biz_<formKey>_<field>` 表；无 schema 迁移（`subColumns` 为可选字段）
- **API**：新增 `GET/POST/PUT/DELETE /api/v1/biz-data/{formKey}/{id}/sub/{field}[/{rowId}]`；主表 GET 响应视 `subMode` 内嵌子表数组
- **依赖**：无新增（纯后端 + 现有前端组件）
