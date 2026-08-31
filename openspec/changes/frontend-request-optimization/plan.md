# 前端请求优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**Goal:** 减少前端页面加载时的冗余 API 请求（definition×2、data×2、预取过载），通过 props 下传、补发修正、HTTP 去重+短 TTL 缓存、懒加载实现纯前端提速。

**Architecture:** 三层改动——①传输层（utils/http.ts）增加 GET in-flight 去重与显式声明的短 TTL 缓存兜底；②渲染链路（PageRenderer → PageRendererPage）definition 由 props 下传消除重复加载，PageDataTable 补发逻辑收紧为单次；③数据获取时机（用户管理页 orgs 树懒加载、VIEW 页 ds 定义按需获取、roles 缓存复用）。

**Tech Stack:** Vue 3 + TypeScript + Element Plus + axios + vitest

## Global Constraints

- 纯前端改动，不改后端接口契约（用户确认"尽量不动后端"）
- TDD（RED → GREEN → REFACTOR）：每个功能点先写失败测试再实现
- 类型安全：禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- http 缓存仅 GET + 显式 `cache: true` 声明；TTL 缺省 30s；内存级存储（刷新即失效）
- 向后兼容：PageRendererPage 无 `definition` props 回退自行加载；SearchField `onExpand` 可选字段
- 行为约束遵循 openspec specs：http-request-caching / deferred-options-loading / query-page-renderer / page-data-table
- 前端工作目录：`frontend/`（所有路径相对该目录，如 `frontend/src/utils/http.ts`）

---

### Task 1: HTTP 传输层去重与缓存（http-request-caching）

**Files:**
- Modify: `frontend/src/utils/http.ts`
- Modify: `frontend/src/api/page.ts`（getPageByKey 声明缓存）
- Modify: `frontend/src/api/data-source.ts`（getMetadata 声明缓存）
- Modify: `frontend/src/api/org.ts`（getOrgTree 声明缓存）
- Modify: `frontend/src/api/role.ts`（getRoleList 声明缓存）
- Test (create): `frontend/src/utils/__tests__/http-cache.test.ts`

**Interfaces:**
- Consumes: 现有 axios 实例（拦截器链：token 头、401 跳转、错误提示）
- Produces: axios RequestConfig 扩展 `cache?: boolean`、`cacheTtl?: number`；内部 `_inFlight: Map<string, Promise<unknown>>`、`_cache: Map<string, { data: unknown; expiresAt: number }>`；键 = `method + url + 序列化 params`

- [ ] **Step 1: 写失败测试 `frontend/src/utils/__tests__/http-cache.test.ts`**（用 mock adapter 断言网络调用次数）

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
// 从 http.ts 导出 createRequest 或复用实例（按现有导出结构）
// 核心断言：
// 1. 并发同键 GET 仅 1 次网络请求（mock adapter 计数 === 1，两个调用结果相同）
// 2. cache:true + TTL 内第二次调用不触发网络请求（计数仍 1）
// 3. TTL 过期后重新请求（vi.useFakeTimers 推进 30s，计数 2）
// 4. 未声明 cache 的 GET 不读写缓存（两次调用计数 2）
// 5. 请求失败后清理去重键，可重试（首次 reject，二次 resolve，成功）
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/utils/__tests__/http-cache.test.ts`
Expected: FAIL（去重/缓存逻辑不存在）

- [ ] **Step 3: 实现 in-flight 去重**

```ts
// utils/http.ts：在 request 拦截器内、发送前执行
const inFlight = new Map<string, Promise<any>>()
// 命中 inFlight → 直接 return 共享 Promise（不重新发送）
// 未命中 → 包装原始请求，finally 中删除该键
```

- [ ] **Step 4: 实现短 TTL 缓存（仅 cache:true GET）**

```ts
// response 拦截器：GET && config.cache 时写入 responseCache
// request 拦截器：GET && config.cache && 缓存未过期 → return 缓存数据（跳过发送）
// 键序列化与 axios paramsSerializer 输出一致（数组重复键、跳过 undefined/null）
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/utils/__tests__/http-cache.test.ts`
Expected: PASS（5 个用例全绿）

- [ ] **Step 6: 首批接口声明缓存**

在 `page.ts` / `data-source.ts` / `org.ts` / `role.ts` 的对应调用处传 `{ cache: true }`：`getPageByKey(key, { preview: false })`（preview=false 时）、`getMetadata(...)`、`getOrgTree()`、`getRoleList(...)`

- [ ] **Step 7: 运行 http.ts 相关回归测试并提交**

Run: `npx vitest run src/utils`
```
git add frontend/src/utils frontend/src/api
git commit -m "feat(http): GET 并发去重与短 TTL 缓存（http-request-caching）"
```

---

### Task 2: PAGE definition 单次加载（query-page-renderer MODIFIED）

**Files:**
- Modify: `frontend/src/views/page/PageRenderer.vue`（PAGE 分支）
- Modify: `frontend/src/views/page/PageRendererPage.vue`（新增 prop + load 逻辑）
- Modify: `frontend/src/views/page/__tests__/PageRendererPage.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 的缓存能力（getPageByKey 已声明 cache:true，二次挂载可命中缓存）
- Produces: `<PageRendererPage :definition="res.data" />` props；`PageRendererPage.definition?: PageDefinitionDetailDTO`；`load()` 有 props 直接使用、无 props 回退 `getPageByKey(route.params.pageKey)`

- [ ] **Step 1: 写失败测试**

在 PageRendererPage.integration.test.ts 增加用例：
```ts
// 模拟 PageRenderer 已加载定义并通过 props 传入
// 断言：渲染过程中 getPageByKey 调用次数 === 0（组件完全用 props，不自行请求）
// 断言：页面正常渲染 schema 内容
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: FAIL（组件仍自行请求定义）

- [ ] **Step 3: PageRenderer PAGE 分支下传 definition**

```vue
<!-- PageRenderer.vue PAGE 分支 -->
<PageRendererPage v-else-if="page?.type === 'PAGE'" :definition="res.data" />
<!-- 原 PageRendererPage.vue 第 4 行处修改 -->
```

- [ ] **Step 4: PageRendererPage 支持 definition prop 并回退自行加载**

```ts
const props = defineProps<{ definition?: PageDefinitionDetailDTO }>()
async function load() {
  if (props.definition) { def.value = props.definition; return }  // 直接用，不再请求
  // 原回退逻辑：getPageByKey(route.params.pageKey)（兼容直接挂载/测试）
}
```

- [ ] **Step 5: 新增"无 props 直接挂载回退"用例并通过**

补测试：mount 不传 definition → 断言 getPageByKey 调用 1 次且正常渲染
Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```
git add frontend/src/views/page
git commit -m "feat(page): PAGE 定义由 PageRenderer props 下传，消除重复加载"
```

---

### Task 3: page-table 首次 data 单次加载（page-data-table ADDED）

**Files:**
- Modify: `frontend/src/views/page/components/PageDataTable.vue`
- Modify: `frontend/src/views/page/__tests__/PageRendererPage.integration.test.ts`（或同目录新增 data 单次加载用例）

**Interfaces:**
- Consumes: 既有 `activeDsBindings`、`resolvedRefId`、`tableRef.value?.fetchList()`
- Produces: 模块级 `_pendingFirstFetch` 标志；语义：挂载时 refId 为空才置位，bindings 就绪后补发恰一次

- [ ] **Step 1: 写失败测试**

在 PageRendererPage.integration.test.ts 补用例（mock 两个数据源绑定同时就绪的 PAGE 页）：
```ts
// 断言：挂载后 data 请求 `/pages/{key}/data` 恰 1 次（现行为 2 次，等待失败）
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: FAIL（data 请求计数为 2）

- [ ] **Step 3: 实现 `_pendingFirstFetch` 单次补发**

```ts
// PageDataTable.vue：删除 watch(activeDsBindings, ..., { immediate: true }) 的自动补发
let _pendingFirstFetch = false
onMounted(() => { if (!resolvedRefId.value) _pendingFirstFetch = true })
watch(activeDsBindings, () => {
  if (_pendingFirstFetch && resolvedRefId.value) {
    _pendingFirstFetch = false
    nextTick(() => tableRef.value?.fetchList())
  }
})
// 挂载时 refId 已就绪：SearchTable 挂载请求即首次请求，不补发
```

- [ ] **Step 4: 运行测试通过 + 补"延迟就绪补发一次"用例**

Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: PASS（含新增"绑定延迟就绪补发恰 1 次"用例）

- [ ] **Step 5: 提交**

```
git add frontend/src/views/page/components/PageDataTable.vue frontend/src/views/page/__tests__
git commit -m "fix(page-table): 首次 data 请求单次触发（_pendingFirstFetch）"
```

---

### Task 4: VIEW 数据源定义懒加载（query-page-renderer ADDED）

**Files:**
- Modify: `frontend/src/views/page/PageRenderer.vue`（VIEW 分支 load + ensureBoundDataSource）
- Modify: `frontend/src/views/page/__tests__/PageRendererPage.integration.test.ts`（VIEW 场景）

**Interfaces:**
- Consumes: `boundDataSource` ref、`getDataSource`（data-source.ts）、openDetail/openCreate/openEdit/openFormContainer 方法
- Produces: `async function ensureBoundDataSource(): Promise<void>`（null 时加载并赋值）；open 系列入口前置 `await` 调用

- [ ] **Step 1: 写失败测试（VIEW 首屏不发 ds 定义请求）**

```ts
// 渲染 VIEW 页（如 emp_view_e2e）
// 断言：首屏请求仅 definition + metadata + data（不含 /data-sources/{id}）
// 断言：点击"查看"后先发起 /data-sources/{id} 再渲染表单
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: FAIL（首屏即发起 ds 定义请求）

- [ ] **Step 3: 修改 load() 与新增 ensureBoundDataSource()**

```ts
// PageRenderer.vue VIEW 分支 load()：移除 getDataSource，仅保留 getMetadata
const ensureBoundDataSource = async () => {
  if (!boundDataSource.value) {
    const ds = await getDataSource(/* metadata 中的 dataSourceId */)
    boundDataSource.value = ds
  }
}
// openDetail / openCreate / openEdit / openFormContainer：进入前 await ensureBoundDataSource()
```

- [ ] **Step 4: 运行测试通过**

Run: `npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts`
Expected: PASS（首屏无 ds 定义请求；打开表单前就绪；已加载不重复请求）

- [ ] **Step 5: 提交**

```
git add frontend/src/views/page/PageRenderer.vue frontend/src/views/page/__tests__
git commit -m "feat(page): VIEW 数据源定义按需加载（ensureBoundDataSource）"
```

---

### Task 5: 选项延迟加载（deferred-options-loading）

**Files:**
- Modify: `frontend/src/components/business/types.ts`（SearchField 类型）
- Modify: `frontend/src/components/business/SearchTable.vue`（tree-select @visible-change）
- Modify: `frontend/src/views/system/user/UserPage.vue`（ensureOrgTree + roles 缓存声明）
- Test (create): `frontend/src/components/business/__tests__/onExpand.test.ts` 或并入现有 SearchTable 测试

**Interfaces:**
- Consumes: Task 1 缓存（getOrgTree/getRoleList 已声明）
- Produces: `SearchField.onExpand?: () => void | Promise<void>`；`UserPage.ensureOrgTree()`（带 `_treeLoaded` 标志）；orgs 字段配置 `onExpand: ensureOrgTree`

- [ ] **Step 1: 写失败测试（SearchTable onExpand 触发）**

```ts
// mount SearchTable，配置含 onExpand 的 tree-select 查询字段
// 断言：首次 trigger tree-select 展开（visible-change true）→ onExpand 调用恰 1 次
// 断言：树数据已加载后再次展开 → 不重复调用
// 断言：未配置 onExpand 的字段 → 不报错、行为不变
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/business`
Expected: FAIL（onExpand 未触发）

- [ ] **Step 3: types.ts 扩展 SearchField + SearchTable 挂载事件**

```ts
// types.ts SearchField 新增可选字段
onExpand?: () => void | Promise<void>
```
```vue
<!-- SearchTable.vue el-tree-select 处（约 28 行） -->
<el-tree-select
  ...
  @visible-change="(v: boolean) => {
    if (v && !field.treeProps?.data?.length && field.onExpand) field.onExpand()
  }"
/>
```

- [ ] **Step 4: UserPage orgs 懒加载 + roles 缓存声明**

```ts
// UserPage.vue
let _treeLoaded = false
const ensureOrgTree = async () => {
  if (_treeLoaded) return
  _treeLoaded = true           // 置位后再拉取，防并发重复
  treeData.value = await getOrgTree()
}
// orgs 搜索字段配置 onExpand: ensureOrgTree；表单打开时若未加载则 await ensureOrgTree()
// roles 请求处：getRoleList({ page: 1, size: 999, ... }, { cache: true })（或按 api 现有签名声明）
```

- [ ] **Step 5: 运行测试通过 + 提交**

Run: `npx vitest run src/components/business`
```
git add frontend/src/components/business frontend/src/views/system/user
git commit -m "feat(user): 组织树懒加载与角色列表缓存复用（deferred-options-loading）"
```

---

### Task 6: 回归验证

**Files:** 无（验证命令）

- [ ] **Step 1: 运行全量相关测试**

Run: `npx vitest run src/utils src/views/page src/components/business`
Expected: 全部 PASS（PageRendererPage.integration / container 必须过）

- [ ] **Step 2: 类型检查与构建**

Run: `npx vue-tsc --noEmit`（或项目 package.json 对应 script，如 `npm run typecheck`）; `npm run build`
Expected: 无类型错误、构建成功

- [ ] **Step 3: 手工验证（可选，若应用可启动）**

- 打开 /page/page2 → Network 面板确认 definition 1 次、data 1 次
- 打开 /page/emp_view_e2e → 首屏无 /data-sources/{id}，点"查看"后才出现
- 打开用户管理页 → 首屏无 /orgs/tree，展开搜索树才出现；roles 仅 1 次且切页后命中缓存