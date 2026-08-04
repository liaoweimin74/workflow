# process-variable-management Specification

## Purpose
TBD - created by archiving change process-engine-core. Update Purpose after archive.
## Requirements
### Requirement: 查询流程变量

系统 SHALL 提供 `GET /api/v1/process-instances/{id}/variables` 接口，返回流程实例的所有变量。

#### Scenario: 查询全部变量

WHEN 调用 GET /process-instances/{id}/variables
THEN 返回该实例所有运行时变量的 key-value 映射
AND 变量值 SHALL 保持原始类型（字符串/数字/布尔/列表）

#### Scenario: 查询单个变量

WHEN 调用 GET /process-instances/{id}/variables/{name}
THEN 返回该变量的值
AND 变量不存在时 SHALL 返回 404

### Requirement: 设置流程变量

系统 SHALL 提供 `POST /api/v1/process-instances/{id}/variables` 接口，设置或更新流程变量。

#### Scenario: 新增变量

WHEN 调用 POST /process-instances/{id}/variables，body 含 `{"key": "value"}`
THEN 流程实例 SHALL 新增该变量
AND 后续查询 SHALL 返回该变量

#### Scenario: 更新已有变量

WHEN 流程已有变量 amount=1000
AND 调用 POST /process-instances/{id}/variables，body 含 `{"amount": 2000}`
THEN 变量 amount SHALL 更新为 2000
AND 其他变量 SHALL NOT 变化

### Requirement: 删除流程变量

系统 SHALL 提供 `DELETE /api/v1/process-instances/{id}/variables/{name}` 接口，删除流程变量。

#### Scenario: 删除变量

WHEN 流程有变量 tempData
AND 调用 DELETE /process-instances/{id}/variables/tempData
THEN 变量 tempData SHALL 从流程实例中移除
AND 后续查询 SHALL NOT 返回该变量

#### Scenario: 删除不存在的变量

WHEN 调用 DELETE /process-instances/{id}/variables/nonexistent
THEN SHALL 返回 404

