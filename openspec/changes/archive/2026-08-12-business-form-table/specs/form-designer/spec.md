# form-designer Delta Specification

## ADDED Requirements

### Requirement: 业务表单类型选择与列映射确认

表单列表页 SHALL 在新建表单时提供类型选择（工作流表单/业务表单），类型 SHALL 在创建时确定并在设计器中展示。

表单设计器 SHALL 对 type=BUSINESS 的表单提供发布前列映射确认：系统 SHALL 根据当前 schema 字段自动生成列映射草案（字段 key、显示名、列类型、长度、必填、唯一、索引），展示给用户确认。

列映射确认对话框 SHALL 允许用户调整列类型、长度、必填、唯一、索引属性；类型跨类变更（如 VARCHAR 改为 DECIMAL）SHALL 被禁止并提示。

列映射确认对话框中，子表/嵌套表单字段 SHALL 标记为不支持并提示移除。

列映射确认后，系统 SHALL 将 column_config 随发布请求一并提交。

业务表单在表单管理列表 SHALL 提供"管理数据"入口，跳转到业务数据管理页。

#### Scenario: 新建业务表单

- **WHEN** 用户在表单列表页点击"新建表单"并选择类型"业务表单"
- **THEN** 系统调用 POST /api/v1/form-definitions 并携带 type=BUSINESS
- **AND** 跳转到表单设计器页面
- **AND** 设计器展示业务表单类型标识

#### Scenario: 发布业务表单时确认列映射

- **WHEN** 用户在设计器中对 type=BUSINESS 的表单点击"发布"
- **THEN** 系统弹出列映射确认对话框
- **AND** 对话框展示自动生成的列映射草案（字段/类型/长度/必填/唯一/索引）
- **AND** 用户确认后提交发布请求（携带 column_config）

#### Scenario: 列映射类型跨类变更被禁止

- **WHEN** 用户在列映射确认对话框中尝试将某字段列类型从 VARCHAR 改为 DECIMAL
- **THEN** 系统阻止该修改并提示"类型跨类变更不被支持"

#### Scenario: 列映射含子表字段

- **WHEN** 列映射确认对话框中的字段列表包含子表/嵌套表单字段
- **THEN** 系统将该字段标记为"不支持"
- **AND** 提示移除后方可发布

#### Scenario: 管理业务数据

- **WHEN** 用户在表单列表页对 type=BUSINESS 的表单点击"管理数据"
- **THEN** 系统跳转到 /biz-data/{formKey} 业务数据管理页
