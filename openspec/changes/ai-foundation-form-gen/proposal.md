# Proposal: AI 基础设施层 + AI 表单生成

## Why

低代码工作流平台的核心生产力在于"用声明式配置代替编码"，但表单/流程设计仍依赖人工逐个拖拽配置。引入 AI 能力后，设计者只需用自然语言描述业务场景，即可自动生成可继续微调的表单定义，显著降低设计门槛与重复劳动。为支撑后续一系列 AI 能力（审批助手、流程生成、自然语言查询等），需要一个稳定、可复用的 AI 调用基础设施，避免每个功能各自对接模型供应商、重复处理流式与错误逻辑。当前正是引入时机：平台表单/流程/视图轨道已成熟，AI 能力的消费点齐备，而技术选型（自研轻量层）可在零依赖冲突的前提下落地。

## What Changes

**后端新增 AI 基础设施模块 `com.workflow.ai`**
- From: 无任何 AI 能力，无模型供应商对接
- To: 自研轻量 AI 客户端（OpenAI 兼容协议），支持非流式/流式（SSE）调用、JSON 结构化输出、多供应商配置、超时重试、调用审计；默认关闭（`workflow.ai.enabled=false`），配置后启用
- Reason: 统一 AI 调用入口，供后续能力复用；避免引入 Spring AI 2.0 GA 与 Spring Boot 4.0.7 的依赖对齐冲突
- Impact: 非破坏性；新增配置项，不影响现有功能

**后端新增 AI 表单生成能力 `com.workflow.ai.formgen`**
- From: 表单 schema 只能人工在设计器拖拽配置
- To: 自然语言描述 → prompt 工程生成 form-create rule JSON → 校验清洗 → SSE 流式/同步返回；设计器可一键回填继续编辑
- Reason: 首个 AI 场景，验证基础设施层价值
- Impact: 非破坏性；新增 `/api/v1/ai/forms/generate`(+`/sync`) 端点

**前端新增统一 AI 助手入口（悬浮球 + 对话）**
- From: 无任何 AI 入口（原设计器内嵌按钮方案废弃）
- To: 全站右下角悬浮球 + 对话抽屉（多轮历史、可清空）；顶部工具栏显隐开关（默认开启，持久化）；页面注册上下文；助手经工具调用完成任务并按上下文自动回填
- Reason: 用户要求统一入口，所有 AI 能力经对话完成，避免每个功能各挂入口
- Impact: 非破坏性；新增 `AiAssistantOrb`/store/动作总线；表单设计器移除内嵌入口改为注册上下文 + 监听回填动作

**后端新增对话与工具路由**
- From: 单轮表单生成端点 `/api/v1/ai/forms/generate`
- To: `POST /api/v1/ai/chat`（SSE 事件流）+ agent loop + 工具注册表；`generate_form_schema` 为首个工具；基础设施扩展到 function calling
- Reason: 统一入口需要意图路由与工具调用
- Impact: 移除独立表单生成端点；`ChatMessage`/`ChatOptions`/`ChatModel` 扩展工具能力

## Capabilities

### New Capabilities
- `ai-infrastructure`: AI 调用基础设施——模型供应商抽象（OpenAI 兼容）、非流式/流式/工具调用、JSON 结构化输出、配置与开关、异常体系、调用审计
- `ai-form-generation`: 表单 AI 生成能力——自然语言描述 → form-create schema 生成、校验清洗（作为助手工具 `generate_form_schema`，经助手触发并上下文自动回填）
- `ai-assistant`: 统一 AI 助手——全局悬浮球入口、对话抽屉（多轮历史 + 手动清空）、页面上下文注册、对话端点与事件流、工具路由执行、结果动作派发

### Modified Capabilities
- （无现有 capability 的需求变更）

## Impact

- **代码**：后端新增 `com.workflow.ai`、`com.workflow.ai.formgen`、`com.workflow.ai.tool`、`com.workflow.ai.agent`、`com.workflow.ai.chat`（Spring Modulith 新模块）；前端新增 `AiAssistantOrb.vue`、`stores/aiAssistantStore.ts`、`utils/aiActionBus.ts`、`api/ai.ts`，修改 `App.vue`/`AdminLayout.vue`/`FormDesigner.vue`
- **API**：新增 `POST /api/v1/ai/chat`（SSE）；移除 `POST /api/v1/ai/forms/generate`；复用现有 Security 认证
- **配置**：新增 `workflow.ai.*`（enabled/base-url/api-key/model/temperature/max-tokens/超时）
- **依赖**：零新增（复用 `spring-boot-starter-restclient`）
- **数据**：无新表，AI 调用仅日志；会话历史仅前端内存
