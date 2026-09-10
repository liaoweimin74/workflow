## Context

当前系统在切换页签时会清除之前的状态，用户输入丢失，查询数据重新拉取。现有 tab UI（AdminLayout.vue）用 tags 数组管理页签，但 router-view 直接渲染无 keep-alive。已有一个 pageQueryStateStore 尝试手动缓存查询状态，但只覆盖了 query/sort，未覆盖表单输入、弹窗状态等。

## Goals / Non-Goals

**Goals:**
1. 页签切换时保持所有组件状态（表单输入、查询条件、分页、排序、弹窗状态）
2. 用户主动刷新（菜单重击同一项）时重新加载数据
3. 内存可控，避免无限增长
4. 删除冗余的 pageQueryStateStore

**Non-Goals:**
1. 跨会话持久化（刷新页面后状态丢失可接受）
2. 跨标签页状态同步
3. 修改现有页签 UI 交互（拖拽、右键菜单等保持不变）

## Decisions

### 1. 缓存策略：keep-alive + key="route.fullPath"
- 使用 Vue 内置 keep-alive 组件缓存组件实例
- `:key="route.fullPath"` 确保每个路由路径（含参数）有独立缓存实例
- 解决 /page/:pageKey 等共享组件路由的实例隔离问题

### 2. 内存管理：max + LRU 驱逐
- keep-alive 的 max 属性设为 15（可配置）
- 超出时自动销毁最久未访问的实例
- 页签关闭时从 cachedViews 移除，触发缓存清理

### 3. 删除 pageQueryStateStore
- keep-alive 保留完整组件状态，无需手动缓存 query/sort
- 删除 getPageQueryState/setPageQueryState/clearPageQueryState
- 删除 pageRefreshSignal/bumpPageRefresh
- 删除 menuPathMap/registerMenuPath/getMenuPathByRoute

### 4. 强制刷新机制
- 组件内部 watch 路由 query 变化或事件信号
- 菜单重击同一项时，通过 router.push 添加 query 参数触发 watch
- 组件收到信号后调用 load() 重新拉取数据

### 5. 组件命名规范
- 所有路由组件需 defineOptions({ name: 'ComponentName' })
- 组件名需与路由 name 一致，确保 keep-alive include 匹配

## Risks / Trade-offs

### 风险
1. **内存占用**：15 个组件实例常驻内存，需监控实际占用
2. **组件命名一致性**：遗漏 defineOptions 会导致缓存失效
3. **第三方组件状态**：form-create 内部状态需验证 keep-alive 兼容性

### 权衡
1. **max 值选择**：太小（5）影响用户体验，太大（30）内存压力高。15 是折中值。
2. **强制刷新触发方式**：query 参数方式会改变 URL，需避免污染浏览器历史
3. **删除 pageQueryStateStore**：需确认无其他模块依赖此 store
