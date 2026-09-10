## Context

工作流平台前端框架（`AdminLayout.vue`）当前已具备基本布局：顶部标题栏、左侧菜单、页签栏、内容区。但随着使用深入，多处交互体验需要优化。

**当前状态：**
- 菜单折叠按钮在侧边栏底部，不够直观；折叠态下菜单项因 `SubMenu.vue` 硬编码 `paddingLeft` 导致图标偏左不居中
- 页签只有单个关闭按钮和一个下拉菜单（"关闭其他/关闭全部"），无右键菜单，无"关闭左侧/右侧"，无"锁定"概念
- 登录页无"记住用户名"功能
- 面包屑从 `route.matched` 取值，与左侧菜单树层级可能不一致
- 页签不可拖拽排序
- 无暗色模式

**约束：**
- 纯前端改动，无后端 API 变更
- 技术栈固定：Vue 3.5 + Element Plus 2.14 + Pinia 4 + TS 6 + Tailwind 4
- 不做状态持久化（`collapsed`、`tags` 保持局部 ref）

## Goals / Non-Goals

**Goals:**
1. 菜单折叠按钮移到顶部栏，使用更美观的 Element Plus 图标，修复折叠态菜单项居中
2. 页签支持右键菜单（关闭本页/左侧/右侧/所有/锁定本页），完全替代现有下拉菜单
3. 登录页支持"记住用户名"，密码靠浏览器密码管理器
4. 面包屑样式美化 + 数据来源改为从菜单树匹配
5. 页签支持拖拽排序（引入 vuedraggable），首页固定最左
6. 暗色模式切换（Element Plus 官方暗色 + Tailwind dark: 配合）

**Non-Goals:**
- 不做 collapsed/tags 状态持久化
- 不做多主题（仅亮/暗双主题）
- 不做页签持久化（刷新后只保留当前页）
- 不改后端 API

## Decisions

### 1. 菜单折叠改进

**决策：** 折叠按钮从侧边栏底部移至顶部 header 栏（logo 左侧），使用 Element Plus `Fold`/`Expand` 图标。

**折叠态菜单项居中修复：** `SubMenu.vue` 当前对子菜单项硬编码 `paddingLeft: ${depth * 14 + 20}px`。折叠态下 `el-menu` 的 `collapse` 模式会隐藏文字只显示图标，但 paddingLeft 仍生效导致偏移。方案：通过 `el-menu` 的 `collapse` 状态传递（或通过 inject/provide），在折叠态下不应用自定义 paddingLeft，让 Element Plus 默认居中样式生效。

**替代方案：** 在 `AdminLayout.vue` 用 CSS 选择器 `.el-menu--collapse .el-menu-item` 覆盖 padding。更简单，无需改 SubMenu 组件结构。**采用此方案**——用 CSS 覆盖，避免组件间传参。

### 2. 页签右键菜单

**决策：** 去掉现有下拉菜单（▾ 按钮），在每个页签上绑定 `@contextmenu.prevent`，显示自定义右键菜单。

**右键菜单实现：** 使用一个响应式的弹出 `<div>`，定位到鼠标坐标。包含 5 项操作：
- 关闭本页（locked 页和 dashboard 禁用）
- 关闭左侧（跳过锁定页）
- 关闭右侧（跳过锁定页）
- 关闭所有（跳过锁定页，保留锁定页和 dashboard）
- 锁定本页 / 解锁本页（dashboard 不显示此项，因其永久不可关闭）

**页签数据结构扩展：**
```typescript
interface Tag {
  path: string
  title: string
  locked?: boolean  // 新增：锁定标记
}
```

**锁定行为：**
- 锁定页签的 × 按钮隐藏
- 右键"关闭本页"对锁定页禁用（灰色）
- "关闭左侧/右侧/所有"操作均跳过 locked 页
- dashboard 硬编码不可关闭（不使用 locked 机制，保持 `v-if="tag.path !== '/dashboard'"` 逻辑）
- 锁定页签可拖拽（不影响拖拽行为）

**替代方案：** 用 Element Plus 的 `el-dropdown` with `trigger="contextmenu"`。但 `el-dropdown` 的 contextmenu 模式需要绑定触发元素，对动态列表中的每个项绑定较繁琐。**采用自定义弹出 div**，更灵活、控制力更强。

### 3. 登录记住用户名

**决策：** 登录表单增加"记住用户名"复选框（`el-checkbox`）。

**存储逻辑：**
- 勾选时：登录成功后将用户名存入 `localStorage`（key: `remembered_username`）
- 取消勾选时：立即从 `localStorage` 移除 `remembered_username`
- 页面加载时：从 `localStorage` 读取 `remembered_username`，如有则预填用户名并勾选复选框

**密码处理：** 不手动存储密码。浏览器密码管理器在用户首次登录提交后会提示保存，后续访问自动填充。`<el-input type="password">` 配合 `<form>` 元素可触发浏览器自动填充。

**安全考量：** 用户名明文存储可接受（非敏感信息）。密码完全不经过前端代码存储，无安全风险。

### 4. 面包屑改进

**决策：** 两项改进：

**数据来源改为菜单树：** 当前从 `route.matched` 取 `meta.title`。改为从 `authStore.menus` 递归查找当前路由路径对应的菜单层级，构建面包屑路径。逻辑：
1. 在 menus 树中递归查找 `path === route.path` 的节点
2. 回溯收集所有父级节点
3. 每级用 `menuName` 作为面包屑文字

**兜底：** 如果菜单树中找不到匹配（如 dashboard、profile 等非菜单页面），回退到 `route.matched` + `meta.title`。

**样式美化：**
- 增大字号（从 `text-xs` 到 `text-sm`）
- 增加图标（首页用 Home 图标，其他级用对应菜单 icon）
- 调整间距和颜色，与整体 UI 风格协调

### 5. 页签拖拽排序

**决策：** 引入 `vuedraggable`（`npm: vuedraggable@next`，兼容 Vue 3）。

**实现：**
- 用 `<draggable>` 组件包裹页签列表，`v-model` 绑定 `tags` 数组
- `item-key="path"` 确保拖拽时正确追踪
- 首页（`/dashboard`）固定最左：通过 `filter` 选项禁止拖拽首页，或在拖拽结束后将首页移回首位
- 锁定页签可拖拽（locked 只影响关闭，不影响排序）

**替代方案：** 原生 HTML5 拖拽 API。但需自行处理拖拽视觉反馈、占位符、动画等，代码量大。vuedraggable 开箱即用，体验更好。

### 6. 暗色模式

**决策：** 亮/暗双主题切换。

**切换机制：**
- 顶部栏放一个图标按钮（太阳/月亮，用 Element Plus `Sunny`/`Moon` 图标）
- 点击切换 `<html>` 元素的 `dark` class
- Element Plus 2.14 官方暗色模式：引入 `element-plus/theme-chalk/dark/css-vars.css`，在 `<html>` 加 `dark` class 即自动适配所有 EP 组件

**Tailwind 配合：**
- Tailwind 4 默认使用 `prefers-color-scheme` 媒体查询。改为基于 class 的暗色模式（在 CSS 中配置 `@custom-variant dark (&:where(.dark, .dark *))`）
- 所有自定义 Tailwind 样式需检查并补充 `dark:` 变体

**暗色适配范围：**
- `AdminLayout.vue` 中所有 Tailwind 类（`bg-white`、`bg-gray-50`、`text-gray-800` 等）补充 `dark:` 变体
- `LoginPage.vue` 同样补充
- 全局 `style.css` 补充暗色变量

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 暗色模式下自定义 Tailwind 样式遗漏导致局部白底 | 逐一检查所有自定义样式，补充 `dark:` 变体；用浏览器暗色模式测试覆盖 |
| vuedraggable 与 Vue 3.5 兼容性问题 | 使用 `vuedraggable@next`（4.x+），已兼容 Vue 3 |
| 右键菜单在移动端不可用 | 当前项目为后台管理系统，PC 端使用，暂不处理移动端 |
| 面包屑从菜单树匹配可能因菜单数据未加载而空 | menus 未加载时回退到 `route.matched`，确保兜底 |
| SubMenu.vue 的 CSS 覆盖可能被 Element Plus 版本升级破坏 | 使用稳定的 CSS 选择器，添加注释说明覆盖原因 |
| 浏览器密码管理器行为不一致 | 不手动处理密码填充，依赖浏览器原生能力；用户名预填保证基本体验 |

## Migration Plan

1. 安装 `vuedraggable` 依赖
2. 引入 Element Plus 暗色 CSS 变量文件
3. 按需求逐个实现，每个需求独立可测
4. 无数据库迁移、无 API 变更
5. 回滚策略：`git revert` 即可

## Open Questions

无。所有问题已在 brainstorming 阶段澄清。
