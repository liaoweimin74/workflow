## Design Summary

实现多页签状态保持：用户切换页签时不丢失之前的数据和输入，除非用户主动刷新。

核心方案：Vue `keep-alive` + `router-view` + `:key="route.fullPath"`，配合页签数量上限和缓存清理机制。

## Alternatives Considered

### 方案 A：Vue keep-alive + router-view（推荐）
- **做法**：用 `<keep-alive :include="cachedViews" :max="15">` 包裹 `<router-view :key="route.fullPath" />`，页签打开时加入 cachedViews，关闭时移除
- **优点**：Vue 原生支持；自动保留所有响应式状态；内存可控（max 限制）；LRU 自动驱逐
- **缺点**：需要为所有路由组件定义 name；max 设置需要权衡
- **为何未采用**：此为推荐方案

### 方案 B：v-show 全实例存活
- **做法**：用 `<template v-for="tab in tabs">` 渲染所有页签组件，v-show 切换可见性
- **优点**：实现简单；状态天然保留
- **缺点**：内存只增不减（无驱逐机制）；隐藏组件仍参与响应式更新；页签多时性能差
- **为何未采用**：内存风险高，不适合生产环境

### 方案 C：localStorage 序列化缓存
- **做法**：组件卸载时序列化状态到 localStorage，挂载时反序列化恢复
- **优点**：跨会话持久化；内存占用低
- **缺点**：form-create rule 含函数无法序列化；恢复逻辑复杂；同步 I/O 性能差；5MB 容量限制
- **为何未采用**：实现成本高且无法完整恢复 Vue 响应式状态

### 方案 D：若依方案（include 按组件名）
- **做法**：keep-alive + include 数组，按组件名匹配缓存
- **优点**：成熟框架验证；Pinia store 管理缓存列表
- **缺点**：无法区分同组件不同参数（/page/:pageKey 场景）；需要 redirect hack 实现强制刷新
- **为何未采用**：不适用共享组件路由场景

## Agreed Approach

采用方案 A（keep-alive + key="route.fullPath"），原因：
1. 解决共享组件问题：`:key="route.fullPath"` 让每个路由路径有独立缓存实例
2. 内存可控：`max` 属性限制缓存数量，LRU 自动驱逐
3. 删除冗余的 pageQueryStateStore：keep-alive 保留完整组件状态，无需手动缓存查询参数
4. 强制刷新：组件内部 watch 信号重载，无需 redirect hack

## Key Decisions

1. **缓存隔离**：使用 `:key="route.fullPath"` 而非 include 按组件名，确保 /page/:pageKey 等共享组件路由的实例隔离
2. **内存上限**：keep-alive max 设为 15，超出时 LRU 驱逐最早访问的实例
3. **删除 pageQueryStateStore**：query/sort 缓存、refreshSignal、menuPathMap 全部移除
4. **强制刷新**：组件内部 watch 路由 query 或事件信号触发重载
5. **组件命名**：所有路由组件需 defineOptions({ name: '...' }) 与路由名一致

## Open Questions

1. 页签关闭时是否需要清理 keep-alive 缓存？（建议：关闭时从 cachedViews 移除）
2. 强制刷新的具体触发机制？（菜单重击同一项 vs 刷新按钮 vs 右键菜单刷新）
3. max 值设为多少合适？（建议：15，可配置）
