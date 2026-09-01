## Context

项目已有 Vue 3 + Element Plus 的 `SearchTable`，统一处理搜索、分页、数据源查询、CRUD 表单和操作按钮；页面设计器通过 `PageDataTable`、`FormRenderer` 及 dataSource binding 使用同一套数据源能力。`SearchTable` 面向行列数据，不适合强调单条记录信息层级的卡片布局。本变更需要同时服务代码页面和 form-create/page designer，且不能引入第二套 UI 体系或破坏现有表格。

## Goals / Non-Goals

**Goals:**

- 新增独立 `ListCards` 渲染组件，复用统一分页查询契约和既有 CRUD 语义。
- 支持数据型卡片的标题区、字段区、操作区，以及响应式网格和底部分页。
- 支持 `fetchApi` 与 `dataSourceId`，并让 form-create 配置保持可序列化。
- 统一处理 loading、empty、error、点击事件、权限、确认和刷新。
- 为组件和设计器配置建立可测试的稳定类型边界。

**Non-Goals:**

- 不重构完整 `SearchTable` 为通用 DataList。
- 不实现卡片选择、批量操作、加载更多、无限滚动或虚拟滚动。
- 不支持卡片内部任意嵌套 form-create rule。
- 不新增数据源后端端点或第三方 UI 依赖。

## Decisions

### 1. 独立渲染组件，共享轻量契约

`ListCards` 独立管理卡片网格和展示状态；查询结果使用 `rows/total`，查询参数使用 `page/size/filter/sort`。对 `SearchTable` 的共享以类型/协议和可复用小逻辑为边界，避免复制或重构其搜索表单和弹窗实现。

### 2. Element Plus 原语

使用 `el-card`、CSS Grid、`el-pagination`、`el-skeleton`、`el-empty` 和项目现有消息/对话框能力。响应式布局优先保存 `cardMinWidth`，由 `auto-fill/minmax` 计算列数；不要求设计器保存每个断点的硬编码列数。

### 3. 字段模型向后兼容扩展

卡片字段复用 `TableColumn` 的 key、label、formatter、hidden、width 等基础语义，增加 `role`、`span`、`order`、`valueType`、prefix、suffix、color、truncate 等属性。`role` 决定标题、副标题、普通字段、标签、头像或指标位置；未指定时默认为普通字段。函数型 render/slot 仅供代码组件，设计器只保存结构化属性。

### 4. CRUD 与事件

默认动作沿用 SearchTable 的编辑、删除和 formConfig 语义，查看动作打开只读详情；自定义 actionButtons 继续支持显示条件、权限、确认和回调。卡片可点击时触发 `row-click`，操作区事件必须阻止冒泡。设计器侧通过 dataSourceId 解析全局数据源并复用现有动作总线/数据源写 API。

### 5. form-create 采用结构化配置

注册 `page-list-cards`。其 props 保存数据源、分页、网格、字段和动作等 JSON 数据，不保存函数和任意 rule。代码组件保留 slots/render 作为非设计器扩展出口。

## Risks / Trade-offs

- **[字段模型与表格模型耦合]** → 只复用稳定基础字段，卡片专属属性采用独立可选字段，并为非法 role/重复 title 做确定性降级。
- **[SearchTable CRUD 行为不完全可抽取]** → 首版通过现有 ActionButton/FormConfig 接口复用语义，不迁移 SearchTable 内部实现。
- **[卡片高度不一致]** → 字段区使用统一间距和 truncate，允许配置 `minHeight`；不承诺瀑布流布局。
- **[数据源切换残留旧数据]** → dataSourceId/fetchApi 变化时清空或标记旧记录，重置页码并重新请求。
- **[错误与重试不一致]** → error 状态提供重试入口，重新查询前保留当前查询条件；请求竞态以最新请求为准。

## Migration Plan

1. 新增类型/渲染组件及单元测试，不改现有 SearchTable 调用方。
2. 新增 form-create 组件注册和页面设计器映射，旧 schema 保持不变。
3. 通过新组件逐步替换需要卡片展示的页面；失败时可回退到 SearchTable 或原 page-table。
4. 后续如需选择/批量或虚拟滚动，另行扩展 capability，避免改变首版契约。

## Open Questions

- 具体 CRUD 表单规则如何由 metadata 生成，沿用现有 PageDataTable/FormRenderer 实现并在任务中验证。
- 是否将查询状态进一步抽取为 composable，首版以最小共享边界为准，避免影响 SearchTable。
