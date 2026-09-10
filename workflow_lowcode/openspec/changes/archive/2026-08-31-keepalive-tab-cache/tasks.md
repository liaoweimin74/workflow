## 1. AdminLayout 改造

- [x] 1.1 在 AdminLayout.vue 中添加 keep-alive 包裹 router-view，配置 include 和 max 属性
- [x] 1.2 管理 cachedViews 数组：页签打开时添加组件名，关闭时移除
- [x] 1.3 添加页签数量上限检查（max=15），超出时 LRU 自动驱逐

## 2. 路由组件命名

- [x] 2.1 为所有路由组件添加 defineOptions({ name: '...' }) 声明
- [x] 2.2 确保组件名与路由 name 一致（如 Dashboard、UserManagement 等）
- [x] 2.3 特别处理 PageRenderer.vue（动态路由组件）：补加 defineOptions({ name: 'PageRenderer' })

## 3. 强制刷新机制

- [x] 3.1 在 PageRenderer.vue 中添加刷新信号 watch 逻辑（query._t 变化 + path 匹配时 refresh）
- [x] 3.2 实现菜单重击触发刷新的逻辑（AdminLayout el-menu @select 检测重击，携带递增 query._t 强制导航）
- [x] 3.3 确保刷新时保留搜索条件等状态，仅重拉数据（refresh 调 SearchTable.fetchList，不重置 query）
- [x] 3.4 PageRendererPage.vue 添加 PAGE 类型强制刷新（遍历 componentRefs 调 refresh）

## 4. 删除 pageQueryStateStore

- [x] 4.1 检查 pageQueryStateStore 的所有引用方（仅 SearchTable.vue；cacheKey 无实际传入方）
- [x] 4.2 删除 pageQueryStateStore.ts 文件
- [x] 4.3 清理所有 import 引用（SearchTable.vue、types.ts、PageDataTable.vue）

## 5. 验证与测试

- [x] 5.1 验证页签切换时状态保持（keep-alive 缓存完整组件实例）
- [x] 5.2 验证内存管理（keep-alive max=15，LRU 自动驱逐）
- [x] 5.3 验证共享组件路由（/page/:pageKey）的实例隔离（:key="route.path" 区分实例）
- [x] 5.4 验证强制刷新功能（PageRenderer.keepalive.test.ts 3 用例 + PageRendererPage.integration 新增 2 用例全部通过）
