## ADDED Requirements

### Requirement: 流程启动自动注入 initiator 变量

系统 SHALL 在流程启动时自动将当前登录用户 ID 注入为流程变量 `initiator`。

#### Scenario: 正常启动流程注入 initiator

- **WHEN** 已认证用户（userId=42）调用 `POST /api/v1/process-instances` 启动流程
- **THEN** 流程变量中 SHALL 包含 `initiator` = `"42"`（字符串类型）
- **AND** 后续 UserTask 的 `${initiator}` 表达式 SHALL 解析为 `"42"`

#### Scenario: 前端传入 initiator 变量时后端覆盖

- **WHEN** 已认证用户（userId=42）调用启动流程接口，且 variables 中已包含 `initiator` = `"fakeUser"`
- **THEN** 后端 SHALL 用当前登录用户 ID 覆盖该值
- **AND** 流程变量中 `initiator` SHALL 为 `"42"`

#### Scenario: 未认证用户启动流程

- **WHEN** 未认证用户调用启动流程接口
- **THEN** 系统 SHALL 返回 401 未授权错误
- **AND** 流程 SHALL NOT 启动

### Requirement: initiator 变量用于发起人节点 assignee

当 UserTask 的 `flowable:assignee` 为 `${initiator}` 时，系统 SHALL 将该任务分配给 `initiator` 变量对应的用户。

#### Scenario: 发起人节点任务分配

- **WHEN** 流程启动时 `initiator` = `"42"`
- **AND** 流程执行到 `assignee="${initiator}"` 的 UserTask
- **THEN** 创建的任务 `assignee` SHALL 为 `"42"`
- **AND** 用户 42 SHALL 在待办列表中看到该任务
