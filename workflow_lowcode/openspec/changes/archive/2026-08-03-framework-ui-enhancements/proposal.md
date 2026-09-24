## Why

前端框架 UI 存在多处体验问题：菜单折叠按钮在侧边栏底部不够直观，折叠后菜单项偏左不居中；页签缺少右键菜单和锁定功能，交互不够灵活；登录页无法记住用户名，每次需手动输入；面包屑与菜单树层级不一致；页签不可拖拽排序；无暗色模式。这些问题影响日常使用效率，需统一优化。

## What Changes

**菜单折叠改进**
- From: 折叠按钮在侧边栏底部，使用自定义 SVG 双箭头图标；折叠态下 SubMenu.vue 硬编码 paddingLeft 导致菜单项偏左不居中
- To: 折叠按钮移到顶部 header 栏（logo 左侧），使用 Element Plus Fold/Expand 图标；折叠态下通过 CSS 覆盖使菜单项居中
- Reason: 提升可发现性和视觉一致性
- Impact: non-breaking

**页签右键菜单**
- From: 页签只有单个关闭按钮(×)和一个下拉菜单("关闭其他/关闭全部")，无右键菜单，无锁定功能
- To: 去掉下拉菜单，右键菜单完全替代，包含5项操作（关闭本页/关闭左侧/关闭右侧/关闭所有/锁定本页），锁定页跳过关闭操作
- Reason: 提供更丰富的页签管理交互
- Impact: non-breaking

**登录记住用户名**
- From: 登录表单无"记住用户名"功能，每次需手动输入
- To: 增加"记住用户名"复选框，勾选时用户名存 localStorage；密码靠浏览器密码管理器；取消勾选立即清除
- Reason: 减少重复输入
- Impact: non-breaking

**面包屑改进**
- From: 面包屑从 route.matched 取 meta.title，样式为灰色小字
- To: 数据来源改为从菜单树匹配（兜底 route.matched），样式美化（更大字号/图标/间距）
- Reason: 与左侧菜单层级一致，视觉更协调
- Impact: non-breaking

**页签拖拽排序**
- From: 页签不可拖拽，顺序由打开顺序固定
- To: 引入 vuedraggable 实现拖拽排序，首页固定最左，锁定页签可拖拽
- Reason: 用户可自定义页签顺序
- Impact: non-breaking，新增依赖 vuedraggable

**暗色模式**
- From: 仅亮色主题，无暗色模式
- To: 亮/暗双主题切换，顶部栏太阳/月亮按钮，Element Plus 官方暗色方案 + Tailwind dark: 配合
- Reason: 减少眼部疲劳，适应暗光环境
- Impact: non-breaking

## Capabilities

### New Capabilities

- `framework-menu-collapse`: 菜单折叠按钮位置、图标样式、折叠态菜单项居中
- `tab-context-menu`: 页签右键菜单（关闭本页/左侧/右侧/所有/锁定），替代下拉菜单
- `tab-drag-sort`: 页签拖拽排序（vuedraggable，首页固定最左）
- `login-remember-username`: 登录页记住用户名（localStorage + 浏览器密码管理器）
- `breadcrumb-menu-sync`: 面包屑数据来源改为菜单树匹配 + 样式美化
- `dark-mode-toggle`: 暗色模式切换（Element Plus 官方暗色 + Tailwind dark:）

### Modified Capabilities

无现有 capability 修改。

## Impact

**受影响代码：**
- `frontend/src/layouts/AdminLayout.vue` — 菜单折叠按钮、页签右键菜单、拖拽、面包屑、暗色切换按钮
- `frontend/src/components/SubMenu.vue` — 折叠态 padding 修复
- `frontend/src/views/login/LoginPage.vue` — 记住用户名复选框
- `frontend/src/style.css` — 暗色模式 CSS 变量、Tailwind dark: 配置
- `frontend/src/main.ts` — 引入 Element Plus 暗色 CSS

**新增依赖：**
- `vuedraggable@next`（Vue 3 兼容版）

**API 变更：** 无
**数据库变更：** 无
**破坏性变更：** 无
