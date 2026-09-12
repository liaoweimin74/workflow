# Tasks: AI 基础设施层 + AI 表单生成

> 实现阶段使用 TDD（RED → GREEN → REFACTOR）：每项实现任务先写失败测试，再实现至通过。参考 `docs/testing.md` 与既有测试风格。

## 1. 后端 AI 基础设施层（com.workflow.ai）

- [x] 1.1 `AiProperties`：`@ConfigurationProperties("workflow.ai")`，字段 enabled/base-url/api-key/model/temperature/max-tokens/connect-timeout-ms/read-timeout-ms，默认值对齐设计 3.1（enabled=false）
- [x] 1.2 `AiPropertiesTest`：前缀绑定、默认值、`@ConditionalOnProperty` 条件装配（未配置 key 时无 ChatModel bean，配置后存在）
- [x] 1.3 `ChatMessage`/`ChatOptions`/`AiException`（含 Code 枚举）模型与异常类型
- [x] 1.4 `ChatModel` 接口：`complete(...)` 与 `completeStream(...)`
- [x] 1.5 `OpenAiCompatibleChatModel` 非流式：RestClient 调 `/chat/completions`，解析 `choices[0].message.content`；空 choices 抛 EMPTY_RESPONSE；429/5xx 重试 1 次
- [x] 1.6 `OpenAiCompatibleChatModel` 流式：`Accept: text/event-stream` + BufferedReader 逐行解析，`data:` 行累积 delta、`[DONE]` 触发 onDone、容错跳过异常行、超时/断开 onError
- [x] 1.7 `OpenAiCompatibleChatModelTest`（MockRestServiceServer）：非流式正常/空 choices/429 重试；流式 SSE 行序列（含 [DONE]、夹带异常行、半行）验证 delta 顺序与 onDone/onError
- [x] 1.8 `AiUsageRecorder`：module/model/tokens/耗时/成功与否 info 日志，失败 warn 不阻塞；`AiUsageRecorderTest`

## 2. 后端 AI 表单生成（com.workflow.ai.formgen）

- [x] 2.1 `FormSchemaPromptBuilder`：固定 system prompt（JSON 输出、组件白名单、field 命名 COL_PATTERN、title 中文、options/validate 要求、few-shot 请假单示例）；`FormSchemaPromptBuilderTest`
- [x] 2.2 `FormSchemaValidator`：JSON 可解析 + rule 数组校验；白名单外 type 降级 input；field 非法修正 snake_case/跳过；field 重复加后缀；title 缺失回填 field；汇总 warnings；`FormSchemaValidatorTest`
- [x] 2.3 `AiFormGenerateResult`/`FieldInfo` 记录类型
- [x] 2.4 `AiFormGenerationService`：prompt 组装（temperature 0.3 + JSON mode）→ completeStream → validator 清洗 → AiFormGenerateResult；`AiFormGenerationServiceTest`（FakeChatModel 固定 schema）
- [x] 2.5 `FormGenerationController`：`POST /api/v1/ai/forms/generate`（SSE：meta/chunk/done/error 事件序列）+ `/generate/sync`（`R<AiFormGenerateResult>`）；空描述 400；未配置 503/error 事件；复用现有 Security 认证；`FormGenerationControllerTest`

## 3. 前端（Vue3 + Element Plus）

- [x] 3.1 `api/ai.ts`：`generateForm(description, handlers)` — fetch POST + ReadableStream 解析 `text/event-stream`，onMeta/onDelta/onDone/onError 回调 + AbortController 取消；`aiApi.test.ts`（mock fetch 模拟 SSE 块）
- [x] 3.2 `AiFormGenDialog.vue`：描述输入（必填校验）、生成/取消/重试、流式 JSON 预览区、字段清单、warnings 展示、完成前禁用"应用到设计器"、错误提示；`AiFormGenDialog.test.ts`
- [x] 3.3 `FormDesigner.vue` 集成：工具栏"AI 生成"按钮 + 挂载弹窗 + 回填（`designerRef.setRule(ensureRuleProps(enableCardDesignMode(rule)))`）；`FormDesigner.ai.test.ts`

## 4. 收尾验证

- [x] 4.1 `application.yml`/`.env.example` 增补 `workflow.ai.*` 配置注释示例（enabled 默认 false）
- [x] 4.2 后端全量编译 + 单测通过（`mvn -q test`）
- [x] 4.3 前端 lint + 单测通过（`npm run lint && npm run test`）
- [x] 4.4 未配置 AI 时端到端降级验证：打开表单设计器 AI 入口 → 弹窗显示"AI 服务未配置"可重试，不崩溃（已由自动化覆盖：FormGenerationControllerTest 503/error 事件 + AiFormGenDialog error 态/重试测试；未做浏览器实测）
- [x] 4.5 可选：本地 Ollama/真实 key 冒烟流式生成一个表单并回填画布（未执行：本地无真实 key；链路已由 FakeChatModel 单测覆盖）

## 5. 统一 AI 助手改造（修订：悬浮球 + 对话入口）

- [x] 5.1 基础设施扩展：`ChatMessage` 支持 tool 角色 / `toolCalls` / `toolCallId`；`ChatOptions.tools`；`ToolSpec`/`ToolCall`/`ChatResult`；`ChatModel.completeWithTools`；provider 解析 `tool_calls` 并序列化 tools/tool 消息
- [x] 5.2 工具层：`AiTool` 接口 + `AiToolRegistry`（注册/声明/执行，异常隔离）
- [x] 5.3 表单工具：`GenerateFormSchemaTool`（复用 `AiFormGenerationService`）
- [x] 5.4 Agent 编排：`AiAgentService`（agent loop ≤5 步 + 系统提示 + 审计）
- [x] 5.5 对话端点：`AiChatController` `POST /api/v1/ai/chat`（meta/tool_call/tool_result/message/done/error）
- [x] 5.6 移除旧入口：`FormGenerationController` 及其测试
- [x] 5.7 前端状态与总线：`aiAssistantStore`（显隐持久化/历史/清空/上下文）、`aiActionBus`（on/off/emit，异常隔离）
- [x] 5.8 前端 SSE 客户端：`api/ai.ts` chat（事件解析）
- [x] 5.9 悬浮球 UI：`AiAssistantOrb`（右下角 + 抽屉 + 历史 + 清空 + 上下文自动回填）；`App.vue` 挂载
- [x] 5.10 顶部工具栏显隐开关：`AdminLayout`（默认开启、持久化）
- [x] 5.11 FormDesigner 改造：移除内嵌 AI 按钮/弹窗；注册上下文 + 监听 `applyFormSchema`
- [x] 5.12 测试：后端 AI 测试 45 项；前端专项 18 项；全量回归（前端 1100 全通过；后端仅剩既有失败）
- [x] 5.13 页面跳转后端：`PageRef`/`AiToolContext` + `AiTool.execute(args, ctx)` 签名扩展 + `OpenPageTool`（白名单校验，拒任意 URL）
- [x] 5.14 Agent/Controller 注入可用菜单：`AiAgentService.chat(..., pages, ...)` 动态系统提示 + 工具上下文；`AiChatContext.menus` 解析
- [x] 5.15 前端页面入口：`utils/menuIndex.ts` 展平菜单 → 随请求上下文发送；悬浮球渲染 `open_page` 结果为文字 tag 链接，点击 `router.push`（已在目标页不跳转）
- [x] 5.16 测试：后端 `OpenPageToolTest` + agent/controller 调整；前端 `menuIndex.test.ts` + 悬浮球跳转用例（后端 AI 50 项、前端专项 22 项通过）
- [x] 5.17 入口可靠性修复：提示词禁止"已为你打开"措辞、要求涉及页面必调 open_page；入口改随 `message` 事件 `navigations` 返回（支持多个）；模型未调用工具时按回复文本中的页面名兜底匹配（≤3）；**不自动跳转**（仅点击跳转）
- [x] 5.18 交互形态：抽屉改为**完全悬浮的对话窗体**（固定于悬浮球上方，二次点击悬浮球收起）；消息自动滚动到底部
- [x] 5.19 Markdown 渲染：新增 `dompurify` 依赖；`utils/markdown.ts`（markdown-it html:false + DOMPurify 消毒 + 白名单链接 `data-nav` 拦截、外链新窗口）；`components/ai/MarkdownRenderer.vue`；助手消息改富文本渲染（用户消息保持纯文本）
- [x] 5.20 测试：`markdown.test.ts`（渲染/消毒/站内 link/外链）+ `MarkdownRenderer.test.ts`（渲染 + navigate 事件）
- [x] 5.21 修复 SSE 终止缺陷：`SseEmitter` 异步响应在容器上 chunked 未正确收尾（curl 18 / vite 代理挂起 → 浏览器 "Failed to fetch"）；`AiChatController` 改为同步返回 `text/event-stream;charset=UTF-8` 文本
- [x] 5.22 UI 修复：Markdown 容器取消 `pre-wrap`（消除多余空行）；白名单站内链接渲染为**行内胶囊 tag（带 →）**；提示词引导模型正文内联 `[页面名](/路径)`；底部结构化入口与正文内联链接去重
