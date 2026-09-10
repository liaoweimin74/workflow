## 1. 环境准备

- [x] 1.1 安装 `vuedraggable@next` 依赖
- [x] 1.2 在 `main.ts` 中引入 Element Plus 暗色 CSS（`element-plus/theme-chalk/dark/css-vars.css`）
- [x] 1.3 在 `style.css` 中配置 Tailwind 4 基于 class 的暗色模式（`@custom-variant dark (&:where(.dark, .dark *))`）

## 2. 菜单折叠改进（framework-menu-collapse）

- [x] 2.1 将折叠按钮从侧边栏底部移到顶部 header 栏（logo 左侧），改用 Element Plus `Fold`/`Expand` 图标
- [x] 2.2 移除侧边栏底部的原折叠按钮区域
- [x] 2.3 在 `AdminLayout.vue` 中添加 CSS 覆盖，使折叠态下 `.el-menu--collapse .el-menu-item` 的 padding 居中，覆盖 SubMenu.vue 的硬编码 paddingLeft
- [x] 2.4 验证折叠态菜单项图标居中

## 3. 页签右键菜单（tab-context-menu）

- [x] 3.1 扩展页签数据结构，添加 `locked?: boolean` 字段
- [x] 3.2 创建右键菜单弹出组件（响应式定位到鼠标坐标的 `<div>`）
- [x] 3.3 在每个页签上绑定 `@contextmenu.prevent` 事件，显示右键菜单
- [x] 3.4 实现右键菜单5项操作：关闭本页、关闭左侧、关闭右侧、关闭所有、锁定/解锁本页
- [x] 3.5 实现锁定逻辑：锁定页 × 按钮隐藏、显示锁图标、"关闭本页"禁用、关闭左侧/右侧/所有跳过锁定页
- [x] 3.6 dashboard 页签不显示"锁定/解锁"选项，"关闭本页"禁用
- [x] 3.7 移除现有的下拉菜单（▾ 按钮）
- [x] 3.8 点击页面其他位置时关闭右键菜单

## 4. 登录记住用户名（login-remember-username）

- [x] 4.1 在 `LoginPage.vue` 中添加"记住用户名"复选框（`el-checkbox`），位于密码框和登录按钮之间
- [x] 4.2 页面加载时从 `localStorage` 读取 `remembered_username`，如有则预填用户名并勾选复选框
- [x] 4.3 勾选时登录成功后将用户名存入 `localStorage`
- [x] 4.4 未勾选时登录成功后清除 `localStorage` 中的 `remembered_username`
- [x] 4.5 取消勾选时立即清除 `localStorage` 中的 `remembered_username`

## 5. 面包屑改进（breadcrumb-menu-sync）

- [x] 5.1 实现从 `authStore.menus` 递归匹配当前路由路径的函数，构建面包屑层级
- [x] 5.2 菜单树无匹配时回退到 `route.matched` + `meta.title`
- [x] 5.3 美化面包屑样式：字号增大到 `text-sm`，首页项加 Home 图标，调整间距和颜色
- [x] 5.4 暗色模式下面包屑样式适配

## 6. 页签拖拽排序（tab-drag-sort）

- [x] 6.1 用 `<draggable>`（vuedraggable）包裹页签列表，`v-model` 绑定 `tags`，`item-key="path"`
- [x] 6.2 首页固定最左：配置 draggable 的 `filter` 或拖拽结束后将首页移回首位
- [x] 6.3 锁定页签可拖拽（不限制）
- [x] 6.4 验证拖拽排序后页签顺序正确

## 7. 暗色模式（dark-mode-toggle）

- [x] 7.1 在顶部 header 栏添加暗色模式切换按钮（`Sunny`/`Moon` 图标）
- [x] 7.2 实现切换逻辑：在 `<html>` 元素上添加/移除 `dark` class
- [x] 7.3 `AdminLayout.vue` 所有 Tailwind 类补充 `dark:` 变体（背景色、文字色、边框色）
- [x] 7.4 `LoginPage.vue` 所有 Tailwind 类补充 `dark:` 变体
- [x] 7.5 全局 `style.css` 补充暗色模式变量适配
- [x] 7.6 验证暗色模式下所有页面无亮色背景残留

## 8. 测试验证

- [x] 8.1 编写菜单折叠改进的单元测试
- [x] 8.2 编写页签右键菜单的单元测试
- [x] 8.3 编写登录记住用户名的单元测试
- [x] 8.4 编写面包屑数据来源的单元测试
- [x] 8.5 编写页签拖拽排序的单元测试
- [x] 8.6 编写暗色模式切换的单元测试
- [x] 8.7 运行全部测试通过
- [x] 8.8 TypeScript 编译无报错（`tsc` 通过）
