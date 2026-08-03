# Framework UI Enhancements Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 对前端框架 UI 进行 6 项增强：菜单折叠改进、页签右键菜单、登录记住用户名、面包屑改进、页签拖拽排序、暗色模式。

**Architecture:** 所有改动集中在前端，主要涉及 `AdminLayout.vue`（主布局壳）、`SubMenu.vue`（菜单渲染）、`LoginPage.vue`（登录页）、`style.css`（全局样式）。新增 `vuedraggable` 依赖。使用 TDD 方法论（RED → GREEN → REFACTOR）。

**Tech Stack:** Vue 3.5 + Element Plus 2.14 + Pinia 4 + vue-router 4 + TypeScript 6 + Tailwind CSS 4 + vuedraggable@next

---

## Task 1: 环境准备

- [ ] **Step 1:** 在 `frontend/` 下运行 `npm install vuedraggable@next` 安装拖拽库
- [ ] **Step 2:** 在 `frontend/src/main.ts` 中添加 `import 'element-plus/theme-chalk/dark/css-vars.css'` 引入 Element Plus 暗色 CSS
- [ ] **Step 3:** 在 `frontend/src/style.css` 中添加 `@custom-variant dark (&:where(.dark, .dark *));` 配置 Tailwind 4 基于 class 的暗色模式
- [ ] **Step 4:** 运行 `npm run build`（`tsc && vite build`）验证环境无报错
- [ ] **Commit:** `chore: add vuedraggable dep, EP dark css, tailwind dark variant`

## Task 2: 菜单折叠改进

- [ ] **Step 1:** 编写测试：折叠按钮应在顶部 header 栏中，不在侧边栏底部
- [ ] **Step 2:** 在 `AdminLayout.vue` 顶部 header 栏 logo 左侧添加折叠按钮，使用 Element Plus `Fold`/`Expand` 图标（`<el-icon><Fold /></el-icon>` / `<el-icon><Expand /></el-icon>`）
- [ ] **Step 3:** 移除侧边栏底部的原折叠按钮区域（`<div class="h-10 ...">` 整块）
- [ ] **Step 4:** 在 `AdminLayout.vue` 的 `<style>` 中添加 CSS 覆盖：`.el-menu--collapse .el-menu-item { padding-left: 0 !important; padding-right: 0 !important; }` 使折叠态菜单项居中
- [ ] **Step 5:** 验证折叠态下菜单项图标水平居中，展开态下保持原有缩进
- [ ] **Commit:** `feat: move collapse button to header, fix collapsed menu centering`

## Task 3: 页签右键菜单 — 数据结构与基础

- [ ] **Step 1:** 编写测试：Tag 接口包含 `locked` 字段
- [ ] **Step 2:** 在 `AdminLayout.vue` 中扩展 `tags` 的类型为 `{ path: string; title: string; locked?: boolean }[]`
- [ ] **Step 3:** 创建右键菜单状态：`const contextMenu = ref({ visible: false, x: 0, y: 0, targetPath: '' })`
- [ ] **Step 4:** 在页签 `<div>` 上绑定 `@contextmenu.prevent="onTagContextMenu($event, tag)"`
- [ ] **Step 5:** 实现 `onTagContextMenu`：设置 contextMenu 状态显示菜单
- [ ] **Commit:** `feat: add tab context menu base structure`

## Task 4: 页签右键菜单 — 操作实现

- [ ] **Step 1:** 编写测试：关闭本页、关闭左侧、关闭右侧、关闭所有、锁定/解锁
- [ ] **Step 2:** 实现 `closeCurrent(path)`：移除指定页签（跳过 locked 和 dashboard），如关闭激活页则导航到相邻页
- [ ] **Step 3:** 实现 `closeLeft(path)`：移除指定页签左侧所有未锁定、非 dashboard 页签
- [ ] **Step 4:** 实现 `closeRight(path)`：移除指定页签右侧所有未锁定、非 dashboard 页签
- [ ] **Step 5:** 实现 `closeAll()`：移除所有未锁定、非 dashboard 页签，导航到 dashboard
- [ ] **Step 6:** 实现 `toggleLock(path)`：切换页签的 `locked` 状态
- [ ] **Step 7:** 锁定页签的 × 按钮隐藏（`v-if="!tag.locked && tag.path !== '/dashboard'"`）
- [ ] **Commit:** `feat: implement tab context menu actions`

## Task 5: 页签右键菜单 — UI 与交互

- [ ] **Step 1:** 编写测试：右键菜单点击外部关闭、dashboard 无锁定选项
- [ ] **Step 2:** 实现右键菜单 UI：固定定位的 `<div>`，5 项操作（dashboard 只显示4项，无锁定/解锁）
- [ ] **Step 3:** 实现禁用态：locked 页签的"关闭本页"灰色禁用；dashboard 的"关闭本页"灰色禁用
- [ ] **Step 4:** 实现 `@click.global` 或 `window` click 监听关闭菜单
- [ ] **Step 5:** 移除现有下拉菜单（▾ 按钮及相关代码）
- [ ] **Commit:** `feat: tab context menu UI, remove dropdown`

## Task 6: 登录记住用户名

- [ ] **Step 1:** 编写测试：勾选记住用户名后 localStorage 存储用户名、取消勾选清除、页面加载预填
- [ ] **Step 2:** 在 `LoginPage.vue` 中添加 `const rememberMe = ref(false)` 和 `const rememberedUsername = ref(localStorage.getItem('remembered_username') || '')`
- [ ] **Step 3:** 页面加载时：如果 `rememberedUsername` 非空，设 `loginForm.username = rememberedUsername` 且 `rememberMe = true`
- [ ] **Step 4:** 在密码框和登录按钮之间添加 `<el-checkbox v-model="rememberMe">记住用户名</el-checkbox>`
- [ ] **Step 5:** 实现 `watch(rememberMe)`：当变为 false 时立即 `localStorage.removeItem('remembered_username')`
- [ ] **Step 6:** 在 `handleLogin` 成功后：如果 `rememberMe` 为 true 则 `localStorage.setItem('remembered_username', loginForm.value.username)`，否则 `localStorage.removeItem('remembered_username')`
- [ ] **Commit:** `feat: login remember username`

## Task 7: 面包屑改进

- [ ] **Step 1:** 编写测试：从菜单树匹配面包屑路径、菜单树无匹配时回退到 route.matched
- [ ] **Step 2:** 在 `AdminLayout.vue` 中实现 `findMenuPath(menus, path)` 函数：递归查找菜单树，返回从根到目标节点的路径数组
- [ ] **Step 3:** 修改 `breadcrumbs` computed：先尝试从 `authStore.menus` 匹配，无匹配时回退到 `route.matched`
- [ ] **Step 4:** 美化面包屑样式：字号 `text-sm`，首页项加 Home 图标，调整间距
- [ ] **Commit:** `feat: breadcrumb menu sync and styling`

## Task 8: 页签拖拽排序

- [ ] **Step 1:** 编写测试：拖拽后页签顺序更新、首页固定最左
- [ ] **Step 2:** 在 `AdminLayout.vue` 中导入 `draggable` from `vuedraggable`
- [ ] **Step 3:** 用 `<draggable v-model="tags" item-key="path" :filter="'.no-drag'">` 包裹页签列表
- [ ] **Step 4:** 给 dashboard 页签添加 `no-drag` class 禁止拖拽
- [ ] **Step 5:** 配置 `@end` 事件：拖拽结束后检查首页是否在最左，如不在则移回首位
- [ ] **Step 6:** 确保锁定页签可拖拽（不加 no-drag class）
- [ ] **Commit:** `feat: tab drag sort with vuedraggable`

## Task 9: 暗色模式 — 切换逻辑

- [ ] **Step 1:** 编写测试：点击切换按钮在 html 上添加/移除 dark class
- [ ] **Step 2:** 在 `AdminLayout.vue` 中添加 `const isDark = ref(false)` 状态
- [ ] **Step 3:** 在顶部 header 栏添加切换按钮：`<el-icon><Moon /></el-icon>`（亮色态）/ `<el-icon><Sunny /></el-icon>`（暗色态）
- [ ] **Step 4:** 实现 `toggleDark()`：切换 `isDark`，`document.documentElement.classList.toggle('dark', isDark.value)`
- [ ] **Commit:** `feat: dark mode toggle logic`

## Task 10: 暗色模式 — 样式适配

- [ ] **Step 1:** 在 `AdminLayout.vue` 中为所有 Tailwind 类补充 `dark:` 变体：
  - `bg-white` → `dark:bg-gray-800`
  - `bg-gray-50` → `dark:bg-gray-900`
  - `text-gray-800` → `dark:text-gray-100`
  - `text-gray-700` → `dark:text-gray-300`
  - `text-gray-500` → `dark:text-gray-400`
  - `text-gray-400` → `dark:text-gray-500`
  - `border-gray-200` → `dark:border-gray-700`
  - `hover:bg-gray-100` → `dark:hover:bg-gray-700`
  - `hover:bg-gray-200` → `dark:hover:bg-gray-700`
- [ ] **Step 2:** 在 `LoginPage.vue` 中同样补充 `dark:` 变体
- [ ] **Step 3:** 在 `style.css` 中补充暗色模式下的自定义变量适配
- [ ] **Step 4:** 验证暗色模式下所有页面无亮色背景残留
- [ ] **Commit:** `feat: dark mode style adaptation`

## Task 11: 最终验证

- [ ] **Step 1:** 运行全部单元测试 `npm run test`
- [ ] **Step 2:** 运行 TypeScript 编译 `npx tsc --noEmit`
- [ ] **Step 3:** 运行构建 `npm run build`
- [ ] **Step 4:** 手动验证：菜单折叠/展开、页签右键菜单5项操作、页签拖拽、登录记住用户名、面包屑显示、暗色模式切换
- [ ] **Commit:** `test: final verification`
