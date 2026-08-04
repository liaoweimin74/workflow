# vtj-designer-integration Delta Spec

## ADDED Requirements

### Requirement: VTJ.PRO 设计器集成

系统 SHALL 将 VTJ.PRO 设计器嵌入现有前端应用，作为可视化页面和表单设计工具。

系统 SHALL 安装以下 VTJ.PRO 依赖包：@vtj/pro, @vtj/web, @vtj/renderer, @vtj/cli, @vtj/ui, @vtj/utils, @vtj/icons。

系统 SHALL 在 vite.config.ts 中配置 `createDevTools()` Vite 插件，启用 VTJ 设计器开发工具。

系统 SHALL 在 main.ts 中使用 `createProvider()` 初始化 VTJ 引擎，替代原有的直接 `createApp()` 调用。

系统 SHALL 移除 @form-create/element-ui 和 @form-create/designer 依赖。

#### Scenario: VTJ 设计器加载

- **WHEN** 开发者启动前端开发服务器
- **THEN** Vite 加载 createDevTools() 插件
- **AND** VTJ 设计器入口在页面右下角显示编辑图标
- **AND** 点击编辑图标进入 VTJ 设计器

#### Scenario: 移除 form-create 依赖

- **WHEN** 前端项目编译构建
- **THEN** 构建产物中不包含 @form-create/element-ui 和 @form-create/designer
- **AND** package.json 中不包含 form-create 相关依赖

### Requirement: VTJ 在线流程表单设计器

系统 SHALL 使用 VTJ 设计器作为流程表单的在线设计工具，替代 form-create FcDesigner。

设计器 SHALL 提供 XForm 和 XField 组件供用户拖拽搭建表单。

设计器 SHALL 支持配置 XField 的以下属性：label（标签）、name（字段标识）、editor（编辑器类型）、disabled（禁用）、readonly（只读）、visible（显隐）、required（必填）、options（选项数据）。

设计器 SHALL 支持配置 XField 的 editor 为内置类型（text/textarea/picker/grid/checkbox/radio）或自定义组件对象。

设计器 SHALL 在保存时导出 VTJ DSL JSON，通过 API 存入后端 FormDefinition.schema 字段。

设计器 SHALL 在加载时从后端 API 获取 DSL JSON 并还原设计状态。

#### Scenario: 设计表单并保存

- **WHEN** 用户在 VTJ 设计器中拖拽 XForm 和 XField 组件搭建表单
- **AND** 点击保存按钮
- **THEN** 设计器导出 DSL JSON
- **AND** 系统调用 PUT /api/v1/form-definitions/{id} 将 DSL JSON 存入 schema 字段

#### Scenario: 加载已有表单设计

- **WHEN** 用户从表单列表页点击编辑表单
- **THEN** 系统调用 GET /api/v1/form-definitions/{id} 获取 DSL JSON
- **AND** VTJ 设计器加载 DSL 还原设计状态

#### Scenario: 使用自定义组件作为字段编辑器

- **WHEN** 用户为 XField 配置 editor 为 LookupPicker 组件对象
- **AND** 配置 props 传参（如 dictType）
- **THEN** 设计器画布中 XField 渲染为 LookupPicker 组件
- **AND** 运行时 renderer 也能正确渲染该自定义编辑器
