# query-page-renderer Specification

## Purpose
TBD - created by archiving change query-view-designer. Update Purpose after archive.
## Requirements
### Requirement: 通用页面渲染

系统 SHALL 提供页面渲染入口 `GET /page/:pageKey`（前端路由），由 PageRenderer 组件承载。
PageRenderer SHALL 按 pageKey 加载已发布页面定义（type=VIEW 加载编译产物并注入单一隐式数据源；type=PAGE 加载原始 schema 并按 dataSources 绑定层实例化 DataSourceRegistry），并通过 FormRenderer 渲染。
页面不存在、未发布或 schema 无法解析时，PageRenderer SHALL 展示错误提示，不得白屏崩溃。
PageRenderer SHALL 在渲染时注入数据源 API 到 form-create 运行时（扩展 formCreateInject 机制）。

#### Scenario: 渲染已发布视图
- **WHEN** 用户访问 /page/leave-query
- **AND** leave-query 对应已发布 type=VIEW 的视图定义（编译产物完好）
- **THEN** 页面渲染查询条件区与数据表格
- **AND** 页面绑定 wf_biz_leave 物理表数据

#### Scenario: 渲染未发布页面
- **WHEN** 用户访问 /page/unknown-page
- **AND** 该 pageKey 不存在或未发布
- **THEN** 页面展示错误提示
- **AND** 不抛出未捕获异常

#### Scenario: 渲染畸形 schema
- **WHEN** 发布记录存在但 schema 无法被 FormRenderer 解析
- **THEN** 页面展示"页面配置异常，请联系管理员"
- **AND** 页面其余部分正常渲染

---

### Requirement: 页面数据查询 API

系统 SHALL 提供页面数据分页查询接口 `GET /api/v1/pages/{pageKey}/data`。
系统 SHALL 校验 pageKey 对应的页面定义已发布，未发布 SHALL 返回 404。
查询请求 SHALL 携带数据源标识（dsId）：type=VIEW 视图为默认数据源（语义等价 dsId 缺省）；type=PAGE 页面按 dsId 解析对应绑定层条目（dataSources[].id），经 refId 定位全局数据源，读取绑定表单项 form_key。
查询参数 filter 中的字段名 SHALL 仅接受页面 schema 为对应数据源声明的搜索字段，其他字段 SHALL 被忽略或返回 400（拒绝未知字段注入）。
所有查询 SHALL 强制按当前租户 tenant_id 过滤。
查询 SHALL 复用 BizDataService 分页过滤引擎执行。
查询 SHALL 经 DataSourceAdapter 路由：FORM 适配器执行查询；API/SYSTEM 适配器未启用时返回"数据源类型未启用"错误（一期仅 FORM 可查询）。

#### Scenario: 按声明字段查询（视图）
- **WHEN** 调用 GET /api/v1/pages/leave-query/data?filter=name:张
- **AND** name 是视图声明的搜索字段
- **THEN** 系统返回 wf_biz_leave 中 name 匹配的记录分页结果
- **AND** 响应包含 records 列表与 total

#### Scenario: 按数据源查询（自定义页面）
- **WHEN** 调用 GET /api/v1/pages/product-dashboard/data?dsId=ds-products&filter=name:鼠标
- **AND** ds-products 是页面绑定层条目，refId 指向 formKey="product" 的全局数据源
- **AND** name 是 ds-products 声明的 searchFields 字段
- **THEN** 系统返回 wf_biz_product 中 name 匹配的记录分页结果
- **AND** 响应包含 records 列表与 total

#### Scenario: 查询未声明的字段被拒绝
- **WHEN** 调用 GET /api/v1/pages/leave-query/data?filter=secretColumn:xxx
- **AND** secretColumn 不在页面 schema 为对应数据源声明的搜索字段中
- **THEN** 系统返回 400 错误
- **AND** 不执行查询

#### Scenario: 查询 API 数据源（一期未启用）
- **WHEN** 调用 GET /api/v1/pages/product-dashboard/data?dsId=ds-ext
- **AND** ds-ext 的 refId 指向 type=API 的全局数据源
- **THEN** 系统返回"数据源类型未启用"错误
- **AND** 不发起外部请求

#### Scenario: 查询未发布页面
- **WHEN** 调用 GET /api/v1/pages/{pageKey}/data
- **AND** pageKey 对应页面不存在或未发布
- **THEN** 系统返回 404 错误

---

### Requirement: 页面菜单注册

视图/页面发布成功后，系统 SHALL 提供菜单注册能力（前端菜单注册页或自动注册），菜单项指向 `/page/:pageKey`。
菜单权限码 SHALL 使用 `page:*` 命名空间（如 page:view、page:edit）。
系统 SHALL 在迁移脚本（V19）中创建页面管理相关菜单与 ROLE_ADMIN 默认授权。

#### Scenario: 发布后注册菜单
- **WHEN** 视图"请假查询"发布成功
- **AND** 用户在菜单注册页为视图创建菜单项（路径 /page/leave-query，权限 page:view）
- **THEN** 菜单保存成功
- **AND** 有权限的用户可通过菜单访问该查询页面

#### Scenario: 迁移脚本创建页面管理菜单
- **WHEN** 执行 V19 迁移脚本
- **THEN** 创建"页面管理"父菜单与子菜单（页面列表）
- **AND** ROLE_ADMIN 获得页面管理相关权限

