# Card List Search Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让卡片列表运行态按页面配置显示查询栏和分页，并将查询条件正确传给数据源。

**Architecture:** ListCards 持有查询与分页状态，按 SearchTable 的模式渲染查询栏并调用 `fetchApi({ page, size, ...queryFields })`。PageDataCards 负责把页面配置透传到 ListCards，并在数据源适配层将非空字段转换成 AND/like filter；设计态由父组件覆盖隐藏查询和分页。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, Vitest, Vue Test Utils, Vite。

## Global Constraints

- 查询字段统一使用文本输入，查询条件统一使用 `like`，不新增 `eq`/`range` 配置。
- 查询与重置必须将 page 重置为 1；pagination=false 时不显示分页并请求全量数据。
- 设计态必须隐藏查询栏和分页栏，且预览数据最多 10 条。
- 不修改后端查询协议，不改变卡片布局、分组和操作按钮行为。

---

### Task 1: ListCards 查询栏和分页状态

**Files:**
- Modify: `frontend/src/components/business/__tests__/ListCards.test.ts`
- Modify: `frontend/src/components/business/ListCards.vue:1-160,260-295`

**Interfaces:**
- Consumes: `searchFields?: Array<{ prop: string; label?: string; defaultValue?: unknown }>`, `showSearch?: boolean`, `pageSizes?: number[]`, existing `fetchApi(params: ListQueryParams): Promise<ListPageResult>`。
- Produces: 查询栏 DOM、`fetchData()` 请求参数、`handleSearch()`、`handleReset()`、`handlePageChange(page)`、`handlePageSizeChange(size)` 行为。

- [ ] **Step 1: Write the failing tests**

在现有 `createWrapper` 测试工具中使用带有 `fetchApi` mock 的 ListCards，新增断言：`showSearch=true` 时出现查询输入；点击查询后 mock 收到字段值且 `page=1`；点击分页页码与 page size 后收到对应参数；点击重置后字段为空且 `page=1`。

```ts
const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
const wrapper = createWrapper({
  fetchApi,
  showSearch: true,
  searchFields: [{ prop: 'name', label: '名称' }],
  pageSizes: [10, 20],
})
await flushPromises()
await wrapper.find('input').setValue('订单')
await wrapper.find('.search-card .el-button--primary').trigger('click')
expect(fetchApi).toHaveBeenLastCalledWith(expect.objectContaining({ name: '订单', page: 1 }))
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/components/business/__tests__/ListCards.test.ts`
Expected: FAIL because ListCards currently has no `searchFields`/`showSearch` props or query input.

- [ ] **Step 3: Add the minimal props and query template**

在 `ListCardsProps` 增加 `searchFields`、`showSearch`、`pageSizes`；添加 `query` 初始化和 `hasSearch` computed。查询栏使用 Element Plus `el-card`、`el-form`、`el-input`、查询按钮和重置按钮，输入字段绑定 `query[field.prop]`，仅在 `showSearch && searchFields.length > 0` 时显示。

- [ ] **Step 4: Add query and pagination handlers**

实现 `fetchData` 使用当前 `query`，`handleSearch`/`handleReset`，以及 page/page-size handler。重置时删除动态字段并恢复 `{ page: 1, size: props.defaultPageSize }`；分页事件更新 query 后调用 `fetchData`。保留已有 requestId、loading、error 和 refresh 逻辑。

- [ ] **Step 5: Run the focused tests and commit**

Run: `npx vitest run src/components/business/__tests__/ListCards.test.ts`
Expected: PASS，且原有卡片渲染、加载、错误和分页测试不回归。

```bash
git add frontend/src/components/business/ListCards.vue frontend/src/components/business/__tests__/ListCards.test.ts
git commit -m "feat: add search controls to card lists"
```

### Task 2: PageDataCards 配置和数据源适配

**Files:**
- Modify: `frontend/src/views/page/components/PageDataCards.vue:1-16,53-70,121-132`
- Create or Modify: `frontend/src/views/page/components/__tests__/PageDataCards.test.ts`

**Interfaces:**
- Consumes: 页面配置 `searchFields`、`showSearch`、`pageSizes`、`pagination`、`designMode`。
- Produces: 传给 ListCards 的同名查询/分页属性；`dataSourceApi.queryData(refId, query)` 中的 `filter` JSON。

- [ ] **Step 1: Write the failing adapter test**

挂载 PageDataCards，mock `dataSourceApi.queryData`，让子 ListCards 暴露/触发 fetchApi；传入 `searchFields: [{ key: 'name', label: '名称' }]` 和查询值，断言数据源请求包含：

```ts
expect(JSON.parse(request.filter)).toEqual({
  logic: 'AND',
  conditions: [{ column: 'name', op: 'like', value: '订单' }],
})
```

同时断言 `designMode=true` 传给 ListCards 的 `showSearch` 和 `showPagination` 均为 false。

- [ ] **Step 2: Run the adapter test and verify it fails**

Run: `npx vitest run src/views/page/components/__tests__/PageDataCards.test.ts`
Expected: FAIL because PageDataCards currently neither accepts/forwards search configuration nor includes filter conditions.

- [ ] **Step 3: Add PageDataCards props and ListCards bindings**

在 props 中增加 `searchFields?: any[]`、`showSearch?: boolean`、`pageSizes?: number[]`；ListCards 增加 `:search-fields="searchFields"`、`:show-search="designMode ? false : showSearch"`、`:page-sizes="pageSizes"`。分页绑定改为 `designMode ? false : pagination`，保持原默认值和其他绑定不变。

- [ ] **Step 4: Build filter in fetchApi**

从 params 的 searchFields 读取非空值，兼容配置字段的 `key`/`field`，生成 `{ column, op: 'like', value }`；合并到已有 page/size query 中的 `filter` 字符串。运行态按 pagination 请求 page/size，pagination=false 使用 `size: -1`；designMode 固定 page 1 且 size 不超过 10。

- [ ] **Step 5: Run adapter tests and commit**

Run: `npx vitest run src/views/page/components/__tests__/PageDataCards.test.ts src/components/business/__tests__/ListCards.test.ts`
Expected: PASS。

```bash
git add frontend/src/views/page/components/PageDataCards.vue frontend/src/views/page/components/__tests__/PageDataCards.test.ts
git commit -m "feat: wire card list query configuration"
```

### Task 3: 全量验证

**Files:**
- Verify: `frontend/src/components/business/ListCards.vue`
- Verify: `frontend/src/views/page/components/PageDataCards.vue`
- Verify: related tests and frontend build output

**Interfaces:**
- Consumes: Tasks 1-2 的组件属性、事件和数据源参数约定。
- Produces: 可通过测试、诊断和构建的完整卡片查询分页能力。

- [ ] **Step 1: Run all adjacent tests**

Run: `npx vitest run src/components/business/__tests__/ListCards.test.ts src/views/page/components/__tests__/PageDataCards.test.ts src/views/page/components/__tests__/PageDataTable.test.ts`
Expected: PASS；若 PageDataCards 测试文件不存在，则使用 Task 2 实际创建的测试路径替换。

- [ ] **Step 2: Run diagnostics and build**

Run LSP diagnostics on both modified Vue components and tests；运行 `npm run build` from `frontend`。
Expected: 无新增 TypeScript/Vue 诊断错误，构建退出码为 0。

- [ ] **Step 3: Review diff and commit verification record**

检查 `git diff` 仅包含查询栏、分页透传、filter 适配和测试变更；确认未修改后端协议或无关组件。
