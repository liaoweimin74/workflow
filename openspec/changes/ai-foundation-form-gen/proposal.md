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

**前端表单设计器新增 AI 生成入口**
- From: FormDesigner 工具栏仅手动拖拽配置
- To: 工具栏"AI 生成"按钮 + `AiFormGenDialog` 弹窗（描述输入、流式预览、字段清单、回填画布）
- Reason: 嵌入式入口（已确认），贴合设计场景
- Impact: 非破坏性；新增组件与 api 封装，复用现有 `setRule` 回填链路

## Capabilities

### New Capabilities
- `ai-infrastructure`: AI 调用基础设施——模型供应商抽象（OpenAI 兼容）、非流式/流式调用、JSON 结构化输出、配置与开关、异常体系、调用审计
- `ai-form-generation`: 表单设计器 AI 生成——自然语言描述 → form-create schema 生成、校验清洗、流式回传、画布回填

### Modified Capabilities
- （无现有 capability 的需求变更）

## Impact

- **代码**：后端新增 `com.workflow.ai`、`com.workflow.ai.formgen` 包（Spring Modulith 新模块）；前端新增 `AiFormGenDialog.vue`、`api/ai.ts`，修改 `FormDesigner.vue`
- **API**：新增 `POST /api/v1/ai/forms/generate`（SSE）、`POST /api/v1/ai/forms/generate/sync`；复用现有 Security 认证
- **配置**：新增 `workflow.ai.*`（enabled/base-url/api-key/model/temperature/max-tokens/超时）
- **依赖**：零新增（复用 `spring-boot-starter-restclient`）
- **数据**：无新表，AI 调用仅日志
