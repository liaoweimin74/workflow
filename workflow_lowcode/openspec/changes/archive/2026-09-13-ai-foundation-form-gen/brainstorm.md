# Brainstorm: AI 基础设施层 + AI 表单生成

## Design Summary

为工作流平台引入 AI 能力，第一批交付两件事：

1. **AI 基础设施层**（`com.workflow.ai` 后端模块）：基于已有 `RestClient` 自研轻量 AI 客户端，封装 OpenAI 兼容协议（DeepSeek/通义/Qwen/Ollama 全兼容），支持非流式与流式（SSE 逐块解析）调用、JSON 结构化输出（`response_format: json_object`）、多供应商抽象、超时/重试/错误处理、调用审计。零新依赖，无 Spring Boot 4.0.7 版本冲突。

2. **AI 表单生成**（首个消费 AI 能力的业务场景）：表单设计器工具栏新增"AI 生成"入口，用户在弹窗输入自然语言描述（如"员工请假单：姓名、部门、请假类型、起止日期、请假原因"），后端经 prompt 工程生成 form-create rule JSON schema，SSE 流式回传前端实时预览，确认后回填设计器画布继续拖拽微调。

**入口策略**（已与用户确认）：AI 能力以"嵌入式"为主——表单生成进 FormDesigner 工具栏，不做独立大菜单；全局悬浮球助手/运营分析等为远期规划，不在本变更范围。

## Alternatives Considered

### 方案 A：自研轻量 AI 客户端层（Agreed）
- **做法**：新建 `com.workflow.ai` 模块，`ChatModel` 接口 + `OpenAiCompatibleChatModel`（RestClient 实现），配置驱动（base-url/api-key/model），自实现流式 SSE 解析与 JSON 结构化输出。
- **优点**：零新依赖、无 Enforcer 版本冲突；完全可控；契合项目自包含风格（SSE 基建自研先例）；接口语义对齐 Spring AI `ChatClient`，将来迁移平滑。
- **缺点**：函数调用/向量库/RAG 等重型能力后续需自行补充。

### 方案 B：Spring AI 2.0.x（官方框架）
- **做法**：引入 `spring-ai-starter-*`，依赖官方 `ChatClient` 抽象。
- **优点**：Spring 官方生态，与 Boot 4/Modulith/Actuator 天然整合；RAG/向量库/MCP 后续开箱即用。
- **缺点**：Spring AI 2.0.0 GA（2026-06）请求依赖对齐 Boot 4.1.0 / Micrometer 1.17.0，与项目 parent `4.0.7 / 1.16.6` 存在 Maven Enforcer 上限冲突；解决需升级 Boot 4.1.x（牵动 Flowable 8 / Modulith 2.0 全链路回归）或强制覆盖依赖（hacky，后续升级易踩坑）。
- **为何未采用**：当前仅一个"表单生成"场景，用不上重型生态；版本对齐冲突是现实障碍。

### 方案 C：AgentScope Java 2.0
- **做法**：引入 `agentscope-java` 2.0 GA + `agentscope-spring-boot-starter-*`。
- **优点**：生产就绪（2026-07 GA）；多智能体编排、事件流、沙箱、分布式、自带 Control Plane/Dashboard；OpenAI 兼容端点（DeepSeek/Qwen/Ollama）均有扩展模块。
- **缺点**：定位是"长期运行 agent + 多 agent 编排 + 沙箱执行"，本项目当前需求（单次模型调用 → JSON schema）完全用不上其核心价值；依赖树庞大；自带运维体系与 Spring Modulith 架构融合成本高。
- **为何未采用**：需求匹配度低，属过度工程；仅当未来做"审批机器人/自动建表 agent"等长期运行场景时再评估。

## Agreed Approach

采用**方案 A：自研轻量 AI 客户端层**。理由：

1. 当前 AI 场景（表单生成，后续审批助手/流程生成/问数）全部是"模型对话 + 结构化 JSON 输出"级别，重型框架的核心能力用不上；
2. Spring Boot 4.0.7 下 Spring AI 2.0 GA 存在真实 Enforcer 冲突，升级 Boot 风险大于收益；
3. 自研层把"流式解析 + JSON 结构化 + 供应商抽象 + 超时重试 + 调用审计"做扎实即构成合格基础设施，接口语义与 Spring AI `ChatClient` 对齐，未来升级不锁死。

## Key Decisions

| # | 决策 | 结论 |
|---|---|---|
| 1 | AI 框架选型 | 自研轻量层（方案 A），不用 Spring AI / AgentScope |
| 2 | AI 功能入口 | 嵌入式优先：表单生成进 FormDesigner 工具栏；不做独立菜单 |
| 3 | 供应商协议 | OpenAI 兼容 `/chat/completions`（DeepSeek/通义/Qwen/Ollama 通用） |
| 4 | 流式方案 | 请求-响应式 SSE（一个请求一个 SseEmitter），与通知中心 `SseEmitterManager`（userId 长连接推送）区分 |
| 5 | 结构化输出 | `response_format: json_object` + 后端 `FormSchemaValidator` 兜底校验清洗 |
| 6 | 配置开关 | `workflow.ai.enabled=false` 默认关闭；配置 base-url/api-key/model 后启用，无 key 时功能优雅降级 |
| 7 | API key 安全 | key 仅存后端配置，前端只走后端代理接口 |
| 8 | 前端回填链路 | 复用 `designerRef.setRule(ensureRuleProps(enableCardDesignMode(rule)))` 现有链路 |

## Open Questions

- ~~技术路线~~：已定方案 A（本变更明确）。
- 模型供应商默认值：DeepSeek 作为默认示例配置（国内访问稳定、OpenAI 兼容），实际以部署环境为准；不影响代码结构。
- 是否在基础设施层同时提供非流式同步端点：是（`/sync` 端点，供测试与简单消费方），成本极低。
- 提示注入防护：AI 接口仅限登录用户调用，system prompt 固定、用户输入仅作 user message——本变更不做额外纵深防护（如输出内容过滤），记入 verify 检查项。

## 修订记录

### v1 → v2（入口形态调整，用户确认）

用户要求：**不要每个功能各挂一个 AI 入口**，改为**统一悬浮球 + 对话**，所有 AI 能力经对话完成。据此：

| # | 决策 | v2 结论 |
|---|---|---|
| R1 | 入口形态 | **全局右下角悬浮球 + 对话抽屉**（取代原"嵌入式按钮"）；`App.vue` 挂载，登录页隐藏 |
| R2 | 显隐开关 | 主界面顶部工具栏提供开关，**默认开启**，偏好持久化 `localStorage` |
| R3 | 对话历史 | **保留多轮历史**（前端会话内维护，不落库），**可手动清空** |
| R4 | 后端编排 | 新增对话端点 + **工具路由（function calling）**；表单生成为首个工具 `generate_form_schema` |
| R5 | 结果落地 | **上下文绑定自动回填**：助手在表单设计器页生成表单 → 自动回填画布；非设计器页不派发 |
| R6 | 旧入口 | 表单设计器内嵌「AI 生成」按钮/弹窗**移除**；独立 `/ai/forms/generate` 端点**移除** |
