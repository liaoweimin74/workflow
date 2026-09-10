# business-form-data Specification

## Purpose
业务表单数据（BizDataService）能力变化 delta：四个 CRUD 操作可被 handler 覆盖接管；更新与删除受流程状态守卫拦截。

## MODIFIED Requirements

### Requirement: 业务数据新增

系统 SHALL 提供新增业务数据记录的接口：`POST /api/v1/biz-data/{formKey}`。

新增时，系统 SHALL 校验请求体字段与表单定义的 column_config 匹配，未知字段 SHALL 被忽略或拒绝；必填字段缺失 SHALL 返回 400。

新增时，系统 SHALL 强制写入当前租户的 tenant_id，不接收客户端传入的 tenant_id。

新增时，系统 SHALL 检查唯一字段冲突，冲突 SHALL 返回 409。

系统 SHALL 使用参数化 SQL（PreparedStatement）执行插入，禁止拼接用户输入。

当 formKey 存在声明覆盖 create 的 handler 时，系统 SHALL 将该操作交接给 handler 的 create 方法，其返回值直接作为接口响应；handler 未覆盖 create 时，系统 SHALL 照常执行通用新增（含装饰钩子链）。

#### Scenario: 新增业务数据

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** 请求体包含合法的业务字段值
- **THEN** 系统插入一条记录到 wf_biz_<formKey>
- **AND** 返回 200 与新建记录（含 id、created_at、version=1）

#### Scenario: 新增缺少必填字段

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** 请求体缺少 column_config 中标记必填的字段
- **THEN** 系统返回 400 错误
- **AND** 不插入记录

#### Scenario: 新增违反唯一约束

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** 请求体中唯一字段的值与已有记录（同租户）冲突
- **THEN** 系统返回 409 错误
- **AND** 不插入记录

#### Scenario: 新增到不存在的表单

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** formKey 对应的业务表单不存在或未发布
- **THEN** 系统返回 404 错误

#### Scenario: 覆盖 create 的 handler 接管新增

- **WHEN** formKey 存在声明 overridesCreate() 的 handler
- **AND** 用户调用 POST /api/v1/biz-data/{formKey}
- **THEN** 系统调用该 handler 的 create 方法
- **AND** 返回该方法的返回值

---

### Requirement: 业务数据查询

系统 SHALL 提供业务数据分页查询接口：`GET /api/v1/biz-data/{formKey}`。

查询 SHALL 支持：分页（page/size）、字段筛选（filter 集合）、关键词搜索（keyword，对指定文本列 LIKE）、排序（sort/order）。

字段筛选与排序的字段名 SHALL 仅接受 column_config 中的 key 及内置字段（id/created_at/updated_at），其他字段名 SHALL 被拒绝（400）。

所有查询 SHALL 强制按当前租户 tenant_id 过滤。

系统 SHALL 提供单条详情接口：`GET /api/v1/biz-data/{formKey}/{id}`，记录不存在 SHALL 返回 404。

当 formKey 存在声明覆盖 query 的 handler 时，系统 SHALL 将该查询交接给 handler 的 query 方法，其返回值（分页结构）直接作为接口响应。

#### Scenario: 分页查询业务数据

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}?page=0&size=20
- **THEN** 系统返回当前租户下该表单的数据分页结果
- **AND** 响应包含 records 列表与 total 总数

#### Scenario: 按字段筛选查询

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}?filter=dept:研发部
- **AND** dept 是 column_config 中的合法字段
- **THEN** 系统返回 dept 等于"研发部"的记录

#### Scenario: 非法排序字段

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}?sort=unknownField
- **AND** unknownField 不在 column_config 中
- **THEN** 系统返回 400 错误

#### Scenario: 查询单条详情

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}/{id}
- **AND** 记录存在且属于当前租户
- **THEN** 系统返回该记录的完整字段值

#### Scenario: 查询不存在的记录

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}/{id}
- **AND** 记录不存在或不属于当前租户
- **THEN** 系统返回 404 错误

#### Scenario: 覆盖 query 的 handler 接管查询

- **WHEN** formKey 存在声明 overridesQuery() 的 handler
- **AND** 用户调用 GET /api/v1/biz-data/{formKey}
- **THEN** 系统调用该 handler 的 query 方法
- **AND** 返回该方法的返回值（分页结构）

---

### Requirement: 业务数据更新

系统 SHALL 提供更新业务数据记录的接口：`PUT /api/v1/biz-data/{formKey}/{id}`。

更新 SHALL 使用乐观锁：请求必须携带 version，与当前记录 version 不一致 SHALL 返回 409。

更新 SHALL 应用与新增相同的字段校验（未知字段、必填字段、唯一字段冲突）。

更新 SHALL 强制限定当前租户范围，跨租户访问 SHALL 返回 404。

当 formKey 绑定了流程（processKey 非空）时，更新 SHALL 先执行状态守卫检查；记录关联的流程实例运行中 SHALL 返回 409 拒绝更新。

当 formKey 存在声明覆盖 update 的 handler 时，系统 SHALL 将该更新交接给 handler 的 update 方法；覆盖实现 SHALL 自行负责所需守卫检查与校验。

#### Scenario: 更新业务数据

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 请求体携带正确的 version 与合法的字段值
- **THEN** 系统更新该记录
- **AND** version 自增
- **AND** 返回更新后的记录

#### Scenario: 乐观锁冲突

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 请求体携带的 version 与当前记录不一致
- **THEN** 系统返回 409 错误
- **AND** 不更新记录

#### Scenario: 更新违反唯一约束

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 更新后的唯一字段值与同租户其他记录冲突
- **THEN** 系统返回 409 错误
- **AND** 不更新记录

#### Scenario: 更新运行中流程的记录被拒

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** formKey 绑定了流程且该记录关联的流程实例运行中
- **THEN** 系统返回 409 错误
- **AND** 记录不被更新

#### Scenario: 覆盖 update 的 handler 接管更新

- **WHEN** formKey 存在声明 overridesUpdate() 的 handler
- **AND** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **THEN** 系统调用该 handler 的 update 方法
- **AND** 返回该方法的返回值

---

### Requirement: 业务数据删除

系统 SHALL 提供删除业务数据记录的接口：`DELETE /api/v1/biz-data/{formKey}/{id}`。

删除 SHALL 强制限定当前租户范围，跨租户访问 SHALL 返回 404。

删除后的记录 SHALL 从列表中消失。

当 formKey 绑定了流程（processKey 非空）时，删除 SHALL 先执行状态守卫检查；记录存在任何流程实例（运行中或已结束）SHALL 返回 409 拒绝删除。

当 formKey 存在声明覆盖 delete 的 handler 时，系统 SHALL 将该删除交接给 handler 的 delete 方法；覆盖实现 SHALL 自行负责所需守卫检查。

#### Scenario: 删除业务数据

- **WHEN** 用户调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** 记录存在且属于当前租户
- **THEN** 系统删除该记录
- **AND** 返回成功

#### Scenario: 删除跨租户记录

- **WHEN** 用户调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** 记录不属于当前租户
- **THEN** 系统返回 404 错误
- **AND** 不删除记录

#### Scenario: 删除已发起流程的记录被拒

- **WHEN** 用户调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** formKey 绑定了流程且该记录存在流程实例（运行中或已结束）
- **THEN** 系统返回 409 错误
- **AND** 记录不被删除

#### Scenario: 覆盖 delete 的 handler 接管删除

- **WHEN** formKey 存在声明 overridesDelete() 的 handler
- **AND** 用户调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **THEN** 系统调用该 handler 的 delete 方法