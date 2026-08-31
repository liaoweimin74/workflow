## 1. HTTP 传输层去重与缓存（http-request-caching）

- [ ] 1.1 在 utils/http.ts 扩展 axios RequestConfig 类型（module augmentation）：新增可选 `cache?: boolean`、`cacheTtl?: number`
- [ ] 1.2 实现 in-flight GET 去重：以 `method + url + 序列化 params`（与 axios paramsSerializer 一致的序列化）为键，并发同键共享同一 Promise，请求完成/失败后清理键记录
- [ ] 1.3 实现短 TTL 内存缓存：仅 GET 且显式 `cache: true` 的请求读缓存、写缓存；TTL 缺省 30s（`cacheTtl` 可覆盖）；缓存命中不发起网络请求；内存级存储（刷新失效）
- [ ] 1.4 首批接口声明启用缓存：`pageApi.getPageByKey`（preview=false）、`dataSourceApi.getMetadata`、`getOrgTree`、`getRoleList`
- [ ] 1.5 编写 http 层单元测试（vitest）：并发同键 GET 仅 1 次网络请求；TTL 内命中返回缓存、过期后重发；未声明 cache 的请求不读写缓存；失败请求清理可重试

## 2. PAGE definition 单次加载（query-page-renderer MODIFIED）

- [ ] 2.1 PageRenderer.vue：type=PAGE 分支渲染 `<PageRendererPage :definition="res.data" />`，将已加载定义下传（VIEW 分支与 preview 语义不变）
- [ ] 2.2 PageRendererPage.vue：新增可选 prop `definition`；`load()` 开始时 props 有 definition 则直接使用（解析 schema/渲染），无 props 回退按 pageKey 自行加载；保留 pageKey 切换兜底 watch
- [ ] 2.3 更新 PageRendererPage.integration.test.ts：断言 PAGE 渲染链路 definition 请求仅 1 次；补用例"无 props 直接挂载回退自行加载"通过

## 3. page-table 首次 data 单次加载（page-data-table ADDED）

- [ ] 3.1 PageDataTable.vue：删除 `watch(activeDsBindings, { immediate: true })` + nextTick(fetchList) 自动补发；新增 `_pendingFirstFetch` 标志——onMounted 时 `resolvedRefId` 为空才置位，bindings 就绪后补发且仅补发一次
- [ ] 3.2 补充测试：挂载时绑定已就绪 → data 请求仅 1 次；挂载时未就绪 → 绑定就绪后补发恰 1 次；refId 为空不发起请求

## 4. VIEW 数据源定义懒加载（query-page-renderer ADDED）

- [ ] 4.1 PageRenderer.vue：VIEW 分支 `load()` 移除 `getDataSource`，仅保留 `getMetadata`（metadata 仍挂载拉取，供列排序/只读标记）
- [ ] 4.2 新增 `ensureBoundDataSource()`：boundDataSource 为 null 时加载数据源定义；`openDetail`/`openCreate`/`openEdit`/`openFormContainer` 进入前 await 确保 formKey 判定就绪
- [ ] 4.3 补充测试：VIEW 首屏不发 /data-sources/{id} 请求；打开编辑/详情前先确保定义就绪；定义已加载后不重复请求

## 5. 选项延迟加载（deferred-options-loading）

- [ ] 5.1 SearchField 类型（components/business/types.ts）新增可选 `onExpand?: () => void | Promise<void>`
- [ ] 5.2 SearchTable.vue：tree-select 渲染处（约 28 行）挂 `@visible-change`：展开（visible=true）且树数据为空时调用 `field.onExpand()`；未配置 onExpand 行为不变
- [ ] 5.3 UserPage.vue：orgs 搜索字段配置 onExpand；抽取共享 `ensureOrgTree()`（已加载/加载中标志防并发重复拉取）；新增/编辑表单打开时若树未加载则补拉
- [ ] 5.4 roles 请求（`getRoleList({page:1,size:999})`）声明 `cache: true`（跨页面复用，配合 1.4）
- [ ] 5.5 补充测试：tree-select 首次展开触发 onExpand 恰一次；数据非空不重复触发；未配置 onExpand 兼容原行为

## 6. 回归验证

- [ ] 6.1 运行前端相关测试：PageRendererPage.integration.test.ts、PageRendererPage.container.test.ts 及新增用例全部通过
- [ ] 6.2 运行 typecheck / lint / 构建（如 vue-tsc && vite build），确认无类型与构建错误