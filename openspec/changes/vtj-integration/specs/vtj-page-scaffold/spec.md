# vtj-page-scaffold Delta Spec

## ADDED Requirements

### Requirement: CRUD 页面可视化搭建

系统 SHALL 使用 VTJ 设计器搭建 CRUD 管理页面，出码导出 Vue SFC 文件。

CRUD 页面 SHALL 包含以下区域：搜索栏（XQueryForm）、数据表格（XGrid）、新增/编辑弹窗表单（XDialogForm + XField）、删除确认（ElMessageBox）。

出码后的 Vue SFC SHALL 编译进前端产物，运行时不依赖 @vtj/renderer。

系统 SHALL 为以下 5 个系统管理页面生成 VTJ 出码 SFC：UserPage、RolePage、OrgPage、MenuPage、DictPage。

#### Scenario: 搭建用户管理页面

- **WHEN** 开发者使用 VTJ 设计器搭建用户管理页面
- **THEN** 页面包含搜索栏（用户名、昵称、组织、状态）
- **AND** 页面包含数据表格（用户列表）
- **AND** 页面包含新增/编辑弹窗表单
- **AND** 出码生成 Vue SFC 文件

#### Scenario: CRUD 页面运行时不依赖 renderer

- **WHEN** 用户访问出码后的 CRUD 页面
- **THEN** 页面正常渲染和交互
- **AND** 不加载 @vtj/renderer 模块

### Requirement: SearchTable 组件废弃

系统 SHALL 废弃 SearchTable.vue 组件，其功能由 VTJ 出码的 CRUD 页面替代。

出码后的 CRUD 页面 SHALL 直接包含搜索栏、表格、弹窗表单的逻辑，不依赖 SearchTable 组件。

#### Scenario: CRUD 页面不再使用 SearchTable

- **WHEN** 开发者查看 5 个系统管理页面的源码
- **THEN** 页面代码中不引用 SearchTable 组件
- **AND** 页面代码中不引用 FormRenderer 组件
- **AND** 页面代码中不引用 form-create Rule 类型
