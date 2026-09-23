## Why

现有 `SearchTable` 适合以行列方式展示业务数据，但商品、流程模板、用户、任务等场景需要更强调记录整体信息层级的卡片布局。当前没有与统一数据源、分页、CRUD 和 form-create 设计器协同的卡片列表能力，业务方若自行实现会重复处理查询状态、分页、权限和操作行为。现在补充该能力，可在保持 Element Plus 设计体系和既有表格协议的同时，为代码页面和设计器页面提供一致的卡片展示方式。

## What Changes

新增基于 Element Plus 的 `ListCards` 数据型卡片列表组件：

- 复用 `SearchTable` 的分页查询结果、查询参数、搜索字段、操作按钮和表单配置语义。
- 支持 `fetchApi` 与设计器 `dataSourceId` 数据源入口。
- 以可配置 `columns` 为字段基础，增加标题、副标题、标签、指标、字段布局和值类型等卡片属性。
- 提供响应式卡片网格、卡片点击、操作区、底部分页及 loading/empty/error 状态。
- 支持查看、新增、编辑、删除，并正确处理权限、确认和事件冒泡。
- 新增 form-create/page designer 的结构化卡片列表组件配置，命名为 `page-list-cards`。

首版明确不包括：卡片选择和批量操作、加载更多/无限滚动、虚拟滚动、卡片内部任意嵌套 form-create rule。

## Capabilities

### New Capabilities

- `list-cards-rendering`: 通用数据型卡片列表的查询、响应式展示、状态、分页、字段和卡片操作。
- `form-create-list-cards`: 面向 form-create/page designer 的结构化卡片列表组件及 dataSourceId 配置。

### Modified Capabilities

- 无。现有 `SearchTable`、`page-data-table` 和数据源能力保持兼容；仅复用既有契约，不改变既有需求。

## Impact

- 前端业务组件：新增 `ListCards`、卡片字段类型和必要的共享列表查询契约。
- 页面设计器/form-create：新增 `page-list-cards` 组件注册、属性配置和渲染映射。
- 数据源链路：复用现有统一数据源查询/metadata/CRUD API，不新增独立端点协议。
- 测试：新增组件单元测试、设计器/form-create 配置测试和关键页面渲染回归测试。
- 不新增第三方 UI 依赖，不要求修改现有业务页面的 SearchTable 配置。
