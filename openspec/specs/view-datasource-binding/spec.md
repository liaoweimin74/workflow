# view-datasource-binding Specification

## Purpose
TBD - created by archiving change unify-workflow-form-datasource. Update Purpose after archive.
## Requirements
### Requirement: VIEW 页面数据源绑定模型

PageDefinition SHALL 新增 `dataSourceId` 字段作为视图轨唯一数据绑定来源；`formKey` 字段 MUST 保留但代码 MUST NOT 再读取。发布校验 MUST 拒绝 dataSourceId 为空的视图，且 MUST 校验所引用数据源存在且状态为 ENABLED。

#### Scenario: 发布未绑定数据源的视图被拒绝
- **WHEN** 对 dataSourceId 为空的 VIEW 页面调用发布
- **THEN** 返回 400 错误提示必须绑定数据源

#### Scenario: 绑定已禁用数据源发布被拒绝
- **WHEN** 视图绑定的数据源处于 DISABLED 状态时调用发布
- **THEN** 返回 400 错误，页面保持 DRAFT

---

### Requirement: 视图列引用白名单校验

发布校验 MUST 校验 searchFields 与 columns 引用的列存在于绑定数据源 metadata.columns 中；大字段禁筛规则 MUST 仅对声明了 `columnType ∈ {JSON, TEXT, LONGTEXT}` 的列生效，无 columnType 声明的列（SYSTEM/API/WORKFLOW 系统列）不受该规则限制。

#### Scenario: 引用不存在列被拒绝
- **WHEN** searchFields 或 columns 引用了 metadata.columns 中不存在的 key 时调用发布
- **THEN** 返回 400 错误提示引用列不存在

#### Scenario: JSON 大字段作为查询条件被拒绝
- **WHEN** searchFields 引用 columnType 为 JSON 的列
- **THEN** 返回 400 错误提示不可作为查询条件

#### Scenario: 无列类型声明的系统列可作为查询条件
- **WHEN** 绑定 SYSTEM 数据源且 searchFields 引用无 columnType 的系统列
- **THEN** 发布校验通过

---

### Requirement: 视图渲染取数经统一 SPI

`GET /pages/{pageKey}/data` MUST 解析已发布页面的 dataSourceId 并经 DataSourceAdapter SPI（queryData）取数，MUST NOT 直连业务表服务；searchFields 白名单过滤逻辑 MUST 保留。

#### Scenario: 视图渲染页加载数据
- **WHEN** 已发布视图绑定的数据源为 WORKFLOW 类型，用户访问渲染页触发数据加载
- **THEN** 接口返回该 WORKFLOW 数据源的分页数据，前端表格正常渲染

#### Scenario: 筛选字段不在白名单被拒绝
- **WHEN** 请求 filter 含 schema 未声明的字段
- **THEN** 返回 400 错误提示筛选字段不在白名单

---

### Requirement: 详情弹窗双轨渲染

视图详情弹窗 MUST 按绑定数据源类型分流：type=FORM 时反查数据源 formKey 用表单渲染器展示详情；其余类型（SYSTEM/API/WORKFLOW）MUST 渲染只读 KV 列表。

#### Scenario: FORM 数据源详情渲染表单
- **WHEN** 用户在绑定 FORM 数据源的视图中点击查看详情
- **THEN** 弹窗以原表单布局只读展示行数据

#### Scenario: WORKFLOW 数据源详情渲染 KV
- **WHEN** 用户在绑定 WORKFLOW 数据源的视图中点击查看详情
- **THEN** 弹窗以只读键值列表展示系统列与表单字段值

---

### Requirement: 写操作按钮按可写性显隐

open-create/edit/delete 操作按钮 MUST 仅当绑定数据源 metadata.writable=true 时渲染；只读数据源 MUST 仅保留 open-detail/open-link/refresh/export 按钮。

#### Scenario: 只读数据源隐藏写按钮
- **WHEN** 视图绑定的数据源 writable=false
- **THEN** 渲染页工具栏与操作列不出现新增/编辑/删除入口

