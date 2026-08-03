## Design Summary

本变更对前端框架 UI 进行 6 项增强调整，涵盖菜单折叠、页签右键菜单、登录记住用户名、面包屑改进、页签拖拽排序、暗色模式。

技术栈：Vue 3.5 + Element Plus 2.14 + Pinia 4 + vue-router 4 + TypeScript 6 + Tailwind CSS 4。

所有改动集中在前端，无后端变更。主要涉及文件：
- `frontend/src/layouts/AdminLayout.vue` — 主布局壳（菜单、页签、面包屑、内容区）
- `frontend/src/components/SubMenu.vue` — 递归菜单渲染
- `frontend/src/views/login/LoginPage.vue` — 登录页
- `frontend/src/stores/auth.ts` — 认证 store
- `frontend/src/style.css` — 全局样式（暗色模式）

## Alternatives Considered

### 需求1：菜单折叠改进

#### 方案 A：折叠按钮移到顶部栏 + Element Plus 图标 + 修复间距
- **做法**：将折叠按钮从侧边栏底部移到顶部 header 栏（logo 旁），用 Element Plus `Fold`/`Expand` 图标替代自定义 SVG；折叠态下覆盖 `SubMenu.vue` 的硬编码 `paddingLeft` 使图标居中
- **优点**：更易发现、图标更美观、折叠后视觉对齐
- **缺点**：需修改 SubMenu 组件的 padding 逻辑
- **采用状态**：✅ 采用

#### 方案 B：仅持久化折叠状态
- **做法**：将 `collapsed` 存入 localStorage
- **优点**：刷新保持状态
- **缺点**：用户明确要求不持久化（需求4选C）
- **为何未采用**：用户明确拒绝状态持久化

### 需求2：页签右键菜单

#### 方案 A：右键菜单完全替代下拉菜单
- **做法**：去掉现有下拉按钮，用 `@contextmenu.prevent` 实现右键菜单，5 项操作（关闭本页/左侧/右侧/所有/锁定本页）
- **优点**：交互统一、符合用户习惯
- **缺点**：需自行实现右键菜单组件
- **采用状态**：✅ 采用

#### 方案 B：右键菜单 + 保留下拉菜单
- **做法**：两者并存
- **优点**：多入口
- **缺点**：冗余
- **为何未采用**：用户选择去掉下拉菜单

### 需求3：登录记住用户名

#### 方案 A：只记用户名，密码靠浏览器密码管理器
- **做法**：加"记住用户名"复选框，勾选时用户名存 localStorage；密码不手动存储，依赖浏览器原生密码管理器自动填充
- **优点**：安全、简单、符合最佳实践
- **缺点**：密码填充依赖浏览器
- **采用状态**：✅ 采用

#### 方案 B：用户名+密码加密存储
- **做法**：用户名和密码都加密存 localStorage
- **优点**：跨浏览器可用
- **缺点**：安全风险，前端加密意义有限
- **为何未采用**：用户选择只记用户名

### 需求5：页签拖拽排序

#### 方案 A：引入 vuedraggable
- **做法**：用 vuedraggable（基于 Sortable.js）实现拖拽，首页固定最左，锁定页签可拖拽
- **优点**：成熟库、体验好、代码少
- **缺点**：增加一个依赖
- **采用状态**：✅ 采用

#### 方案 B：原生 HTML5 拖拽
- **做法**：用 `draggable` + `dragstart/dragover/drop` 事件
- **优点**：零依赖
- **缺点**：代码量大、体验需自行打磨
- **为何未采用**：用户选择引入 vuedraggable

### 需求6：暗色模式

#### 方案 A：Element Plus 官方暗色 + Tailwind dark: 配合
- **做法**：顶部栏放太阳/月亮图标按钮，点击切换 `html.dark` class；Element Plus 组件自动适配，Tailwind 用 `dark:` 变体适配自定义样式
- **优点**：官方支持、维护成本低、两套样式系统统一
- **缺点**：需逐一检查 Tailwind 自定义样式的暗色适配
- **采用状态**：✅ 采用

#### 方案 B：自行实现暗色覆盖
- **做法**：手动覆盖所有组件样式
- **优点**：完全可控
- **缺点**：工作量大、维护困难
- **为何未采用**：工作量过大

## Agreed Approach

六个需求均采用方案 A，具体决策见 Key Decisions。

## Key Decisions

| # | 需求 | 关键决策 |
|---|---|---|
| 1 | 菜单折叠改进 | 折叠按钮移到顶部栏（logo 旁）；换 Element Plus `Fold`/`Expand` 图标；修复折叠态 SubMenu.vue 的 paddingLeft 硬编码导致图标偏左不居中 |
| 2 | 页签右键菜单 | 去掉现有下拉菜单（▾ 按钮），右键菜单完全替代；5 项操作：关闭本页/关闭左侧/关闭右侧/关闭所有/锁定本页（已锁定显示"解锁本页"）；锁定页跳过关闭操作（关闭所有/左侧/右侧均跳过锁定页）；dashboard 永久不可关闭（保持现状硬编码，非"默认锁定"） |
| 3 | 登录记住用户名 | 只记用户名存 localStorage；密码不存，靠浏览器密码管理器自动填充；取消勾选"记住用户名"时立即清除已存用户名 |
| 4 | 面包屑改进 | 样式美化（更大字号/图标/间距，和整体 UI 协调）；数据来源从 `route.matched` 改为从菜单树（`authStore.menus`）匹配，与左侧菜单层级一致 |
| 5 | 页签拖拽排序 | 引入 `vuedraggable`（基于 Sortable.js）；首页固定最左不可拖拽；锁定页签也可拖拽 |
| 6 | 暗色模式 | 亮/暗双主题切换；顶部栏太阳/月亮图标按钮；Element Plus 官方暗色方案（`html.dark` class）；Tailwind `dark:` 变体配合 |

**不做的：** `collapsed` 和 `tags` 状态持久化（保持局部 ref，刷新重置）。

## Open Questions

无。所有需求已在 brainstorming 对话中逐一澄清确认。
