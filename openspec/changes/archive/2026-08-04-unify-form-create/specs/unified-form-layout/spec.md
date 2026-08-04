# unified-form-layout Specification

## ADDED Requirements

### Requirement: FormPageLayout 统一外壳组件

系统 SHALL 提供 FormPageLayout 组件，为拖拽设计表单和自定义页面提供统一的布局外壳。

FormPageLayout SHALL 提供以下插槽：
- `default`：主体内容区（表单或自定义内容）
- `toolbar`：工具栏区（标题右侧的操作按钮）
- `footer`：底部按钮区（提交/取消等）

FormPageLayout SHALL 统一以下样式：
- label-width 默认值（与 form-create 渲染的表单一致）
- 内容区间距（padding/gap）
- 底部按钮区的位置和对齐方式

#### Scenario: 自定义页面使用 FormPageLayout

- **WHEN** 开发人员编写自定义复杂表单页面
- **THEN** 页面使用 `<FormPageLayout title="xxx">` 包裹内容
- **AND** 内部可放置 `<FormRenderer>` 或自定义 `<el-form>`
- **AND** 页面风格与拖拽设计的表单页面一致

#### Scenario: FormPageLayout 包含 FormRenderer

- **WHEN** FormPageLayout 的 default 插槽中放置 FormRenderer
- **THEN** FormRenderer 渲染的表单与 FormPageLayout 的样式协调
- **AND** label-width、间距等不冲突

### Requirement: 自定义页面风格一致性

自定义页面（不使用 FormRenderer 的页面）SHALL 通过 FormPageLayout 和 Element Plus 原生组件保证与拖拽设计表单的视觉一致性。

自定义页面 SHALL NOT 引入与 form-create 渲染表单不一致的样式覆盖。

#### Scenario: 自定义页面与拖拽表单并排比较

- **WHEN** 用户在浏览器中同时打开一个拖拽设计的表单页面和一个自定义页面
- **THEN** 两个页面的标题栏、间距、label 对齐方式视觉一致
- **AND** 底部按钮区的位置和样式一致
