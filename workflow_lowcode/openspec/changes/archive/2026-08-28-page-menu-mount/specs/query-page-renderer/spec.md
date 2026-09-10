<!--
Delta spec for page-menu-mount change.
修改既有 capability：query-page-renderer 的菜单注册与访问控制。
-->

## MODIFIED Requirements

### Requirement: 页面菜单注册

视图/页面发布成功后，系统 SHALL 提供菜单注册能力（设计器"挂接菜单"操作或菜单管理页手动创建），菜单项指向 `/page/:pageKey`，component 为 `page/PageRenderer`。
菜单权限码 SHALL 使用 `page:*` 命名空间，格式 SHALL 为 `page:read:{pageKey}`（每页唯一，action 位可扩展）。
挂接 SHALL 支持多挂接：同一页面 SHALL 可挂接多个菜单（不同 name/parentId），每次挂接创建一条新菜单，不要求同 path 唯一。
系统 SHALL 提供挂接菜单列表查询接口 `GET /api/v1/pages/{key}/menus` 与解除挂接接口 `DELETE /api/v1/pages/menus/{menuId}`（软删）。
系统 SHALL 在迁移脚本（V19）中创建页面管理相关菜单与 ROLE_ADMIN 默认授权。

#### Scenario: 设计器发布后一键挂接
- **WHEN** 视图"请假查询"发布成功
- **AND** 设计器点击"挂接菜单"，请求 name="请假查询"、parentId=人事目录
- **THEN** 系统创建菜单（path=/page/leave-query、component=page/PageRenderer、permission=page:read:leave-query、parent_id=人事目录）
- **AND** 有该权限的用户可通过菜单访问该查询页面

#### Scenario: 同一视图挂接多个菜单
- **WHEN** 同一已发布视图分别挂接到"人事管理"与"考勤管理"两个目录
- **THEN** 系统创建两条独立菜单记录（path 均为 /page/leave-query、parent_id 不同）
- **AND** 列表接口返回该视图的 2 条关联菜单

#### Scenario: 解除挂接
- **WHEN** 调用 DELETE /api/v1/pages/menus/{menuId} 解除某条关联菜单
- **THEN** 该菜单软删除（is_deleted=1）
- **AND** 列表接口不再返回该菜单，页面定义与其它的关联菜单不受影响

#### Scenario: 菜单管理页手动创建
- **WHEN** 用户在菜单管理页为视图创建菜单项（路径 /page/leave-query、权限 page:read:leave-query）
- **THEN** 菜单保存成功
- **AND** 侧边栏按角色权限展示该菜单

#### Scenario: 迁移脚本创建页面管理菜单
- **WHEN** 执行 V19 迁移脚本
- **THEN** 创建"页面管理"父菜单与子菜单（页面列表）
- **AND** ROLE_ADMIN 获得页面管理相关权限

---

### Requirement: 页面数据查询 API

系统 SHALL 提供页面数据分页查询接口 `GET /api/v1/pages/{pageKey}/data`。
系统 SHALL 校验 pageKey 对应的页面定义已发布，未发布 SHALL 返回 404。
系统 SHALL 校验访问权限：查询前 SHALL 按 path（`/page/{pageKey}`）查找全部关联菜单（is_deleted=0），无任何关联菜单 SHALL 返回 404（不暴露页面存在）；存在关联菜单但当前用户对**全部**关联菜单均无 `page:read:{pageKey}` 权限 SHALL 返回 403（OR 语义：拥有任一关联菜单权限即放行）。
查询请求 SHALL 携带数据源标识（dsId）：type=VIEW 视图为默认数据源（语义等价 dsId 缺省）；type=PAGE 页面按 dsId 解析对应绑定层条目（dataSources[].id），经 refId 定位全局数据源，读取绑定表单项 form_key。
查询参数 filter 中的字段名 SHALL 仅接受页面 schema 为对应数据源声明的搜索字段，其他字段 SHALL 被忽略或返回 400（拒绝未知字段注入）。
所有查询 SHALL 强制按当前租户 tenant_id 过滤。
查询 SHALL 复用 BizDataService 分页过滤引擎执行。
查询 SHALL 经 DataSourceAdapter 路由：FORM 适配器执行查询；API/SYSTEM 适配器未启用时返回"数据源类型未启用"错误（一期仅 FORM 可查询）。

#### Scenario: 按声明字段查询（视图）
- **WHEN** 调用 GET /api/v1/pages/leave-query/data?filter=name:张
- **AND** name 是视图声明的搜索字段
- **AND** 当前用户拥有 page:read:leave-query 权限
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

#### Scenario: 查询无任何关联菜单的页面
- **WHEN** 调用 GET /api/v1/pages/{pageKey}/data
- **AND** pageKey 对应页面已发布但无关联菜单（path=/page/{pageKey} 不存在或全部软删）
- **THEN** 系统返回 404 错误
- **AND** 不执行查询

#### Scenario: 无权限用户查询页面数据
- **WHEN** 调用 GET /api/v1/pages/{pageKey}/data
- **AND** 页面已发布且有关联菜单
- **AND** 当前用户对全部关联菜单均无 page:read:{pageKey} 权限
- **THEN** 系统返回 403 错误
- **AND** 不执行查询

#### Scenario: 多菜单 OR 放行
- **WHEN** 调用 GET /api/v1/pages/{pageKey}/data
- **AND** 页面关联 2 个菜单，当前用户仅对其中 1 个拥有 page:read:{pageKey} 权限
- **THEN** 系统放行查询
- **AND** 返回正常分页结果
