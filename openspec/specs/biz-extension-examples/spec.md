# biz-extension-examples Specification

## Purpose
TBD - created by archiving change bizdata-extension-examples. Update Purpose after archive.
## Requirements
### Requirement: emp_profile 覆盖查询示例

系统 SHALL 提供 formKey=emp_profile 的示例 handler（EmpProfileHandler），覆盖 query 操作：在通用分页结果基础上逐行计算在职天数，并按当前登录用户所属部门过滤记录；返回结构与通用分页一致（records + total，行内新增在职天数计算字段）。

该 handler 的 beforeCreate 钩子 SHALL 校验手机号格式（11 位、1 开头），不合法返回 400；beforeDelete 钩子 SHALL 拒绝删除在职员工（在职状态），返回 409。

#### Scenario: 覆盖查询返回在职天数

- **WHEN** 客户端调用 GET /api/v1/biz-data/emp_profile
- **AND** 当前用户属于某部门
- **THEN** 返回当前用户部门的员工分页记录
- **AND** 每行包含在职天数计算字段（基于入职日期）

#### Scenario: 新增非法手机号被拒

- **WHEN** 客户端调用 POST /api/v1/biz-data/emp_profile
- **AND** 手机号格式非法（如 10 位）
- **THEN** 系统返回 400 错误
- **AND** 记录不被插入

#### Scenario: 删除在职员工被拒

- **WHEN** 客户端调用 DELETE /api/v1/biz-data/emp_profile/{id}
- **AND** 员工处于在职状态
- **THEN** 系统返回 409 错误
- **AND** 记录不被删除

### Requirement: emp_profile 语义操作示例

系统 SHALL 提供 EmpProfileBizService 及对应 REST 端点，暴露两个语义操作：调薪（adjustSalary，更新薪资并返回新记录）与离职（resign，置为离职状态）。

#### Scenario: 调薪成功

- **WHEN** 客户端调用 POST /api/v1/example/emp/adjust-salary
- **AND** 携带员工 id 与新的薪资数值
- **THEN** 员工薪资被更新
- **AND** 返回更新后的员工记录

#### Scenario: 离职成功

- **WHEN** 客户端调用 POST /api/v1/example/emp/resign
- **AND** 携带员工 id 与离职原因
- **THEN** 员工状态变更为离职
- **AND** 返回更新后的员工记录

### Requirement: leave_bill 工作流表单示例

系统 SHALL 提供 formKey=leave_bill 的示例 handler（LeaveBillHandler）：beforeCreate 钩子 SHALL 校验请假天数大于 5 时必须填写理由（否则 400）；afterCreate 钩子 SHALL 将 status 业务列初始化为"草稿"。

系统 SHALL 提供 LeaveBillBizService 及对应 REST 端点：submit（发起流程：以业务行 id 为 businessKey 调用 startProcess，并将 status 置为"待审批"）、approve（通过指定任务审批并将 status 置为"已批准"）、reject（驳回任务并将 status 置为"已驳回"）。

#### Scenario: 超长请假必须填理由

- **WHEN** 客户端调用 POST /api/v1/biz-data/leave_bill
- **AND** 请假天数大于 5
- **AND** 未填写理由
- **THEN** 系统返回 400 错误
- **AND** 记录不被插入

#### Scenario: 创建后初始为草稿

- **WHEN** 客户端创建 leave_bill 记录
- **THEN** 记录的 status 字段为"草稿"

#### Scenario: 提交发起流程

- **WHEN** 客户端调用 POST /api/v1/example/leave/submit
- **AND** 携带请假单 id
- **THEN** 系统以该 id 为 businessKey 发起 leave-bill 流程
- **AND** 记录 status 变更为"待审批"

#### Scenario: 审批通过流程结束

- **WHEN** 客户端调用 POST /api/v1/example/leave/approve
- **AND** 携带待办任务 id
- **THEN** 系统完成任务并使流程结束
- **AND** 记录 status 变更为"已批准"

#### Scenario: 驳回流程结束

- **WHEN** 客户端调用 POST /api/v1/example/leave/reject
- **AND** 携带任务 id 与驳回意见
- **THEN** 系统驳回任务并使流程结束
- **AND** 记录 status 变更为"已驳回"

### Requirement: leave_bill 守卫联动示例

leave_bill 示例 SHALL 演示守卫联动：提交发起流程后，对业务行的更新与删除被统一拦截（运行中禁改禁删）；流程结束后允许更新、禁止删除。

#### Scenario: 流程运行中禁改禁删

- **WHEN** leave_bill 记录已提交且流程运行中
- **AND** 客户端调用 PUT 或 DELETE /api/v1/biz-data/leave_bill/{id}
- **THEN** 系统返回 409 错误
- **AND** 记录保持原状

#### Scenario: 流程结束后可改不可删

- **WHEN** leave_bill 记录关联的流程已结束（已批准或已驳回）
- **AND** 客户端调用 PUT /api/v1/biz-data/leave_bill/{id}
- **THEN** 更新成功并返回更新后的记录
- **AND** 客户端调用 DELETE /api/v1/biz-data/leave_bill/{id} 时返回 409 错误

