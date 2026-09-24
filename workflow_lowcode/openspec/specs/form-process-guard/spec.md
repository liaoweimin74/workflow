# form-process-guard Specification

## Purpose
TBD - created by archiving change bizdata-extension-examples. Update Purpose after archive.
## Requirements
### Requirement: 守卫接口契约

系统 SHALL 提供 FormProcessGuard 接口，定义于业务表单数据包（不依赖流程引擎实现类），包含三个方法：appliesTo(formKey) 判定是否适用、checkBeforeUpdate(formKey, id) 更新前检查、checkBeforeDelete(formKey, id) 删除前检查。

守卫检查不通过时，系统 SHALL 抛出业务异常并返回 409 冲突，不执行数据变更。

#### Scenario: 接口层与流程引擎解耦

- **WHEN** 业务表单数据包编译 FormProcessGuard 接口
- **THEN** 该接口不引用任何流程引擎类型（如 RuntimeService 等）

#### Scenario: 检查不通过返回冲突

- **WHEN** 守卫检查判定记录禁止变更
- **THEN** 系统返回 409 错误
- **AND** 记录保持原状

### Requirement: 流程绑定配置

FormDefinition SHALL 支持可选的流程绑定字段 processKey，并通过表单定义持久化（数据库层以新增列承载）。

系统 SHALL 提供 FlowableFormProcessGuard 实现：当 formKey 对应表单定义绑定了 processKey（非空）时，appliesTo 返回 true；未绑定返回 false。

#### Scenario: 绑定流程的表单受守卫约束

- **WHEN** 表单定义绑定了 processKey（如 leave_bill 绑定 leave-bill 流程）
- **THEN** 该 formKey 的守卫 appliesTo 返回 true
- **AND** 记录受守卫约束

#### Scenario: 未绑定流程的表单不受约束

- **WHEN** 表单定义未绑定 processKey
- **THEN** 该 formKey 的守卫 appliesTo 返回 false
- **AND** update/delete 不触发守卫检查

### Requirement: 运行中记录禁改禁删

当记录关联的流程实例处于运行中状态时，系统 SHALL 拒绝该记录的更新与删除操作（返回 409）。

流程实例关联 SHALL 以业务行 id 为 businessKey 反查确定（startProcess 时传入），不依赖业务表新增系统列。

#### Scenario: 更新运行中的记录

- **WHEN** 客户端调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 该记录关联的流程实例运行中（非结束状态）
- **THEN** 系统返回 409 错误
- **AND** 记录不被更新

#### Scenario: 删除运行中的记录

- **WHEN** 客户端调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** 该记录关联的流程实例运行中
- **THEN** 系统返回 409 错误
- **AND** 记录不被删除

### Requirement: 已结束记录可改不可删

当记录关联的流程实例已结束（包括正常完成与被驳回）时，系统 SHALL 允许更新该记录、拒绝删除该记录（返回 409）。

当记录不存在任何流程实例（草稿状态）时，系统 SHALL 允许更新与删除。

#### Scenario: 更新已结束流程的记录

- **WHEN** 客户端调用 PUT /api/v1/biz-data/{formKey}/{id}
- **AND** 该记录关联的流程实例已结束
- **THEN** 系统正常更新记录
- **AND** 返回更新后的记录

#### Scenario: 删除已结束流程的记录

- **WHEN** 客户端调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** 该记录关联的流程实例已结束
- **THEN** 系统返回 409 错误
- **AND** 记录不被删除

#### Scenario: 删除草稿记录

- **WHEN** 客户端调用 DELETE /api/v1/biz-data/{formKey}/{id}
- **AND** 该记录不存在任何流程实例
- **THEN** 系统正常删除记录

