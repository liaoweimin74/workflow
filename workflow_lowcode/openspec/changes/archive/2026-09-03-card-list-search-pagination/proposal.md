## Why

页面配置已经支持卡片列表的查询栏和分页设置，但运行时 PageDataCards 只渲染卡片内容，ListCards 也没有查询栏实现，导致配置与实际页面能力不一致。补齐后，卡片列表将与数据表格保持一致的查询、分页体验，并正确将查询条件传递给数据源。

## What Changes

**卡片列表查询栏**
- From: `ListCards` 不接收查询字段，也不渲染查询栏。
- To: 根据 `searchFields` 渲染文本查询输入，支持查询和重置，查询后回到第一页。
- Reason: 使页面配置中的查询字段在卡片列表运行态生效。
- Impact: 非破坏性新增可选组件属性。

**卡片列表分页**
- From: 组件已有基础分页，但未完整透传页面的分页选项。
- To: 对齐 `SearchTable` 支持 `pageSizes`、页码/每页条数变化，并遵循 `pagination` 与设计态隐藏规则。
- Reason: 让卡片和数据表格使用一致的分页配置。
- Impact: 保持既有默认分页行为。

**数据源查询参数**
- From: `PageDataCards.fetchApi` 仅发送 page/size。
- To: 将非空查询字段转换为 PageDataTable 相同的 AND + like filter。
- Reason: 查询条件必须真正作用于数据源。
- Impact: 扩展请求参数，不改变后端协议。

## Capabilities

### New Capabilities
- `card-list-query-pagination`: 卡片列表的查询栏、分页交互及查询参数传递。

### Modified Capabilities
- 无。

## Impact

- 前端组件：`frontend/src/components/business/ListCards.vue`、`frontend/src/views/page/components/PageDataCards.vue`。
- 前端测试：`frontend/src/components/business/__tests__/ListCards.test.ts`，必要时新增 PageDataCards 测试。
- 后端 API 无需修改；继续使用现有数据源分页和 filter 查询协议。
