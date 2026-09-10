# framework-menu-collapse Specification

## Purpose
TBD - created by archiving change framework-ui-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 菜单折叠按钮位置

折叠按钮 SHALL 位于顶部 header 栏中 logo 区域的左侧，使用 Element Plus `Fold` 图标（展开态）和 `Expand` 图标（折叠态）。

折叠按钮 MUST NOT 保留在侧边栏底部。侧边栏底部的原折叠按钮区域 SHALL 移除。

#### Scenario: 折叠按钮在顶部栏显示
- **WHEN** 用户进入管理后台任意页面
- **THEN** 顶部 header 栏 logo 左侧显示折叠/展开按钮
- **AND** 侧边栏底部无折叠按钮

#### Scenario: 展开态显示 Fold 图标
- **WHEN** 菜单处于展开状态
- **THEN** 折叠按钮显示 Element Plus `Fold` 图标

#### Scenario: 折叠态显示 Expand 图标
- **WHEN** 菜单处于折叠状态
- **THEN** 折叠按钮显示 Element Plus `Expand` 图标

---

### Requirement: 折叠态菜单项居中

当菜单处于折叠状态时，所有菜单项（包括 SubMenu 组件渲染的动态菜单项）的图标 SHALL 在侧边栏中水平居中。

SubMenu.vue 中硬编码的 `paddingLeft` 样式在折叠态下 MUST NOT 生效，应通过 CSS 覆盖使 Element Plus 默认的折叠态居中样式生效。

#### Scenario: 折叠态菜单图标居中
- **WHEN** 用户点击折叠按钮将菜单折叠
- **THEN** 侧边栏宽度变为 64px（w-16）
- **AND** 所有菜单项图标水平居中显示
- **AND** 菜单文字隐藏

#### Scenario: 展开态菜单项保持原有缩进
- **WHEN** 菜单处于展开状态
- **THEN** SubMenu.vue 的 paddingLeft 样式正常生效
- **AND** 子菜单项按层级缩进显示

