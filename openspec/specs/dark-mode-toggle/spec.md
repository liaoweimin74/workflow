# dark-mode-toggle Specification

## Purpose
TBD - created by archiving change framework-ui-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 暗色模式切换按钮

顶部 header 栏 SHALL 显示一个暗色模式切换按钮，使用 Element Plus `Sunny` 图标（暗色态，点击切回亮色）和 `Moon` 图标（亮色态，点击切到暗色）。

#### Scenario: 亮色态显示 Moon 图标
- **WHEN** 系统处于亮色模式
- **THEN** 切换按钮显示 `Moon` 图标
- **AND** 点击后切换到暗色模式

#### Scenario: 暗色态显示 Sunny 图标
- **WHEN** 系统处于暗色模式
- **THEN** 切换按钮显示 `Sunny` 图标
- **AND** 点击后切换到亮色模式

---

### Requirement: Element Plus 暗色模式适配

系统 SHALL 引入 Element Plus 官方暗色模式 CSS（`element-plus/theme-chalk/dark/css-vars.css`），通过在 `<html>` 元素上添加/移除 `dark` class 来切换 Element Plus 组件的明暗主题。

#### Scenario: Element Plus 组件暗色适配
- **WHEN** 用户切换到暗色模式
- **THEN** `<html>` 元素添加 `dark` class
- **AND** 所有 Element Plus 组件自动切换到暗色主题

#### Scenario: Element Plus 组件亮色恢复
- **WHEN** 用户切换到亮色模式
- **THEN** `<html>` 元素移除 `dark` class
- **AND** 所有 Element Plus 组件恢复亮色主题

---

### Requirement: Tailwind dark 变体适配

Tailwind CSS SHALL 配置基于 class 的暗色模式（使用 `@custom-variant dark (&:where(.dark, .dark *))`），所有自定义 Tailwind 样式 MUST 补充 `dark:` 变体以适配暗色模式。

需适配暗色的区域包括：
- `AdminLayout.vue` 的所有背景色、文字色、边框色
- `LoginPage.vue` 的背景色、文字色
- 全局 `style.css` 中的自定义变量

#### Scenario: 自定义样式暗色适配
- **WHEN** 用户切换到暗色模式
- **THEN** 顶部栏、侧边栏、页签栏、内容区的背景色/文字色/边框色适配暗色
- **AND** 无亮色背景残留

#### Scenario: 登录页暗色适配
- **WHEN** 用户在暗色模式下访问登录页
- **THEN** 登录页背景、卡片、输入框适配暗色模式

