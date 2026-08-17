# business-form-data Specification

## Purpose
TBD - created by archiving change business-form-table. Update Purpose after archive.
## Requirements
### Requirement: 业务表单物理表管理

系统 SHALL 在发布 type=BUSINESS 的表单定义时，基于 column_config 列映射通过运行时受控 DDL 创建或变更物理表 `wf_biz_<formKey>`。

物理表 SHALL 包含固定列：id（VARCHAR(64) 主键）、tenant_id（VARCHAR(64) NOT NULL）、version（INT 乐观锁）、created_by、created_at、updated_at，以及按 column_config 映射生成的业务列。

列名 SHALL 通过正则白名单 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 校验，列类型 SHALL 仅允许白名单集合（VARCHAR/TEXT/INT/DECIMAL/DATE/DATETIME/TINYINT/JSON），长度与精度 SHALL 按类型校验。

表结构变更 SHALL 仅允许增列、改列宽、改必填、加索引；系统 SHALL 禁止删列与类型跨类变更（如 VARCHAR 改 DECIMAL）。

唯一约束 SHALL 以 (tenant_id, 字段) 复合索引形式创建。

发布时，系统 SHALL 允许 schema 包含子表组件（group/tableForm/subForm）：group 与 tableForm 映射为独立子表物理表，subForm 映射为主表 JSON 列，具体持久化行为遵循 business-form-subtable 规范。系统 SHALL 拒绝 schema 中包含不可映射组件（userPicker、deptPicker、divider、groupContainer）的发布，并提示组件类型。

#### Scenario: 发布业务表单创建物理表

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** column_config 包含 name（VARCHAR(255) 必填）与 amount（DECIMAL(18,2)）两列
- **THEN** 系统创建物理表 wf_biz_<formKey>
- **AND** 表包含 id、tenant_id、version、created_by、created_at、updated_at 固定列
- **AND** 表包含 name 与 amount 业务列
- **AND** 发布版本记录中保存结构变更历史

#### Scenario: 发布包含子表组件的业务表单

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 group/tableForm 子表组件
- **AND** column_config 中该子表字段配置了 subColumns 列映射
- **THEN** 系统创建主表 wf_biz_<formKey>
- **AND** 系统创建子表 wf_biz_<formKey>_<field>
- **AND** 发布成功返回 200

#### Scenario: 发布包含不可映射组件的业务表单

- **WHEN** 用户尝试发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 userPicker 等不可映射组件
- **THEN** 系统返回 400 错误
- **AND** 提示移除不可映射组件后方可发布

#### Scenario: 变更已发布业务表单的表结构

- **WHEN** 用户修改已发布的 BUSINESS 表单定义并发布新版本
- **AND** 新增了一个字段、删除了一个字段、修改了一个字段长度
- **THEN** 系统对物理表执行 ADD COLUMN 与 MODIFY COLUMN（加宽）
- **AND** 系统不执行 DROP COLUMN（被删字段的列保留）
- **AND** 新版本记录保存结构变更历史

#### Scenario: 非法列名发布

- **WHEN** 用户发布的 column_config 包含非法列名（如含空格或特殊字符）
- **THEN** 系统返回 400 错误
- **AND** 不执行任何 DDL

---

### Requirement: 业务数据新增

系统 SHALL 提供新增业务数据记录的接口：`POST /api/v1/biz-data/{formKey}`。

新增时，系统 SHALL 校验请求体字段与表单定义的 column_config 匹配，未知字段 SHALL 被忽略或拒绝；必填字段缺失 SHALL 返回 400。

新增时，系统 SHALL 强制写入当前租户的 tenant_id，不接收客户端传入的 tenant_id。

新增时，系统 SHALL 检查唯一字段冲突，冲突 SHALL 返回 409。

系统 SHALL 使用参数化 SQL（PreparedStatement）执行插入，禁止拼接用户输入。

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

---

### Requirement: 业务数据查询

系统 SHALL 提供业务数据分页查询接口：`GET /api/v1/biz-data/{formKey}`。

查询 SHALL 支持：分页（page/size）、字段筛选（filter 集合）、关键词搜索（keyword，对指定文本列 LIKE）、排序（sort/order）。

字段筛选与排序的字段名 SHALL 仅接受 column_config 中的 key 及内置字段（id/created_at/updated_at），其他字段名 SHALL 被拒绝（400）。

所有查询 SHALL 强制按当前租户 tenant_id 过滤。

系统 SHALL 提供单条详情接口：`GET /api/v1/biz-data/{formKey}/{id}`，记录不存在 SHALL 返回 404。

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

---

### Requirement: 业务数据更新

系统 SHALL 提供更新业务数据记录的接口：`PUT /api/v1/biz-data/{formKey}/{id}`。

更新 SHALL 使用乐观锁：请求必须携带 version，与当前记录 version 不一致 SHALL 返回 409。

更新 SHALL 应用与新增相同的字段校验（未知字段、必填字段、唯一字段冲突）。

更新 SHALL 强制限定当前租户范围，跨租户访问 SHALL 返回 404。

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

---

### Requirement: 业务数据删除

系统 SHALL 提供删除业务数据记录的接口：`DELETE /api/v1/biz-data/{formKey}/{id}`。

删除 SHALL 强制限定当前租户范围，跨租户访问 SHALL 返回 404。

删除后的记录 SHALL 从列表中消失。

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

