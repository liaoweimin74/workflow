# backend-logic-config Specification

## Purpose
TBD - created by archiving change backend-logic-config. Update Purpose after archive.
## Requirements
### Requirement: 节点后端逻辑配置

流程设计器 SHALL 支持在 BPMN 节点上配置后端业务逻辑，配置存储在 `wf_node_config.config_json` 的 `backendLogic` 字段中。支持配置的节点类型包括用户任务、开始事件、结束事件。每个节点 SHALL 支持配置多个后端逻辑，并按配置顺序依次执行。

后端逻辑触发器 SHALL 支持两种时机：
- **ENTER**：节点进入时执行（开始事件进入、用户任务创建）
- **COMPLETE**：节点完成时执行（用户任务完成、结束事件完成）

每个逻辑条目 SHALL 包含：逻辑名称、启用开关、触发时机、逻辑类型、异常处理策略、可选结果写回变量名。

#### Scenario: 配置节点后端逻辑

- **WHEN** 用户在设计器选中一个人用任务节点并配置了一条「同步订单状态」后端逻辑，触发时机为进入，类型为调用外部 API
- **THEN** 该逻辑存储在 `wf_node_config.config_json` 的 `backendLogic` 数组中
- **AND** 保存流程定义后重新加载设计器，该逻辑配置仍然存在

#### Scenario: 配置多个逻辑

- **WHEN** 用户在一个节点上添加了三条后端逻辑
- **THEN** 系统按照配置顺序存储它们
- **AND** 运行时按顺序执行

#### Scenario: 禁用逻辑

- **WHEN** 用户将一条后端逻辑的启用开关关闭并保存
- **THEN** 该逻辑仍保存在配置中但运行时被跳过

### Requirement: 异常处理策略

每条后端逻辑 SHALL 支持独立配置异常处理策略，包含：
- `IGNORE_CONTINUE`：执行失败记录日志，继续执行后续逻辑及流程
- `FAIL_FLOW`：执行失败抛出异常，中断当前流程流转

#### Scenario: 忽略继续

- **WHEN** 一条后端逻辑执行失败且异常策略为 `IGNORE_CONTINUE`
- **THEN** 系统记录错误日志
- **AND** 继续执行该节点剩余的逻辑及后续流程

#### Scenario: 中断流程

- **WHEN** 一条后端逻辑执行失败且异常策略为 `FAIL_FLOW`
- **THEN** 系统抛出异常并中断当前流程实例流转

### Requirement: 结果写回流程变量

后端逻辑 SHALL 支持将执行结果写入流程变量。设计器 SHALL 提供 `resultVar` 字段配置返回数据写入的流程变量名。该字段为可选，未配置时运行时不写入结果。

#### Scenario: 写回流程变量

- **WHEN** 用户在逻辑配置的 `resultVar` 中填写 `dealerCode`
- **AND** 该逻辑在运行时执行成功并返回值
- **THEN** 系统将该返回值写入流程变量 `dealerCode`

#### Scenario: 未配置写回

- **WHEN** 用户未填写 `resultVar` 字段
- **AND** 逻辑执行成功
- **THEN** 系统不写入任何流程变量

### Requirement: 运行时自动执行

系统 SHALL 在流程运行时自动执行节点上配置的后端逻辑，无需人工干预。系统 SHALL 通过全局 Flowable 事件监听器响应节点进入/完成/开始瞬发事件，按 `processDefinitionId` 反查对应的流程草稿 ID 及其节点配置，找到当前节点的 `backendLogic` 并按触发时机过滤执行。

#### Scenario: 用户任务进入执行

- **WHEN** Flowable 触发了用户任务的进入事件
- **THEN** 系统执行该用户任务节点上 `trigger=ENTER` 的后端逻辑

#### Scenario: 用户任务完成执行

- **WHEN** Flowable 触发了用户任务的完成事件
- **THEN** 系统执行该用户任务节点上 `trigger=COMPLETE` 的后端逻辑

#### Scenario: 开始事件进入执行

- **WHEN** 流程实例启动（开始事件）
- **THEN** 系统执行开始事件节点上 `trigger=ENTER` 的后端逻辑

#### Scenario: 结束事件完成执行

- **WHEN** 流程实例到达结束事件
- **THEN** 系统执行结束事件节点上 `trigger=COMPLETE` 的后端逻辑

#### Scenario: 无配置时跳过

- **WHEN** 触发节点运行时，该节点未配置任何后端逻辑，或 `backendLogic` 为空数组
- **THEN** 系统不做任何处理继续流程流转

### Requirement: 执行 Groovy 脚本

系统 SHALL 支持「执行脚本」类型后端逻辑，运行时执行 Groovy 脚本片段。脚本逻辑配置 SHALL 包含语言标识（`groovy`）与脚本源码。系统 SHALL 使用 Groovy 脚本引擎在流程 execution 上下文中执行脚本，脚本内 SHALL 可访问流程 execution 与当前流程变量。脚本执行结果按需写回配置的 `resultVar` 流程变量。

#### Scenario: 执行 Groovy 脚本

- **WHEN** 一条脚本类型逻辑配置了 Groovy 源码，例如计算并设置流程变量
- **AND** 该逻辑在运行时触发
- **THEN** 系统编译并执行该 Groovy 脚本
- **AND** 脚本内对流程变量的修改生效

#### Scenario: 脚本写回结果

- **WHEN** 脚本逻辑配置了 `resultVar`，脚本返回结果
- **THEN** 系统将脚本返回值写入对应流程变量

#### Scenario: 脚本执行异常

- **WHEN** Groovy 脚本执行抛出异常
- **THEN** 系统按该逻辑配置的异常处理策略处理（忽略继续或中断流程）

