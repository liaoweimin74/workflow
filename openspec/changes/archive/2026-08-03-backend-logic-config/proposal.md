# Proposal: backend-logic-config

## Why

工作流平台流程设计器当前仅支持节点审批属性（审批人、时限、操作权限等），无法在节点流转时执行后端业务逻辑。PRD 3.1.1 要求节点在进入或完成时自动执行外部 API 调用、本系统服务调用或 Groovy 脚本，用于对接业务系统、处理数据或自动化流程。此能力是工作流与业务系统打通的关键，也是流程引擎落地的核心诉求。现在引擎已具备流程定义部署与节点配置存储基础，适合本次实现配置 + 存储 + 运行时执行。

## What Changes

**后端业务逻辑配置（新增能力）**

- **新增节点后端逻辑配置**：在设计器属性面板新增「后端逻辑」配置区，支持节点（用户任务/开始事件/结束事件）上配置多个后端逻辑，按顺序执行。每个逻辑含触发时机（进入/完成）、异常策略、结果写回变量。
- **新增三种逻辑类型**：
  - **调用外部 API**：HTTP 请求，支持请求/查询参数引用流程变量、返回写回变量、每逻辑独立鉴权 headers（支持 `{{ var }}` 占位）、连接/读超时 + 重试次数。
  - **调用本系统服务**：通过 `BackendBeanRegistry` 白名单注册 Spring Bean + 方法，流程变量与方法参数映射。
  - **执行 Groovy 脚本**：脚本内可访问流程变量与 execution 上下文。
- **运行时自动执行**：注册全局 `FlowableEventListener`，监听节点 enter/complete 事件，按 `processDefinitionId → draftId → wf_node_config` 反查节点配置并逐条执行；单个逻辑异常按各自 `errorAction` 处理（忽略继续 / 中断流程）。
- **存储链路复用**: 配置存入现有 `wf_node_config` 表（`node_configs` 存储结构不变），前端 `nodeConfigs` 序列化直接复用。

## Capabilities

### New Capabilities

- `backend-logic-config`: 节点后端业务逻辑的配置（数据模型 + 设计器 UI）、存储（`wf_node_config`）与运行时执行（Flowable 事件监听 + 三种逻辑类型 + 异常处理）。
- `backend-bean-registry`: 本系统可调用 Spring Bean + 方法的白名单注册机制，供设计器下拉选择并支撑运行时反射调用。
- `backend-logic-http`: 外部 API 逻辑的运行时调用（HTTP 客户端、变量映射、鉴权头、超时重试、结果写回）。

> 注：`groovy-script-engine` 能力并入 `backend-logic-config`（脚本执行作为其中一种逻辑类型），不单列 spec；如需单独可拆分。

## Impact

- **后端**: 
  - 新增 `BackendLogic` 配置模型（解析 `wf_node_config` 中 `backendLogic` JSON）。
  - 新增全局 `FlowableEventListener`（引擎配置注册）。
  - 新增 `BackendBeanRegistry`（白名单）。
  - 新增 `http` 外部 API 调用执行器 + Groovy 脚本编排器。
  - 新增 `processDefinitionId → draftId` 映射查找（基于部署关系）。
- **前端**: 
  - `NodeConfigData` 增加 `backendLogic` 字段；新增 `BackendLogicProperty` 属性面板组件，接入现有 `PropertyPanel` 映射。
  - 新增本系统服务白名单查询 API 调用（下拉选择）。
- **API**: 新增暴露 `BackendBeanRegistry` 方法列表的接口（供设计器下拉）。
- **依赖**: 新增 `groovy`（脚本）、HTTP 客户端（Spring `RestClient`，无需新依赖）。
- **数据库**: 无新增表，复用 `wf_node_config`。