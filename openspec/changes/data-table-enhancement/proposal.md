## Why

当前页面设计器和表单设计器中的数据表格组件（PageDataTable）功能过于简单，仅支持基础的列配置和CRUD操作。用户无法通过属性配置实现排序、筛选、分页等常见功能，也无法自定义操作列按钮。这限制了数据表格在复杂业务场景中的应用，用户需要编写额外代码来实现这些功能。

随着项目的发展，数据表格组件需要支持更丰富的配置和事件绑定能力，以便与其他组件灵活联动，提升开发效率和用户体验。

## What Changes

**PageDataTable 属性配置**
- From: 仅支持 columns、dataSourceId 等基础配置
- To: 支持 sortable、filterable、pagination、selectionMode 等丰富属性
- Reason: 满足常见数据表格功能需求
- Impact: 非破坏性，新增属性均有默认值

**PageDataTable 列配置**
- From: 仅支持 prop、label、width 基础列配置
- To: 支持 sortable、filterable、fixed、formatter、align 等列级属性
- Reason: 提供更灵活的列定制能力
- Impact: 非破坏性，新增属性均有默认值

**PageDataTable 事件绑定**
- From: 仅支持 row-click 事件
- To: 支持 cell-click、selection-change、sort-change、current-change 等事件
- Reason: 满足复杂交互场景需求
- Impact: 非破坏性，新增事件不影响现有功能

**PageDataTable 操作列配置**
- From: 硬编码编辑/删除按钮
- To: 支持自定义按钮配置，包括按钮类型、图标、动作、条件显示等
- Reason: 满足不同业务场景的操作需求
- Impact: 非破坏性，未配置时保持现有默认行为

**配置面板复用**
- From: SearchTable 和 PageDataTable 各自独立的配置逻辑
- To: 通用 TableConfigPanel 组件，统一配置体验
- Reason: 减少重复代码，提升维护性
- Impact: 非破坏性，SearchTable 通过适配层使用

## Capabilities

### New Capabilities

- `table-property-config`: 数据表格属性配置能力，支持表格级和列级属性的可视化配置
- `table-action-config`: 数据表格操作列配置能力，支持自定义按钮和条件显示
- `table-event-binding`: 数据表格事件绑定能力，支持多种事件类型和动作总线联动
- `table-config-panel`: 通用表格配置面板组件，与 SearchTable 复用

### Modified Capabilities

- `page-data-table`: 扩展 PageDataTable 组件，新增属性、事件和操作列配置支持
- `search-table`: 适配通用配置面板，保持现有功能不变

## Impact

### 受影响的代码

- `frontend/src/views/page/components/PageDataTable.vue` - 扩展组件功能
- `frontend/src/views/page/PageDesigner.vue` - 集成配置面板
- `frontend/src/components/business/SearchTable.vue` - 适配通用配置面板
- `frontend/src/components/business/TableConfigPanel.vue` - 新增通用配置组件

### 受影响的 API

- 无 API 变更，纯前端组件增强

### 受影响的依赖

- 无新增依赖

### 受影响的系统

- 页面设计器：新增配置面板入口
- 表单设计器：可复用配置面板（如需要）
