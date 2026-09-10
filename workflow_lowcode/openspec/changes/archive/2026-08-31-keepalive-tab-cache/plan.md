# Multi-Tab State Preservation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 实现多页签状态保持，用户切换页签时不丢失之前的数据和输入。

**Architecture:** 使用 Vue keep-alive + router-view + :key="route.fullPath" 缓存组件实例。页签管理通过 AdminLayout 的 cachedViews 数组控制，内存通过 max 属性限制，LRU 自动驱逐。

**Tech Stack:** Vue 3, Vue Router, Element Plus, keep-alive

---

## Task 1: AdminLayout 改造

- [ ] **Step 1:** 在 AdminLayout.vue 的 router-view 外层添加 keep-alive 组件
- [ ] **Step 2:** 配置 keep-alive 的 include 属性绑定 cachedViews 数组
- [ ] **Step 3:** 配置 keep-alive 的 max 属性为 15
- [ ] **Step 4:** 在 addTag 函数中将组件名添加到 cachedViews
- [ ] **Step 5:** 在 removeTag 函数中将组件名从 cachedViews 移除
- [ ] **Step 6:** 添加页签数量上限检查逻辑

## Task 2: 路由组件命名

- [ ] **Step 1:** 为 DashboardPage.vue 添加 defineOptions({ name: 'Dashboard' })
- [ ] **Step 2:** 为 UserPage.vue 添加 defineOptions({ name: 'UserManagement' })
- [ ] **Step 3:** 为 RolePage.vue 添加 defineOptions({ name: 'RoleManagement' })
- [ ] **Step 4:** 为 MenuPage.vue 添加 defineOptions({ name: 'MenuManagement' })
- [ ] **Step 5:** 为 OrgPage.vue 添加 defineOptions({ name: 'OrgManagement' })
- [ ] **Step 6:** 为 DictPage.vue 添加 defineOptions({ name: 'DictManagement' })
- [ ] **Step 7:** 为 ProfilePage.vue 添加 defineOptions({ name: 'Profile' })
- [ ] **Step 8:** 为 ProcessListPage.vue 添加 defineOptions({ name: 'ProcessDefinition' })
- [ ] **Step 9:** 为 ProcessCenterPage.vue 添加 defineOptions({ name: 'ProcessCenter' })
- [ ] **Step 10:** 为 ProcessTodoPage.vue 添加 defineOptions({ name: 'ProcessTodo' })
- [ ] **Step 11:** 为 TaskDoneDetailPage.vue 添加 defineOptions({ name: 'TaskDoneDetail' })
- [ ] **Step 12:** 为 TaskDetailPage.vue 添加 defineOptions({ name: 'TaskDetail' })
- [ ] **Step 13:** 为 ProcessInstanceTrackPage.vue 添加 defineOptions({ name: 'ProcessInstanceTrack' })
- [ ] **Step 14:** 为 ProcessStartPage.vue 添加 defineOptions({ name: 'ProcessStart' })
- [ ] **Step 15:** 为 FormListPage.vue 添加 defineOptions({ name: 'FormList' })
- [ ] **Step 16:** 为 BizDataListPage.vue 添加 defineOptions({ name: 'BizDataList' })
- [ ] **Step 17:** 为 PageListPage.vue 添加 defineOptions({ name: 'PageList' })
- [ ] **Step 18:** 为 PageRenderer.vue 添加 defineOptions({ name: 'PageRenderer' })
- [ ] **Step 19:** 为 DataSourceListPage.vue 添加 defineOptions({ name: 'DataSourceList' })

## Task 3: 强制刷新机制

- [ ] **Step 1:** 在 PageRenderer.vue 中添加刷新信号 watch 逻辑
- [ ] **Step 2:** 实现菜单重击触发刷新的路由守卫逻辑
- [ ] **Step 3:** 确保刷新时保留搜索条件等状态，仅重拉数据

## Task 4: 删除 pageQueryStateStore

- [ ] **Step 1:** 搜索 pageQueryStateStore 的所有引用方
- [ ] **Step 2:** 删除 pageQueryStateStore.ts 文件
- [ ] **Step 3:** 清理所有 import 引用

## Task 5: 验证与测试

- [ ] **Step 1:** 验证页签切换时状态保持（表单输入、查询条件、弹窗状态）
- [ ] **Step 2:** 验证内存管理（超过 15 个页签时 LRU 驱逐）
- [ ] **Step 3:** 验证共享组件路由（/page/:pageKey）的实例隔离
- [ ] **Step 4:** 验证强制刷新功能
