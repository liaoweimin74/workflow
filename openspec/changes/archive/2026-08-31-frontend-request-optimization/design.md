## Context

前端页面加载存在三类冗余 API 请求，影响页面首屏速度：

1. **结构性重复**：`PageRenderer.vue`（/page/:pageKey 渲染宿主）在 `load()` 中先 `getPageByKey` 获取 definition 判断页面类型，PAGE 类型分支渲染 `PageRendererPage` 后即 return 丢弃结果；`PageRendererPage.vue` 在 `onMounted(load)` 中**再次** `getPageByKey`。导致 PAGE 页 definition 请求 ×2（实测 /page/page2）。

2. **就绪双触发**：`PageDataTable.vue`（page-table 组件）内部 SearchTable `onMounted → fetchList()` 发出 data 请求；同时 `watch(activeDsBindings, {immediate:true})`（第 413-420 行）在绑定就绪后 `nextTick → fetchList()` **再发一次**。由于 PageRendererPage.load() 渲染规则前已同步 `setActiveDsBindings`，挂载时绑定几乎总有值 → data 请求 ×2（实测 /page/page2）。注意 `fetchApi`（第 422-424 行）已处理"refId 未就绪返回空不发请求"，补发机制实际只需覆盖"挂载时未就绪"的场景。

3. **预取过载**：
   - `UserPage.vue` `onMounted` 中 `Promise.all([getOrgTree(), getRoleList({page:1,size:999})])` 无差别预取，即使从不展开搜索树/打开表单也会发出；
   - `RolePage.vue` `onMounted` 预取 `getMenuTree()`，而菜单树仅"分配菜单"弹窗的 `el-tree` 使用（`handleAssignMenu` 是自有 action 按钮 handler，可拦截）；
   - `MenuPage.vue` 挂载时 `getMenuTree` 请求 ×2（`onMounted` 拉一次维护 `list.value`，SearchTable 挂载 `fetchApi` 又拉一次——而 `fetchApi` 本身已维护 `list.value`，onMounted 属纯重复），且 `loadPublishedPages()` 挂载预取，已发布页面列表仅表单"关联页面"下拉选项使用；
   - `PageRenderer.vue` VIEW 分支 `load()` 中 `Promise.all([getMetadata, getDataSource])`，而 ds 定义（`getDataSource`，反查 formKey）仅在打开详情/编辑表单时才实际使用。

4. **传输层裸奔**：`utils/http.ts` 仅含 token/租户头与错误提示，无 in-flight 去重、无响应缓存 —— 同 tick 重复请求无任何机制拦截。

**约束**：纯前端改动，不动后端接口契约（用户确认"尽量不动后端"）。

## Goals / Non-Goals

**Goals:**
- 消除结构性重复：PAGE 页 definition 请求从 ×2 收敛为 ×1
- 消除就绪双触发：page-table 首次 data 请求从 ×2 收敛为 ×1
- 延迟非首屏必需请求：用户管理 orgs 树改为展开搜索树时才拉；VIEW 页 ds 定义改为打开表单时才取；角色管理分配菜单树改为首次点"分配菜单"时才拉；菜单管理已发布页面列表改为首次打开表单时才拉
- 消除菜单管理页同页重复挂载请求：/menus/tree 从 ×2 收敛为 ×1
- 传输层兜底：http.ts 增加 GET in-flight 去重与短 TTL 缓存，覆盖未来新增的重复触发
- 保持向后兼容：PageRendererPage 无 definition props 时回退自行加载；SearchField 新字段可选；FormConfig 新字段可选

**Non-Goals:**
- 不改后端：不新增 bootstrap 聚合端点、不修改 `/users` 返回结构、definition 不内嵌 metadata
- 不消除 roles 首屏请求（角色列 ID→名称映射必须全量角色数据，不动后端约束下无法移除，仅叠加缓存复用）
- 不做路由级构建时预取、Service Worker 缓存等 P2 架构级优化
- 不重构 PageRenderer/PageRendererPage 的渲染架构（仅调整数据获取时机）

## Decisions

### D1：definition 单次加载（PageRenderer → props 下传）

- `PageRenderer.vue`：PAGE 分支渲染 `<PageRendererPage :definition="res.data" />`，把已取到的 `PageDefinitionDetailDTO` 下传。
- `PageRendererPage.vue`：新增 prop `definition?: PageDefinitionDetailDTO`；`load()` 开始时若有 props 直接使用（解析 schema / 渲染），否则回退 `getPageByKey`（兼容测试直接 mount 场景）。preview 语义不变（PageRenderer 已按 `route.query.preview` 取定义，下传结果即最终定义）。
- pageKey 切换：PageRenderer watch 置 `page.value = null` → `v-if` 销毁重建 PageRendererPage（重新挂载拿到新 props）；PageRendererPage 内部 `watch(route.params.pageKey)` 保留为回退分支兜底。
- **备选（未采用）**：PageRendererPage 改为通过 inject/provide 接收 definition —— 增加隐式契约，不如 props 直观。

### D2：data 单次加载（PageDataTable 补发条件收紧）

- 删除 `watch(activeDsBindings, ..., { immediate: true })` + `nextTick(fetchList)` 的自动补发。
- 改为：
  ```ts
  let _pendingFirstFetch = false
  onMounted(() => { if (!resolvedRefId.value) _pendingFirstFetch = true })
  watch(activeDsBindings, () => {
    if (_pendingFirstFetch && resolvedRefId.value) {
      _pendingFirstFetch = false
      nextTick(() => tableRef.value?.fetchList())
    }
  })
  ```
- 语义：挂载时 refId 已就绪 → SearchTable 挂载请求即首次请求（不再补发）；挂载时未就绪 → SearchTable 空返回（无请求），bindings 就绪后补发一次（保留原兜底能力）。任何情况下首次 data 最多 1 次。
- 回归验证：`PageRendererPage.integration.test.ts` 已覆盖"首次 data 加载"场景，必须跑通。

### D3：http.ts 传输层增强（In-flight 去重 + 短 TTL 缓存）

- 扩展 axios config 类型（module augmentation）：`cache?: boolean`、`cacheTtl?: number`。
- **In-flight 去重**：所有 GET 按 `url + 序列化 params` 为键，并发同键共享同一 Promise，完成后删除。
- **短 TTL 缓存**：仅 GET 且 `cache: true` 显式声明时启用；内存 Map 存储 `{ data, expiresAt }`，TTL 默认 30s（`cacheTtl` 可覆盖）。
- **首批启用缓存的调用点**：`pageApi.getPageByKey`（preview=false）、`dataSourceApi.getMetadata`、`getOrgTree`、`getRoleList`。
- 注意：序列化须与 axios `paramsSerializer` 保持一致（数组重复键、跳过 undefined/null），保证去重键稳定。

### D4：用户管理组织树懒加载

- `SearchField` 类型扩展可选 `onExpand?: () => void | Promise<void>`。
- `SearchTable.vue` 的 `el-tree-select` 渲染处（第 28 行）挂 `@visible-change`：展开（`visible === true`）且 `treeProps.data` 为空时调用 `field.onExpand()`。
- `UserPage.vue`：orgs 搜索字段配 `onExpand` → 首次展开时 `getOrgTree()`；表单中 `orgId` 字段的 treeSelect 在打开表单时若数据为空则补拉。抽成共享 `ensureOrgTree()`（带"已加载/加载中"标志，避免并发重复拉取）。

### D5：roles 保留首屏 + 缓存复用

- 角色列 `#roles` slot 渲染依赖 `roleList` 做 `roleIds → roleName` 映射，全量角色数据无法在不动后端约束下移除。
- 保留 `onMounted` 拉取 `getRoleList({ page: 1, size: 999 })`，叠加 D3 的 TTL 缓存 + 并发去重：跨页面（角色管理、审批人选择器）复用；同一次渲染重复触发去重。

### D6：VIEW 页 ds 定义懒加载

- `PageRenderer.vue` `load()`：VIEW 分支去掉 `getDataSource`，仅保留 `getMetadata`（列定义 + writable 标记，挂载时决定操作按钮显隐与排序能力，仍需挂载取）。
- 新增 `ensureBoundDataSource()`：`boundDataSource` 为 null 时 `getDataSource` 并赋值。`openDetail` / `openCreate` / `openEdit` / `openFormContainer` 进入前 `await ensureBoundDataSource()`（`isFormDetail` 判定前置）。

### D7：角色管理分配菜单树懒加载

- `RolePage.vue` 删除 `onMounted` 的 `getMenuTree` 预取；`handleAssignMenu` 内改为 `await ensureMenuTree()`（页面级 `_menuTreeLoaded` 标志，防并发重复）后再 `getRoleMenus` 并打开弹窗。
- `getMenuTree` **不加入** D3 首批 TTL 缓存：菜单管理页可增删改菜单，30s TTL 内存在陈旧风险（分配弹窗展示旧树）；页面级"单次加载"标志已满足去重需求且生命周期随页面销毁自然重置。
- **备选（未采用）**：依赖 http 缓存去重 —— 缓存粒度全局、菜单数据可变，陈旧风险不可控。

### D8：菜单管理挂载收敛 + 关联页面选项懒加载（FormConfig.onFormOpen 机制）

- 挂载收敛：删除 `MenuPage.vue` 整个 `onMounted`——`fetchApi`（SearchTable 挂载 fetchList 调用）本就执行 `getMenuTree` 并维护 `list.value`（表格 rows、表单上级菜单 treeSelect `props.data`、编辑回填 `findNode` 三处共用同一份数据），onMounted 属纯重复；删除后 /menus/tree 挂载 ×2 → ×1，且增删改后的 SearchTable 刷新天然同步 `list.value`。
- 关联页面选项懒加载：`loadPublishedPages` 从挂载移除；`FormConfig` 扩展可选 `onFormOpen?: () => void | Promise<void>`，`SearchTable.openFormDialog` 打开弹窗前 `await props.formConfig?.onFormOpen?.()`；MenuPage 配置 `onFormOpen: ensurePublishedPages`（`_pagesLoaded` 标志单次加载）。
- 选型理由：linkedPage 选项依赖表单打开时机而非下拉展开时机（formConfig 为 computed，选项在表单渲染时即需就绪）；`onFormOpen` 钩子与 D4 的 `SearchField.onExpand` 对称，可在 SearchTable 单测中确定性验证。`loadPublishedPages` 保留既有 try/catch（失败置空数组），钩子失败不阻塞表单打开。
- **备选（未采用）**：在 linkedPage select 的 form-create rule 上挂 `visible-change` 事件懒加载 —— 依赖 form-create 对 el-select 事件的转发行为，测试需穿透 form-create 渲染链，脆弱且不可确定性断言。

## Risks / Trade-offs

- **[PageRendererPage props 化后测试回退分支失效]** → Mitigation：保留无 props 自行加载的回退逻辑；现有 `PageRendererPage.integration.test.ts` / `container.test.ts` 直接 mount 不传 props，走回退分支，必须跑通作为兜底防线。
- **[http 缓存导致数据陈旧]** → Mitigation：仅 GET + 显式 `cache: true` 的稳定接口启用；TTL 30s 内存级，刷新页面自然失效；definition 发布后短暂不一致可接受（预览/正式访问刷新即最新）。
- **[orgs 懒加载后搜索树首展开延迟]** → Mitigation：`ensureOrgTree()` 带加载中标志，单次串行拉取；下拉展开本身是异步交互，一次请求延迟可接受。
- **[onFormOpen 拉取失败阻塞表单]** → Mitigation：`loadPublishedPages` 已 try/catch 置空数组兜底，钩子失败不阻塞表单打开（选项为空 + 占位提示降级）。
- **[分配菜单/关联页面首次打开延迟]** → Mitigation：均为弹窗/表单交互时机，单次请求延迟可接受；后续复用已加载数据零延迟。
- **[PageDataTable 补发逻辑回归]** → Mitigation：现有集成测试覆盖首次 data 加载；新增用例断言"挂载时绑定已就绪 → 仅 1 次 data 请求"。
- **[变更集中在既有未提交工作之上]** → Mitigation：本次变更基于 main 最新提交（7a0b7f4）独立 worktree 开发，与既有功能隔离。