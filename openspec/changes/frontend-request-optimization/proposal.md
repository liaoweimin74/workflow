## Why

前端页面加载存在冗余 API 请求：PAGE 页 definition 请求 ×2（渲染宿主与子组件各取一次）、page-table 首次 data 请求 ×2（挂载请求与绑定就绪补发叠加）、用户管理页 orgs/roles 无差别预取、VIEW 页数据源定义过早加载。传输层无去重与缓存机制兜底。预期收益：page2 5→3 请求、emp_view_e2e 首屏 4→3、用户管理首屏 3→2，加快页面首屏速度。

## What Changes

**PAGE definition 单次加载（query-page-renderer）**
- From: PageRenderer.load() 获取 definition 判断类型后丢弃，PageRendererPage 独立再次 getPageByKey
- To: PageRenderer 通过 props 下传 definition，PageRendererPage 有 props 直接用、无 props 回退自行加载
- Reason: 消除同页 definition 重复请求
- Impact: non-breaking；PAGE 页请求数 -1

**page-table 首次 data 单次加载（page-data-table）**
- From: SearchTable 挂载 fetchList + watch(activeDsBindings, immediate) 补发叠加（同参数 ×2）
- To: 挂载时 refId 已就绪则仅 SearchTable 挂载请求一次；未就绪才由绑定就绪补发一次
- Reason: 消除同参数 data 重复请求
- Impact: non-breaking；当前页面 data 请求 -1

**HTTP 传输层去重与缓存（新能力 http-request-caching）**
- 新增：GET in-flight 去重（并发同键共享 Promise）+ 短 TTL 缓存（显式声明 cache:true 的接口，默认 30s）
- 首批启用：definition(preview=false)、metadata、orgs/tree、roles
- Impact: non-breaking；跨页面复用稳定数据，兜住未来重复触发

**附属选项/定义数据延迟加载（新能力 deferred-options-loading）**
- 新增：SearchField.onExpand 可选回调，tree-select 首次展开才拉组织树；VIEW 页 ensureBoundDataSource 打开表单才取 ds 定义；roles 保留首屏但叠加缓存复用
- From: 用户管理页 onMounted 预取 orgs/roles；VIEW 页挂载即取 ds 定义
- To: orgs 展开搜索树才拉、ds 定义打开表单才取、roles 缓存复用
- Impact: non-breaking；首屏请求数减少

## Capabilities

### New Capabilities
- `http-request-caching`: HTTP GET 请求 in-flight 去重与短 TTL 响应缓存（传输层基础设施）
- `deferred-options-loading`: 页面附属选项/定义数据延迟加载（组织树懒加载、VIEW 数据源定义按需获取、角色列表缓存复用）

### Modified Capabilities
- `query-page-renderer`: PAGE 页面 definition 加载从"宿主与子组件各取一次"改为"宿主下传单次加载"；VIEW 分支数据源定义改为按需获取
- `page-data-table`: 首次 data 请求从"挂载+绑定就绪双触发"改为"单次触发"

## Impact

- 前端文件：utils/http.ts、components/business/{types,SearchTable}.vue、views/page/PageRenderer.vue、views/page/PageRendererPage.vue、views/page/components/PageDataTable.vue、views/system/user/UserPage.vue
- 后端：无改动
- 测试：PageRendererPage.integration.test.ts / container.test.ts 回归；新增 http 去重、data 单次加载、onExpand 触发用例
- 依赖：无新增