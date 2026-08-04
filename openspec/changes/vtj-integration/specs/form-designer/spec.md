# form-designer Delta Spec

## MODIFIED Requirements

### Requirement: 表单设计器页面

用户 SHALL 能通过管理后台导航进入表单设计器页面。

表单设计器 SHALL 集成在现有前端项目中，通过懒加载路由访问，路径为 `/form/designer`。

表单设计器页面 SHALL 采用 VTJ 设计器布局：
- 左侧物料面板（VTJ 内置物料 + 自定义物料）
- 中间设计画布（VTJ 画布区域）
- 右侧设置面板（属性配置、样式、事件、指令）

表单设计器页面 SHALL 提供顶部工具栏，包含保存、发布、预览、版本历史按钮。

#### Scenario: 导航到表单设计器
- **WHEN** 用户从表单列表页点击"新建表单"或"编辑表单"
- **THEN** 系统懒加载 FormDesigner.vue 组件
- **AND** 页面显示 VTJ 设计器界面
- **AND** 物料面板显示 XForm、XField 等可拖拽组件

#### Scenario: 创建新表单
- **WHEN** 用户从表单列表页点击"新建表单"
- **THEN** 系统创建一个 DRAFT 状态的表单定义
- **AND** 跳转到表单设计器页面
- **AND** 设计画布为空

## MODIFIED Requirements

### Requirement: 拖拽构建表单

设计器 SHALL 支持从物料面板拖拽 XForm 和 XField 组件到设计画布，构建表单结构。

设计器 SHALL 支持以下 XField editor 类型：text（单行文本）、textarea（多行文本）、picker（数据选择器）、grid（表格编辑器）、checkbox（多选）、radio（单选）。

设计器 SHALL 支持组件的拖拽排序、复制、删除操作。

设计器 SHALL 支持 XField 的级联配置（cascader 属性），根据字段值变化刷新 options。

#### Scenario: 拖拽组件到画布
- **WHEN** 用户从物料面板拖拽 XField 到设计画布的 XForm 中
- **THEN** 画布上创建对应的表单字段
- **AND** 右侧设置面板显示该字段的配置项

#### Scenario: 删除组件
- **WHEN** 用户选中组件后点击删除按钮或按 Delete 键
- **THEN** 该组件从画布中移除
- **AND** DSL JSON 同步更新

#### Scenario: 拖拽排序组件
- **WHEN** 用户拖拽画布中的组件到新位置
- **THEN** 组件顺序更新
- **AND** DSL JSON 中节点顺序同步更新

## MODIFIED Requirements

### Requirement: 组件属性配置

设计器 SHALL 支持配置选中组件的属性，设置面板按组件类型动态展示对应配置项。

XField 的属性面板 SHALL 包含以下配置：label（标签）、name（字段标识）、editor（编辑器类型）、disabled（禁用）、readonly（只读）、visible（显隐控制）、required（必填）、options（选项数据）、placeholder（占位提示）、cascader（级联字段）。

#### Scenario: 配置基本属性
- **WHEN** 用户选中 XField 组件
- **THEN** 设置面板显示属性配置项：label、name、editor、placeholder

#### Scenario: 配置字段显隐
- **WHEN** 用户为 XField 配置 visible 属性
- **THEN** 该字段在渲染时根据 visible 值控制显隐

## REMOVED Requirements

### Requirement: 组件属性配置

**Reason**: form-create 的属性配置方式被 VTJ 设计器的设置器替代，属性项和配置方式完全变更。

**Migration**: 使用 VTJ 设计器原生的设置面板配置 XField 属性，替代 form-create 的属性面板。
