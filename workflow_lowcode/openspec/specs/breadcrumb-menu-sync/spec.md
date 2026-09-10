# breadcrumb-menu-sync Specification

## Purpose
TBD - created by archiving change framework-ui-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 面包屑数据来源

面包屑数据 SHALL 从菜单树（`authStore.menus`）中递归匹配当前路由路径生成。匹配逻辑为：在菜单树中查找 `path === route.path` 的节点，回溯收集所有父级节点，构建面包屑路径。

如果菜单树中找不到匹配项（如 dashboard、profile 等非菜单页面），SHALL 回退到从 `route.matched` 提取 `meta.title` 作为兜底。

#### Scenario: 从菜单树匹配面包屑
- **WHEN** 用户访问一个在菜单树中存在的页面
- **THEN** 面包屑从菜单树中匹配当前路径
- **AND** 显示完整的菜单层级路径（父级菜单 > 子菜单 > 当前页）

#### Scenario: 菜单树无匹配时回退
- **WHEN** 用户访问一个不在菜单树中的页面（如 dashboard、profile）
- **THEN** 面包屑从 `route.matched` 提取 `meta.title`
- **AND** 显示路由层级路径

---

### Requirement: 面包屑样式美化

面包屑 SHALL 使用更大字号、图标和间距，与整体 UI 风格协调。

具体样式要求：
- 字号从 `text-xs` 增大到 `text-sm`
- 首页面包屑项 SHALL 显示 Home 图标
- 各级面包屑项之间间距适当
- 颜色与整体 UI 协调（暗色模式下同步适配）

#### Scenario: 面包屑样式显示
- **WHEN** 用户进入管理后台任意页面
- **THEN** 面包屑以 text-sm 字号显示
- **AND** 首页项显示 Home 图标
- **AND** 各级之间有适当间距

#### Scenario: 暗色模式下面包屑适配
- **WHEN** 用户切换到暗色模式
- **THEN** 面包屑文字和图标颜色适配暗色背景

