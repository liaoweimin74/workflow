## 1. AdminLayout 改造

- [ ] 1.1 在 AdminLayout.vue 中添加 keep-alive 包裹 router-view，配置 include 和 max 属性
- [ ] 1.2 管理 cachedViews 数组：页签打开时添加组件名，关闭时移除
- [ ] 1.3 添加页签数量上限检查（max=15），超出时提示或自动关闭最早页签

## 2. 路由组件命名

- [ ] 2.1 为所有路由组件添加 defineOptions({ name: '...' }) 声明
- [ ] 2.2 确保组件名与路由 name 一致（如 Dashboard、UserManagement 等）
- [ ] 2.3 特别处理 PageRenderer.vue（动态路由组件）

## 3. 强制刷新机制

- [ ] 3.1 在 PageRenderer.vue 中添加刷新信号 watch 逻辑
- [ ] 3.2 实现菜单重击触发刷新的路由守卫逻辑
- [ ] 3.3 确保刷新时保留搜索条件等状态，仅重拉数据

## 4. 删除 pageQueryStateStore

- [ ] 4.1 检查 pageQueryStateStore 的所有引用方
- [ ] 4.2 删除 pageQueryStateStore.ts 文件
- [ ] 4.3 清理所有 import 引用

## 5. 验证与测试

- [ ] 5.1 验证页签切换时状态保持（表单输入、查询条件、弹窗状态）
- [ ] 5.2 验证内存管理（超过 15 个页签时 LRU 驱逐）
- [ ] 5.3 验证共享组件路由（/page/:pageKey）的实例隔离
- [ ] 5.4 验证强制刷新功能
