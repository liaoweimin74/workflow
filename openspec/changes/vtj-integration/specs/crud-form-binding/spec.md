# crud-form-binding Delta Spec

## REMOVED Requirements

### Requirement: CRUD 页面通过前端 rule JSON 驱动 FormRenderer

**Reason**: form-create 依赖移除，CRUD 页面改为 VTJ 设计器出码的 Vue SFC，不再使用 rule JSON 驱动 FormRenderer。

**Migration**: CRUD 页面通过 VTJ 设计器搭建，出码为 Vue SFC。表单使用 XDialogForm + XField，不再使用 SearchTable + FormRenderer + rule JSON。

### Requirement: SearchTable 集成 FormRenderer

**Reason**: SearchTable 组件废弃，其功能由 VTJ 出码的 CRUD 页面替代。

**Migration**: VTJ 出码的 CRUD 页面直接包含搜索栏、表格、弹窗表单逻辑，不依赖 SearchTable 和 FormRenderer。

## MODIFIED Requirements

### Requirement: CRUD 表单数据走业务接口

CRUD 页面的表单 SHALL 只负责表单渲染和校验，不负责数据持久化。

表单提交数据 SHALL 由各 CRUD 页面的业务逻辑处理，写入对应的业务表。

CRUD 页面 SHALL 不依赖 FormDefinition 或 FormData 后端表，表单数据直接走业务接口。

#### Scenario: 创建操作

- **WHEN** 用户点击新增按钮
- **THEN** VTJ 出码页面打开弹窗表单（XDialogForm + XField）
- **AND** 表单字段为空
- **AND** 用户填写后点击确定
- **AND** 页面调用业务创建 API

#### Scenario: 编辑操作

- **WHEN** 用户点击行的编辑按钮
- **THEN** VTJ 出码页面打开弹窗表单
- **AND** 当前行的数据填入表单字段
- **AND** 用户修改后点击确定
- **AND** 页面调用业务更新 API
