# Backend Logic Config — Technical Design

## Context

工作流平台基于 Spring Boot 3 + Flowable 8.0.0 + Vue 3 + Element Plus。流程设计器把节点自定义属性存入 `wf_node_config` 表（`config_json` JSON，按 `process_def_id + node_id` 关联），前端通过 `nodeConfigs: Record<nodeId, jsonString>` 整包上传（`saveDesign`）。当前 `wf_node_config` 与 BPMN XML 解耦，部署时 BPMN XML 原样部署到 Flowable，**运行时引擎读不到节点配置**。

PRD 3.1.1「后端业务逻辑配置」要求：流程节点支持配置后端业务逻辑，在节点进入或完成时自动执行，三种方式（调用外部 API / 调用本系统服务 / 执行 Groovy 脚本），一个节点可配多个按顺序执行。

## Goals / Non-Goals

**Goals:**
- 设计器为用户任务/开始/结束节点提供「后端逻辑」配置 UI。
- 配置存入现有 `wf_node_config`（复用 `nodeConfigs` 存储，零表结构变更）。
- 运行时监听 Flowable 事件（enter/complete），按配置逐条执行。
- 支持三种逻辑类型：HTTP 外部调用、白名单 Bean 方法、Groovy 脚本。
- 每个逻辑独立异常策略（忽略继续 / 中断流程）、触发时机（进入 / 完成）、结果写回流程变量。

**Non-Goals:**
- 不支持表单设计器的事件脚本（那是前端 3.2.4 范畴）。
- 不实现节点级的审批人去重、驳回、加签等策略（前期迭代范畴）。
- 不做脚本沙箱的内核级加固（使用 Groovy 编译期 allowlist，非完整 sandbox）。
- 不做外部 API 的全局凭证管理（每逻辑独立 headers）。

## Decisions

### D1. 运行时取配置：全局 `FlowableEventListener` + 反查

部署时注册一个全局事件监听器（不进 BPMN XML），监听以下事件映射到触发时机：

| 节点类型 | 触发 | Flowable 事件 |
|---|---|---|
| 开始事件 | ENTER | `PROCESS_STARTED` |
| 用户任务 | ENTER | `ACTIVITY_STARTED`（活动类型 userTask） |
| 用户任务 | COMPLETE | `TASK_COMPLETED` |
| 结束事件 | COMPLETE | `ACTIVITY_COMPLETED`（活动类型 endEvent） |

**反查链路**：事件里拿到 `processInstanceId` → `RuntimeService` 得到 `processDefinitionId` → 查 `wf_process_draft`（`process_definition_id = processDefinitionId`）得到 `draftId` → 查 `wf_node_config.findByProcessDefId(draftId)`，取当前节点 `nodeId` 的 `config_json` 解析 `backendLogic[]`。

**缓存**：`processDefinitionId → draftId（+ 该流程所有节点配置）` 做进程内 TTL 缓存（如 5 分钟），降低反查开销；部署/版本更新时失效（基于 deploymentId 变更）。

**选型理由**：零 BPMN XML / 表变更；配置单源 `wf_node_config`；前端链路全复用。（备选：将配置注入 BPMN XML flowable extension 元素 → 双写易不一致，未采用。）

### D2. 数据模型：`NodeConfigData.backendLogic`

前端 `designerStore.ts` 的 `NodeConfigData` 新增 `backendLogic?: BackendLogicItem[]`：

```typescript
interface BackendLogicItem {
  id: string
  name: string
  enabled: boolean
  trigger: 'ENTER' | 'COMPLETE'
  type: 'http' | 'bean' | 'script'
  errorAction: 'IGNORE_CONTINUE' | 'FAIL_FLOW'
  resultVar?: string                     // 结果写回流程变量名（可选）
  http?: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    headers?: Record<string, string>     // 值支持 {{varName}} 占位符
    queryParams?: ParamMapping[]         // 流程变量 → query 参数
    bodyParams?: ParamMapping[]          // 流程变量 → JSON body 字段
    connTimeoutMs?: number               // 默认 3000
    readTimeoutMs?: number               // 默认 5000
    retryCount?: number                  // 默认 0
  }
  bean?: {
    beanName: string                     // 白名单注册
    methodName: string
    params?: ParamMapping[]              // 流程变量 → 按序方法参数
  }
  script?: {
    language: 'groovy'
    source: string
  }
}
```

变量引用占位符语法 `{{ varName }}`；`ParamMapping { source, target }` 表示流程变量 source → 目标(target/query参数/body字段/方法参数)。

### D3. `BackendBeanRegistry` 白名单注册

- 注解 `@BackendLogicBean`（类级）+ 白名单扫描，或集中式 `BackendBeanRegistry.register(beanName, methodSignature, 元信息)`。
- 注册信息：`beanName`、`methodName`、参数名/顺序、返回值类型。
- 提供后端接口 `GET /api/v1/backend-logic/beans` 返回值白名单方法清单，供前端设计器下拉选择。
- 运行时反射调用，所有方法在注册时已验证签名，避免任意反射。

### D4. HTTP 外部 API 执行

- 使用 Spring `RestClient`（Spring Boot 3 内置，无需新增依赖）。
- 变量替换（占位符/映射）后构造请求；headers 支持 `{{ var }}`。
- 超时（连接/读）、重试（固定等待间隔）。
- 成功 → 若配置 `resultVar`，写回 `runtimeService.setVariable`；失败 → 按 `errorAction`：`IGNORE_CONTINUE` 记录日志继续 / `FAIL_FLOW` 抛异常中断流程。

### D5. Groovy 脚本执行

- 依赖：`org.apache.groovy:groovy`（Spring Boot 管理版本）。
- 用 `GroovyScriptEngine` 单独编译执行，绑定 `execution`（`DelegateExecution`）与流程变量作为脚本变量上下文。
- 脚本可读写变量（通过 execution）。结果按 `resultVar` 写回。
- 脚本异常同四按 `errorAction` 处理。

### D6. 触发分发

`FlowableEventListener.notify(FlowableEvent)` 中按事件类型分派到「进入/完成」处理器，处理器读取节点 `backendLogic`，过滤 `trigger` 匹配的条目，按序执行；单条失败按 `errorAction` 决定继续或中断整链。

## Risks / Trade-offs

- **反查开销** → 进程内 TTL 缓存缓解（DTTL 5 分钟），部署时主动失效。
- **TTL 缓存与引擎版本不同步** → 监听 `ENTITY_DELETED`/`PROCESS_DEFINITION` 变化失效；或 deprecated。
- **Groovy 脚本安全性** → 使用编译期 allow-list（仅含白名单 import + 受限变量），不做完整沙箱；文档标注风险与告使用方式。
- **HTTP 外部依赖不稳定** → 超时 + 重试；`IGNORE_CONTINUE` 兜底。
- **多租户** → 反查携带 `tenantId` 过滤（`findByIdAndTenantId` 样式）；事件内从引擎上下文取租户。
- **`wf_node_config` 与 Flowable 部署版本错位** → 配置更新后需重新部署流程（`MODIFIED` 状态已有此流程）；按 `deployId` 校验。

## Open Questions

- 进程内缓存失效的精确边界（重部署流程 / 版本回滚）——倾向部署时主动失效 + TTL 兜底。
- 复杂 JSON body 的模板语法：`bodyParams` 仅支持扁平字段映射，嵌套 JSON 是否本期支持（倾向否）。
- Groovy 脚本的允许 import 白名单初始集合。
- 是否需要「测试运行」面板在本期提供逻辑手工试跑。