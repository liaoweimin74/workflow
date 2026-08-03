# Backend Logic Config — Design Summary

## Design Summary

基于 PRD 3.1.1「后端业务逻辑配置」，流程节点（用户任务/开始事件/结束事件）应支持配置后端业务逻辑，在节点进入或完成时自动执行。支持三种方式：调用外部 API、调用本系统服务、执行 Groovy 脚本。本期一步到位实现「配置 + 存储 + 运行时执行」。

## Alternatives Considered

### 方案 A：仅配置 + 存储（不做运行时执行）
- **做法**：只在设计器属性面板新增「后端逻辑」配置，存入 `wf_node_config`，运行时执行留到后续迭代。
- **优点**：风险低，与既有 `process-properties` 迭代节奏一致。
- **缺点**：PRD 3.1.1 明确要求「在节点进入或完成时自动执行」，仅配置无法满足核心需求。
- **为何未採用**：用户明确选择本期一步到位实现配置 + 存储 + 运行时执行。

### 方案 B：部署时将配置注入 BPMN XML extension 元素
- **做法**：部署前把 backendLogic 注入 BPMN XML 的 flowable 扩展元素，用 Flowable 原生的 `flowable:executionListener` / `flowable:taskListener` 承载运行时执行。
- **优点**：完全使用 Flowable 原生机制，执行期拿配置直接。
- **缺点**：nodeConfigs 双写（env 表 + BPMN XML）易不一致；BPMN XML 膨胀；配置改动需重新解析/注入 XML；非侵入性差，逻辑与模型耦合。
- **为何未採用**：`wf_node_config` 已是节点配置唯一事实源，与其双写不如运行时反查。

### 方案 C（Agreed）：全局事件监听器 + 运行时反查
- **做法**：部署时注册一个全局 `FlowableEventListener`（监听 `ACTIVITY_STARTED` / `ACTIVITY_COMPLETED` / `TASK_COMPLETED` 等事件）。执行时根据 `processDefinitionId → draftId → wf_node_config` 反查当前节点配置，按配置逐条执行后端逻辑。
- **优点**：零 BPMN XML / 表结构变更；配置单源（`wf_node_config`）；非侵入；前端存储链路（`nodeConfigs`）完全复用；天然支持多节点、多逻辑按序执行。
- **缺点**：运行时需一次推广流程定义到草稿的映射查找（可用缓存优化）。
- **为何勝出**：唯一同时满足「配置 + 存储 + 运行时执行」且不引入 XML/表双写不一致的方案，符合现有架构（`wf_node_config` 与 BPMN XML 解耦）。

## Agreed Approach

采用**方案 C**：部署时注册全局 `FlowableEventListener`，运行时事件触发后按 `processDefinitionId → draftId → wf_node_config` 反查节点配置，解析 `backendLogic[]` 逐条执行。逻辑类型三种：

1. **调用外部 API**：HTTP 请求，支持请求参数引用流程变量、返回值写入流程变量、独立异常策略（忽略继续 / 中断流程）、超时 + 重试。
2. **调用本系统服务**：通过 `BackendBeanRegistry` 白名单注册可调 Spring Bean + 方法，支持流程变量与方法参数映射、返回值写入变量。
3. **执行脚本**：Groovy 脚本片段，脚本内可访问流程 execution 与变量。

触发时机支持 `ENTER`（节点进入）与 `COMPLETE`（节点完成）：外部监听用户任务进入用 `ACTIVITY_STARTED`、完成用 `TASK_COMPLETED`；开始节点进入用 `PROCESS_STARTED`；结束节点完成用 `ACTIVITY_COMPLETED`。

## Key Decisions

1. **交付边界**：本期实现配置 + 存储 + 运行时执行（用户确认）。
2. **运行时取配置**：全局 `FlowableEventListener` + 按 `processDefinitionId → draftId → wf_node_config` 反查（方案 C）。
3. **本系统服务暴露**：`BackendBeanRegistry` 白名单注册，设计器下拉选择，避免任意反射风险。
4. **脚本语言**：Groovy（Flowable 原生、Spring 生态标准）。
5. **外部 API 鉴权/请求头**：每逻辑独立 `headers`，值支持 `{{ varName }}` 占位符引用流程变量。
6. **异常处理粒度**：每个逻辑单元独立配置 `errorAction`（`IGNORE_CONTINUE` / `FAIL_FLOW`）。
7. **外部 API 可靠性**：每逻辑配置超时（连接/读）+ 重试次数。

## Open Questions

- 反查映射（`processDefinitionId → draftId`）的缓存失效策略：进程内 TTL 缓存 vs 每次查库。倾向 TTL 缓存（如 5 分钟），部署/版本变化时失效。
- Groovy 脚本沙箱安全限制：是否限制可访问的变量与类白名单（以 `GroovyScriptEngine` + 自定义 import 白名单）。
- 是否需要在属性面板提供「本系统服务」可用方法列表的实时下拉（通过后端接口暴露白名单），或仅静态输入 Bean+方法名后由后端校验。建议前置下拉选择更友好。