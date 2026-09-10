# business-form-subtable Specification

## Purpose
定义 BUSINESS（物理表模型）表单中子表组件的持久化行为：子表字段映射为独立物理表（1:N）、主表 CRUD 内嵌子表数据往返、独立子表行 CRUD 接口与增量 diff 更新。

## ADDED Requirements

### Requirement: 子表组件发布支持

系统 SHALL 允许 type=BUSINESS 表单发布包含 form-create 子表组件（`group`、`tableForm`）的 schema，并将子表字段映射为独立子表物理表。

系统 SHALL 允许 `subForm`（单对象分组）组件发布，其值序列化为主表 JSON 列存储，不创建独立子表。

系统 SHALL 拒绝发布包含不可映射组件（`userPicker`、`deptPicker`、`divider`、`groupContainer`）的 BUSINESS 表单，返回 400 并提示组件类型。

#### Scenario: 发布含 group 子表的业务表单

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 type=group 的子表字段（field=items，含子字段 name/amount）
- **AND** column_config 中 items 配置了 subColumns 列映射
- **THEN** 系统创建主表 wf_biz_<formKey>
- **AND** 系统创建子表 wf_biz_<formKey>_items
- **AND** 发布成功返回 200

#### Scenario: 发布含 subForm 的业务表单

- **WHEN** 用户发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 type=subForm 的字段
- **AND** column_config 中该字段映射为 JSON 列
- **THEN** 系统仅创建主表 wf_biz_<formKey>，不创建子表
- **AND** 发布成功返回 200

#### Scenario: 发布含 userPicker 的业务表单

- **WHEN** 用户尝试发布 type=BUSINESS 的表单定义
- **AND** schema 中包含 userPicker 组件
- **THEN** 系统返回 400 错误
- **AND** 提示移除不可映射组件后方可发布

---

### Requirement: 子表物理表结构

系统 SHALL 为每个子表字段创建独立物理表 `wf_biz_<formKey>_<field>`，`field` 通过白名单 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 校验。

子表 SHALL 包含固定列：id（VARCHAR(64) 主键）、biz_id（VARCHAR(64) NOT NULL，关联主表行 id）、tenant_id（VARCHAR(64) NOT NULL）、sort_no（INT NOT NULL，行序）、version（INT 乐观锁）、created_by、created_at、updated_at，以及按 subColumns 映射生成的子表业务列。

系统 SHALL 在 (tenant_id, biz_id) 上建立索引以支持按主表行查询子表行。

子表结构变更 SHALL 遵循与主表一致的约束：仅允许增列、改列宽、改必填、加索引；禁止删列与类型跨类变更。

#### Scenario: 创建子表物理表

- **WHEN** 用户发布含子表 items（子列 name VARCHAR(255)、amount DECIMAL(18,2)）的业务表单
- **THEN** 系统创建子表 wf_biz_<formKey>_items
- **AND** 子表包含 id、biz_id、tenant_id、sort_no、version 及 name、amount 业务列
- **AND** 子表在 (tenant_id, biz_id) 上有索引

#### Scenario: 子表字段非法

- **WHEN** 用户发布含子表的表单
- **AND** 子表字段名含非法字符（如含空格）
- **THEN** 系统返回 400 错误
- **AND** 不执行任何 DDL

#### Scenario: 已发布子表结构变更

- **WHEN** 用户修改已发布业务表单的子表列映射并发布新版本
- **AND** 新增了一个子列、删除了一个子列
- **THEN** 系统对子表执行 ADD COLUMN
- **AND** 系统不执行 DROP COLUMN（被删子列保留）

---

### Requirement: 主表 CRUD 内嵌子表数据

系统 SHALL 在主表数据新增（POST /api/v1/biz-data/{formKey}）时，将请求体中携带的子表字段（数组）批量写入子表物理表，每行 biz_id 关联新建主表行 id，sort_no 按数组序号赋值。

系统 SHALL 在主表数据更新（PUT /api/v1/biz-data/{formKey}/{id}）时，对请求携带的子表字段执行增量 diff：请求数组中不存在于库中的行插入、库中存在但请求中删除的行删除、内容变化的行更新，sort_no 按请求数组重新赋值；请求未携带的子表字段保持库中数据不变。

系统 SHALL 在主表数据查询（GET /api/v1/biz-data/{formKey}/{id}）时，按子表配置 subMode 决定是否内嵌返回子表行数组（subMode=embedded 时内嵌，sort_no 升序；subMode=dedicated 时不内嵌）。

系统 SHALL 在删除主表行时级联删除其全部子表行（同一事务）。

系统 SHALL 限制单次请求携带的子表行数不超过上限（默认 100），超限返回 400。

#### Scenario: 新增主表数据携带子表行

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** 请求体包含 items 子表字段（2 行数组）
- **THEN** 系统插入主表行
- **AND** 系统插入 2 行子表数据，biz_id 均为主表新行 id，sort_no 为 0、1

#### Scenario: 更新主表数据执行增量 diff

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 请求体携带 items 数组（含 1 行已存在 id 且内容变化、1 行无 id 的新行）
- **THEN** 系统更新已存在行的列值
- **AND** 系统插入新行
- **AND** 系统删除请求数组中不存在的库中行

#### Scenario: 更新未携带子表字段

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 请求体未包含 items 字段
- **THEN** 系统仅更新主表行
- **AND** 子表行保持不变

#### Scenario: 查询内嵌返回子表行

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}/{id}
- **AND** 该表单 items 子表配置为 embedded
- **THEN** 系统返回主表数据
- **AND** 响应包含 items 数组（子表行按 sort_no 升序）

#### Scenario: 删除主表级联删除子表

- **WHEN** 用户调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **THEN** 系统删除主表行
- **AND** 系统删除该主表行对应的全部子表行

#### Scenario: 子表行数超限

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}
- **AND** 请求体 items 数组超过 100 行
- **THEN** 系统返回 400 错误
- **AND** 不写入任何数据

---

### Requirement: 独立子表行 CRUD 接口

系统 SHALL 提供独立子表行 CRUD 接口，供 subMode=dedicated 配置或二次开发直接调用：

- `GET /api/v1/biz-data/{formKey}/{id}/sub/{field}` — 按 sort_no 升序返回子表行列表
- `POST /api/v1/biz-data/{formKey}/{id}/sub/{field}` — 追加一行（sort_no 取当前最大值+1）
- `PUT /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId}` — 更新一行（携带 version 乐观锁，冲突 409）
- `DELETE /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId}` — 删除一行

接口 SHALL 强制租户隔离（跨租户访问 404），主表行不存在 404，子表字段不存在 404，必填/类型校验复用业务数据校验机制。

#### Scenario: 查询子表行列表

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}/{id}/sub/items
- **AND** 主表行存在且属于当前租户
- **THEN** 系统返回该行 items 子表数据（sort_no 升序）

#### Scenario: 追加子表行

- **WHEN** 用户调用 POST /api/v1/biz-data/{formKey}/{id}/sub/items
- **AND** 请求体为合法的子表行数据
- **THEN** 系统插入新子表行
- **AND** 返回新建行（含 id、sort_no=当前最大值+1）

#### Scenario: 更新子表行乐观锁冲突

- **WHEN** 用户调用 PUT /api/v1/biz-data/{formKey}/{id}/sub/items/{rowId}
- **AND** 请求体 version 与当前行不一致
- **THEN** 系统返回 409 错误
- **AND** 不更新行

#### Scenario: 查询不存在主表行的子表

- **WHEN** 用户调用 GET /api/v1/biz-data/{formKey}/{id}/sub/items
- **AND** 主表行不存在或不属于当前租户
- **THEN** 系统返回 404 错误

---

### Requirement: 子表列配置结构

系统 SHALL 在 column_config 中以嵌套结构表达子表映射：子表字段项（key=子表 field）携带 subColumns 列表（子表内列映射，复用 ColumnConfig 结构）与 subMode（embedded/dedicated，缺省 embedded）。

系统 SHALL 校验子表内列映射与主表列映射相同的规则：列名白名单、列类型白名单、长度精度校验、必填/唯一/索引设置。

#### Scenario: 解析子表列配置

- **WHEN** 系统解析含子表 items 的 column_config
- **AND** items 配置了 subColumns（name VARCHAR、amount DECIMAL）与 subMode=embedded
- **THEN** 系统识别 items 为子表字段
- **AND** 子表列映射包含 name、amount

#### Scenario: 子表列配置非法

- **WHEN** 系统解析含子表的 column_config
- **AND** 子表内列名为非法字符
- **THEN** 系统返回 400 错误
- **AND** 拒绝发布
