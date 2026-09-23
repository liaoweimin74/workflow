# business-form-data Delta Specification

## ADDED Requirements

### Requirement: 业务数据引用字段维护

业务表单发布时，schema 中的 dataPicker 字段 SHALL 在底表映射为两列：`<key>`（VARCHAR(64)，存被引用记录 id，多选逗号分隔）与 `<key>_text`（VARCHAR(1024)，存冗余显示文本，多选逗号分隔）。

`<key>_text` 列 SHALL 标记为隐藏列（hidden=true）：不进入前端管理页默认表格列与可筛选列，但参与 CRUD 写入。

新增/更新业务数据时，系统 SHALL 校验 dataPicker 字段的 id 均存在于目标表单（同租户），任一不存在 SHALL 返回 400 且不写入。

新增/更新业务数据时，系统 SHALL 自动生成并写入 `<key>_text`：按目标表单 displayField 解析各 id 的显示文本，多选按逗号分隔拼接且与 id 顺序一致。

#### Scenario: 发布生成两列

- **WHEN** 业务表单 schema 含 dataPicker 字段 emp_id（sourceFormKey=emp_profile，displayField=name）
- **AND** 用户发布该表单
- **THEN** 底表生成 emp_id VARCHAR(64) 与 emp_id_text VARCHAR(1024) 两列
- **AND** emp_id_text 标记为隐藏列（hidden=true）

#### Scenario: 新增时校验引用并维护文本

- **WHEN** 用户新增业务数据且 emp_id=target-1
- **AND** target-1 存在于 emp_profile 表单且其 name=张三
- **THEN** emp_id 存 target-1，emp_id_text 存"张三"

#### Scenario: 多选维护冗余文本

- **WHEN** 用户新增业务数据且 emp_id="a,b"（多选）
- **AND** a、b 的显示文本分别为"张三""李四"
- **THEN** emp_id_text 存"张三,李四"

#### Scenario: 引用 id 不存在被拒绝

- **WHEN** 用户新增业务数据且 emp_id=not-exist
- **AND** not-exist 不存在于目标表单
- **THEN** 系统返回 400 错误
- **AND** 不写入数据

---

### Requirement: 业务数据引用解析接口

系统 SHALL 提供批量解析接口：`GET /api/v1/biz-data/{formKey}/resolve?ids=id1,id2,...`。

接口 SHALL 返回 id → 显示字段文本 的映射（仅包含存在的记录；不存在的 id 不出现在结果中）。

接口 SHALL 强制当前租户范围，跨租户记录不可解析。

#### Scenario: 批量解析

- **WHEN** 调用 GET /api/v1/biz-data/emp_profile/resolve?ids=a,b
- **AND** a、b 均存在且显示文本分别为"张三""李四"
- **THEN** 返回 {"a":"张三","b":"李四"}

#### Scenario: 部分 id 不存在

- **WHEN** 调用 GET /api/v1/biz-data/emp_profile/resolve?ids=a,x
- **AND** x 不存在
- **THEN** 返回仅包含 a 的映射

#### Scenario: 跨租户不可解析

- **WHEN** 调用 GET /api/v1/biz-data/emp_profile/resolve?ids=other-tenant-id
- **AND** other-tenant-id 属于其他租户
- **THEN** 该 id 不出现在结果中
