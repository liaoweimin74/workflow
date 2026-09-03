## Design Summary

本变更新增通用 `ListCards` 卡片列表组件，并新增面向页面设计器/form-create 的卡片列表组件类型。组件服务通用业务列表和设计器页面，采用 Element Plus 原语实现数据型卡片：标题区、字段区、操作区。组件复用现有 SearchTable 的分页查询契约和 CRUD 语义，但保持独立渲染实现。

首版范围：

- 支持 `fetchApi`（代码组件）和 `dataSourceId`（设计器组件）两种数据源入口。
- 统一使用 `{ rows, total }` 结果和 `page/size/filter/sort` 查询参数。
- 支持搜索、底部分页、loading/empty/error 状态。
- 使用 `columns` 作为字段基础模型，扩展卡片角色、值类型、布局和显示属性。
- 支持卡片点击 `row-click`，操作按钮独立触发并阻止冒泡。
- 支持新增、编辑、删除、查看，复用现有权限、确认和表单配置语义。
- form-create 使用结构化卡片字段配置，不支持首版任意嵌套 rule。
- 首版不支持卡片选择和批量操作。

## Alternatives Considered

### 方案 A：共享分页数据契约 + 独立 ListCards 渲染组件
- **做法**：抽取或复用轻量列表查询/分页契约；SearchTable 继续负责表格，ListCards 负责 Element Plus 卡片网格、状态、分页和卡片字段渲染。
- **优点**：与现有架构一致；改动隔离；代码组件和设计器组件均可复用；后续可独立增加卡片能力。
- **缺点**：短期存在两个展示组件；需要整理共享类型和少量数据逻辑。
- **为何采用**：在不重构稳定 SearchTable 的前提下实现最大复用，风险和边界最佳。

### 方案 B：先抽象通用 DataList，再由表格和卡片复用
- **做法**：由 DataList 统一管理查询、分页、CRUD、状态和事件，SearchTable/ListCards 仅作为渲染器。
- **优点**：长期统一能力；便于未来增加时间线、看板等展示模式。
- **缺点**：改动范围大；SearchTable 已包含搜索、弹窗、导出和操作等业务职责，重构回归风险高。
- **为何未采用**：超出当前需求，容易引入不必要的架构迁移。

### 方案 C：直接包装 SearchTable 并替换内部渲染
- **做法**：复制或复用 SearchTable 的全部状态与 CRUD 逻辑，只替换 `el-table` 为卡片网格。
- **优点**：原型开发快；现有行为复用较多。
- **缺点**：卡片被迫携带表格语义；卡片专属配置会形成条件分支；设计器模型不清晰。
- **为何未采用**：不利于长期演进，且会放大 SearchTable 的职责耦合。

## Agreed Approach

采用方案 A。ListCards 使用 Element Plus `el-card`、CSS Grid、`el-pagination`、`el-skeleton`、`el-empty` 等原语；以 `cardMinWidth` 驱动响应式列数，避免设计器保存大量断点硬编码。卡片字段复用 `TableColumn` 的 key/label/formatter/hidden 语义，并增加 `role`、`span`、`order`、`valueType` 等属性。form-create 组件命名采用 `page-list-cards`，设计器 JSON 只保存可序列化结构化配置；代码组件可保留 slot/render 作为扩展出口。

## Key Decisions

1. 第一版卡片固定为标题区、字段区、操作区，不开放任意内部 rule。
2. 卡片默认可点击并触发 `row-click`；操作区必须阻止事件冒泡。
3. 分页采用底部分页器，不实现加载更多或无限滚动。
4. 数据源沿用现有统一数据源和 `fetchApi -> { rows, total }` 协议。
5. 支持 CRUD，但不支持选择态、批量动作和虚拟滚动。
6. 首版继续使用 Element Plus，不引入 Ant Design Vue、Naive UI 或 Vuetify。

## Open Questions

- 具体卡片字段扩展属性、默认值和非法配置的降级规则在 design/specs 中明确。
- CRUD 表单及设计器动作总线的复用边界在技术设计中明确。
