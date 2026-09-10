## Design Summary

**变更目标**：减少前端页面加载时的冗余 API 请求，通过延迟请求（懒加载）、消除重复请求、增加传输层缓存/去重，加快页面加载速度。纯前端改动，不动后端接口契约。

**问题来源**（三个实测页面）：

| 页面 | 现状请求 | 问题 |
|---|---|---|
| 用户管理（UserPage.vue） | `/users?page=1&size=10` + `/orgs/tree` + `/roles?page=1&size=999` | orgs/roles 在 `onMounted` 无差别预取，即使从不使用也会发出 |
| /page/page2（PAGE 类型） | definition×2 + data×2 + metadata | PageRenderer 与 PageRendererPage 各自加载 definition；PageDataTable 挂载请求与 activeDsBindings watch 补发叠加 |
| /page/emp_view_e2e（VIEW 类型） | definition + metadata + ds 定义 + data | ds 定义（getDataSource）页面挂载即取，实际仅在打开详情/编辑表单时才用 |

**根因四类**：
1. 结构性重复：父组件（PageRenderer）已取 definition 却丢弃，子组件（PageRendererPage）重取
2. 就绪双触发：PageDataTable 的 `watch(activeDsBindings, {immediate:true})` 补发与 SearchTable 挂载请求叠加（fetchApi 本身已处理"refId 未就绪返回空"）
3. 预取过载：UserPage 的 orgs/roles、PageRenderer VIEW 分支的 ds 定义，首屏不需要却提前拉
4. 传输层裸奔：`utils/http.ts` 无 in-flight 去重、无缓存，同 tick 重复请求无任何拦截

**改动点**（P0 + P1）：
- P0-1：definition 单次加载（PageRenderer 通过 props 下传 definition 给 PageRendererPage）
- P0-2：data 单次加载（PageDataTable 补发逻辑改为"仅挂载时 refId 未就绪才补发"）
- P0-3：http.ts 增加 GET in-flight 去重 + 短 TTL 缓存（仅显式声明的稳定接口）
- P1-1：用户管理组织树懒加载（tree-select 首次展开才拉取，SearchField 扩展 onExpand）
- P1-2：roles 保留首屏拉取（角色列 ID→名称映射必需）+ TTL 缓存复用
- P1-3：VIEW 页 ds 定义懒加载（`openDetail/openCreate/openEdit` 时才取）

**预期收益**：page2 5→3 请求；emp_view_e2e 首屏 4→3（ds 定义延迟到交互时）；用户管理首屏 3→2（orgs 延迟）。

## Alternatives Considered

### 方案 A：P0 + P1 纯前端优化（采用）
- **做法**：消除结构性重复（definition 下传、data 补发修正）+ http 层去重与短 TTL 缓存 + 懒加载（orgs 树展开才拉、ds 定义打开表单才拉）
- **优点**：全部纯前端改动，不改后端契约；改动点明确、风险可控；收益直接（page2 5→3、用户管理 3→2 首屏）
- **缺点**：用户管理页 roles 请求无法消除（角色列名称映射需要全量角色数据），首屏仍有 2 个请求
- **为何采用**：用户确认"P0 + P1 全做、尽量不动后端"，此方案在不动后端约束下收益最大

### 方案 B：P0 + P1 + P2 全部（含后端配合）
- **做法**：在方案 A 基础上增加后端聚合端点（`/api/pages/{key}/bootstrap` 一次返回 definition+metadata+首屏数据）、`/users` 直接返回 `roleNames`、definition 内嵌数据源 metadata
- **优点**：请求收敛最彻底（用户管理可到 1 请求、页面渲染可到 1-2 请求）
- **缺点**：涉及后端接口契约变更与维护（Java/Spring 侧），工作量与风险显著增加
- **为何未采用**：用户明确选择"尽量不动后端"，本项目当前阶段优先前端可控优化

### 方案 C：仅 P0 最小改动
- **做法**：只做结构性重复修复（definition 下传、data 补发修正）+ http 去重，不做懒加载与缓存
- **优点**：改动面最小、回归风险最低
- **缺点**：用户管理页的预取过载（orgs/roles）与 VIEW 页 ds 定义过早加载问题未解决，收益不完整
- **为何未采用**：用户确认范围覆盖 P0 + P1，希望在控制后端改动的同时获得完整收益

## Agreed Approach

采用**方案 A（P0 + P1 纯前端优化）**。理由：
1. 在"尽量不动后端"约束下收益最大（消除 3 类冗余请求 + 传输层兜底）；
2. 所有改动均为前端组件/工具层调整，可通过现有 TDD 集成测试（PageRendererPage.integration.test.ts）验证回归；
3. P2 后端聚合端点留作后续阶段，不阻塞本次收益落地。

## Key Decisions

1. **definition 由 props 下传**：PageRenderer.load() 已取到 definition，PAGE 分支渲染 `<PageRendererPage :definition="res.data" />`；PageRendererPage 有 props 直接用、无 props 回退自行加载（兼容测试直接挂载场景）。
2. **data 补发条件收紧**：PageDataTable 删除 `watch(activeDsBindings, {immediate:true})` 的自动补发，改为 `onMounted` 时若 `resolvedRefId` 为空则置标记、bindings 就绪后补发一次。挂载时已就绪 → SearchTable 挂载请求即首次请求。
3. **http 缓存仅显式声明**：通过 axios config 扩展（`cache: true` + `cacheTtl`），仅 GET 且显式声明的稳定接口启用（definition preview=false、metadata、orgs/tree、roles），TTL 默认 30s，内存级存储（刷新页面自然失效）。
4. **orgs 懒加载挂载点**：SearchField 扩展可选 `onExpand`，SearchTable 的 el-tree-select 渲染处挂 `@visible-change`（展开且数据为空时触发）；向后兼容（新字段可选）。
5. **roles 保留首屏**：角色列名称映射（`roleIds → roleName`）需要全量角色数据，不动后端约束下无法移除，叠加 TTL 缓存使其跨页面复用。
6. **ds 定义懒加载**：VIEW 分支 `load()` 仅保留 `getMetadata`；新增 `ensureBoundDataSource()`，在 `openDetail/openCreate/openEdit/openFormContainer` 进入前确保 `boundDataSource` 已解析。

## Open Questions

1. roles 请求进一步收敛需后端返回 `roleNames`（本次明确不做，留待后续阶段）。
2. http 缓存 TTL（30s）是否满足各类接口的实际变更频率？definition 发布后 30s 内预览旧值是否可接受（内存级，刷新即失效）—— 当前认为可接受，若实际场景要求更强一致性可调整为 5s。