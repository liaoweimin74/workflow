## ADDED Requirements

### Requirement: 配置面板 SHALL 提供列配置功能

通用配置面板 SHALL 提供可视化列配置界面。

#### Scenario: 打开列配置
- **WHEN** 用户点击"列配置"按钮
- **THEN** 配置面板 SHALL 显示列列表，支持添加、删除、编辑列

#### Scenario: 编辑列属性
- **WHEN** 用户在列配置中选择某一列并修改属性
- **THEN** 配置面板 SHALL 实时更新列配置预览

#### Scenario: 保存列配置
- **WHEN** 用户确认列配置修改
- **THEN** 配置面板 SHALL 通过 `update:columns` 事件通知父组件

---

### Requirement: 配置面板 SHALL 提供操作列配置功能

通用配置面板 SHALL 提供可视化操作列配置界面。

#### Scenario: 打开操作列配置
- **WHEN** 用户点击"操作列"配置按钮
- **THEN** 配置面板 SHALL 显示按钮列表，支持添加、删除、编辑按钮

#### Scenario: 编辑按钮属性
- **WHEN** 用户在操作列配置中选择某一按钮并修改属性
- **THEN** 配置面板 SHALL 实时更新按钮配置预览

#### Scenario: 保存操作列配置
- **WHEN** 用户确认操作列配置修改
- **THEN** 配置面板 SHALL 通过 `update:action-buttons` 事件通知父组件

---

### Requirement: 配置面板 SHALL 可选显示搜索字段配置

通用配置面板 SHALL 支持可选的搜索字段配置功能。

#### Scenario: 启用搜索字段配置
- **WHEN** 父组件设置 `showSearch` 为 `true`
- **THEN** 配置面板 SHALL 显示搜索字段配置标签页

#### Scenario: 禁用搜索字段配置
- **WHEN** 父组件设置 `showSearch` 为 `false` 或未设置
- **THEN** 配置面板 SHALL 不显示搜索字段配置标签页

---

### Requirement: 配置面板 SHALL 在 PageDesigner 中通过弹窗使用

PageDesigner SHALL 通过弹窗方式使用通用配置面板。

#### Scenario: 打开配置弹窗
- **WHEN** 用户在 PageDesigner 属性面板中点击配置按钮
- **THEN** PageDesigner SHALL 打开包含 TableConfigPanel 的弹窗

#### Scenario: 关闭配置弹窗
- **WHEN** 用户关闭配置弹窗
- **THEN** PageDesigner SHALL 将配置结果同步到组件属性
