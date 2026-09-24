## Why

当前系统切换页签时组件被销毁重建，导致用户输入丢失、查询数据重新拉取，失去了多页签的意义。已有的 pageQueryStateStore 只缓存了查询参数，无法覆盖表单输入、弹窗状态等完整组件状态。需要实现真正的页签状态保持。

## What Changes

**页签缓存机制**
- From: router-view 直接渲染，切换时销毁组件
- To: keep-alive + key="route.fullPath" 缓存组件实例
- Reason: 保留所有响应式状态，包括表单输入、查询条件、分页、排序、弹窗状态
- Impact: 所有路由组件行为变更，需验证兼容性

**内存管理**
- From: 无限制，组件实例无限累积
- To: keep-alive max=15，LRU 自动驱逐
- Reason: 防止内存无限增长导致浏览器卡顿
- Impact: 超过 15 个页签时最早访问的实例会被销毁

**删除 pageQueryStateStore**
- From: 手动缓存 query/sort 到 Pinia store
- To: 完全删除，依赖 keep-alive 自动缓存
- Reason: keep-alive 保留完整组件状态，手动缓存冗余
- Impact: 需确认无其他模块依赖此 store

**强制刷新机制**
- From: 无强制刷新机制（组件不销毁）
- To: 组件内部 watch 信号触发重载
- Reason: 用户需要主动刷新数据的能力
- Impact: 菜单重击同一项时触发刷新

## Capabilities

### New Capabilities
- `tab-state-preservation`: 页签切换时保持组件状态，支持表单输入、查询条件、分页、排序、弹窗状态的完整保留

### Modified Capabilities
- 无（此为新功能，不修改现有 spec）

## Impact

**前端代码**
- AdminLayout.vue: 添加 keep-alive 包裹 router-view，管理 cachedViews 数组
- 所有路由组件: 添加 defineOptions({ name: '...' }) 命名
- PageRenderer.vue: 添加强制刷新 watch 逻辑
- pageQueryStateStore.ts: 完全删除

**依赖**
- 无新依赖，使用 Vue 内置 keep-alive

**风险**
- 内存占用增加（15 个组件实例）
- 需验证 form-create 等第三方组件与 keep-alive 的兼容性
