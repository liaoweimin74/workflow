# AI 基础设施层 + AI 表单生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立自研轻量 AI 调用基础设施（OpenAI 兼容），并交付表单设计器 AI 生成表单能力（自然语言 → form-create schema → 流式回填画布）。

**Architecture:** 后端新增 Spring Modulith 模块 `com.workflow.ai`（模型抽象 + RestClient 实现的 OpenAI 兼容客户端 + SSE 流式 + 审计），其下 `com.workflow.ai.formgen` 承载表单生成（prompt 工程 + 校验清洗 + SSE/同步端点）。前端 `api/ai.ts` 用 fetch+ReadableStream 解析 SSE，`AiFormGenDialog.vue` 承载生成交互，回填复用 FormDesigner 现有 `setRule` 链路。

**Tech Stack:** Java 21 / Spring Boot 4.0.7 / Spring Modulith / RestClient（已有 starter）; Vue 3 + Element Plus + @form-create/element-ui + Vitest; JUnit5 + MockRestServiceServer。

## Global Constraints

- 组件类型白名单（唯一合法集合）：`input` `inputTextarea` `inputNumber` `select` `checkbox` `radio` `date` `datetime` `time` `dateRange` `switch` `editor` `rate` `divider` `groupContainer`
- 字段命名正则（与 `FormSchemaColumnExtractor.COL_PATTERN` 一致）：`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`
- `workflow.ai.enabled` 默认 `false`；`enabled=false` 或 `api-key` 空 → 不装配 ChatModel bean、AI 端点返回 503 / SSE `error` 事件，msg 为 `"AI 服务未配置"`
- 零新 Maven 依赖（复用 `spring-boot-starter-restclient`）；前端零新 npm 依赖
- `/api/v1/ai/**` 仅登录用户可访问（复用现有 Security，不新增白名单）
- 审计日志仅 `log.info`/`log.warn` 输出，记录失败不得抛出异常（不阻塞主流程）
- 所有用户可见文案使用中文；代码注释与命名遵循现有 `com.workflow` 风格（Lombok、record 可用）

---

### Task 1: AiProperties + 条件装配

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/config/AiProperties.java`
- Create: `backend/src/test/java/com/workflow/ai/config/AiPropertiesTest.java`

**Interfaces:**
- Produces: `AiProperties`（`@ConfigurationProperties("workflow.ai")`）字段：`boolean enabled`、`String baseUrl`、`String apiKey`、`String model`、`double temperature`、`int maxTokens`、`int connectTimeoutMs`、`int readTimeoutMs`；默认值：enabled=false, baseUrl=`https://api.deepseek.com/v1`, model=`deepseek-chat`, temperature=0.7, maxTokens=4096, connectTimeoutMs=5000, readTimeoutMs=120000

- [ ] **Step 1: 写失败测试**
  断言默认值绑定与 `@ConditionalOnProperty` 装配行为（enabled=false 时无 ChatModel bean）。
- [ ] **Step 2: 运行确认失败**
  `mvn -q -pl . test -Dtest=AiPropertiesTest` → 编译失败（类不存在）。
- [ ] **Step 3: 实现**
  `AiProperties.java` 用 `@ConfigurationProperties` + record/class；`AiAutoConfiguration` 用 `@Bean @ConditionalOnProperty(prefix="workflow.ai", name="enabled", havingValue="true")` 声明 `ChatModel` bean（Task 3 实现后生效，本任务先定义装配骨架）。
- [ ] **Step 4: 运行确认通过**
  同上命令 → PASS。
- [ ] **Step 5: Commit**
  `git add backend/src/main/java/com/workflow/ai backend/src/test/java/com/workflow/ai && git commit -m "feat(ai): AiProperties 配置与条件装配骨架"`

---

### Task 2: 模型与异常类型

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/model/ChatMessage.java`
- Create: `backend/src/main/java/com/workflow/ai/model/ChatOptions.java`
- Create: `backend/src/main/java/com/workflow/ai/exception/AiException.java`
- Create: `backend/src/test/java/com/workflow/ai/exception/AiExceptionTest.java`

**Interfaces:**
- Produces:
  - `record ChatMessage(ChatMessage.Role role, String content)`，`enum Role { system, user, assistant }`
  - `record ChatOptions(Double temperature, Integer maxTokens, boolean stream, String responseFormat)`（responseFormat 传 `"json_object"` 或 null）
  - `class AiException extends RuntimeException`，`enum Code { CONFIG_MISSING, CONNECT_FAILED, TIMEOUT, HTTP_ERROR, EMPTY_RESPONSE, STREAM_ERROR }`，构造 `AiException(Code, String msg)` / `AiException(Code, String msg, Throwable)` / `AiException(Code, String msg, int httpStatus)`

- [ ] **Step 1: 写失败测试** — 断言 Role 枚举、record 构造、AiException 携带 Code 与 httpStatus。
- [ ] **Step 2: 运行确认失败** — 编译失败。
- [ ] **Step 3: 实现三个类型。**
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): ChatMessage/ChatOptions/AiException 模型`

---

### Task 3: ChatModel 接口 + 非流式实现

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/model/ChatModel.java`
- Create: `backend/src/main/java/com/workflow/ai/provider/OpenAiCompatibleChatModel.java`
- Create: `backend/src/test/java/com/workflow/ai/provider/OpenAiCompatibleChatModelTest.java`

**Interfaces:**
- Produces:
  - `interface ChatModel { String complete(List<ChatMessage> messages, ChatOptions options); void completeStream(List<ChatMessage> messages, ChatOptions options, Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError); }`
  - `OpenAiCompatibleChatModel(RestClient.Builder restClientBuilder, AiProperties props)`（spring 注入）

- [ ] **Step 1: 写失败测试（非流式）**
  用 `MockRestServiceServer.bindTo(restClientBuilder)`：
  - 正常：mock 200 返回 `{"choices":[{"message":{"content":"hi"}}]}` → 断言 `complete` 返回 `"hi"`
  - 空 choices：`{"choices":[]}` → 断言抛 `AiException(EMPTY_RESPONSE)`
  - 429：第一次 429，第二次 200 → 断言重试后成功（`AiProperties` 注入短重试间隔便于测试）
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现非流式**
  构造 `RestClient`（`baseUrl` + `SimpleClientHttpRequestFactory` 设置 connect/read 超时）；POST body 用 `LinkedHashMap` 组装 `{model, messages:[{role,content}], temperature, max_tokens, stream:false, response_format:(responseFormat!=null? Map.of("type",responseFormat): null)}`（null 值过滤）；`retrieve().body(JsonNode.class)` 后取 `choices[0].message.content`；429/5xx 重试 1 次（指数退避 500ms，用 `for` 循环手动实现，不引依赖）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): ChatModel 接口与非流式 OpenAI 兼容实现`

---

### Task 4: 流式实现（SSE 解析）

**Files:**
- Modify: `backend/src/main/java/com/workflow/ai/provider/OpenAiCompatibleChatModel.java`
- Modify: `backend/src/test/java/com/workflow/ai/provider/OpenAiCompatibleChatModelTest.java`

**Interfaces:**
- Consumes: `ChatModel.completeStream` 签名（Task 3）
- Produces: 流式实现——`RestClient.exchange(...)` 拿 `ClientHttpResponse`，`BufferedReader` 逐行读，事件回调按 Task 3 接口约定

- [ ] **Step 1: 写失败测试（流式）**
  用 `MockRestServiceServer` 模拟 `text/event-stream` 响应体（`MockResponse` 可设 header `Content-Type: text/event-stream` 与 body）：
  - 正常序列：`data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n` → onDelta 依次收到 "你"、"好"，最后 onDone；用 `CountDownLatch`/`AtomicReference` 收集
  - 夹带异常行：中间插 `event: ping\n\n` 与 `data: not-json\n\n` → 跳过不中断
  - 空 delta：`{"choices":[{"delta":{}}]}` → 不回调
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现流式**
  POST `stream:true` + header `Accept: text/event-stream`；`exchange` 后按行读：行以 `data:` 开头则截取余部；`[DONE]` → onDone 并 break；否则 `ObjectMapper` 解析 `choices[0].delta.content`，非 null 且非空 → onDelta；解析失败 `catch` 后 continue；IO 异常/超时 → onError(STREAM_ERROR/TIMEOUT)。流式不重试。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 流式 SSE 逐块解析`

---

### Task 5: 调用审计 AiUsageRecorder

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/support/AiUsageRecorder.java`
- Create: `backend/src/test/java/com/workflow/ai/support/AiUsageRecorderTest.java`

**Interfaces:**
- Produces: `class AiUsageRecorder { void recordSuccess(String module, String model, long promptTokens, long completionTokens, long elapsedMs); void recordFailure(String module, String model, String error, long elapsedMs); }`（内部 SLF4J logger）

- [ ] **Step 1: 写失败测试** — `MockedStatic`/自定义 appender 断言 info/warn 输出；失败方法不抛异常。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（log.info / log.warn；`recordFailure` 内 try-catch 包裹全部逻辑）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): AiUsageRecorder 调用审计（日志，不落库）`

---

### Task 6: FormSchemaPromptBuilder

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/formgen/FormSchemaPromptBuilder.java`
- Create: `backend/src/test/java/com/workflow/ai/formgen/FormSchemaPromptBuilderTest.java`

**Interfaces:**
- Produces: `class FormSchemaPromptBuilder { String buildSystemPrompt(); }`；`List<ChatMessage> buildMessages(String description)` 返回 `[system(固定), user(描述原文)]`

- [ ] **Step 1: 写失败测试** — 断言 system prompt 包含全部白名单组件、正则 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` 文本、`json_object` 输出要求、至少一条示例；`buildMessages` 的 user content 等于描述原文。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（多行文本块，参考 design 4.2 约束逐条写入；few-shot 请假单示例）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单生成 system prompt 工程`

---

### Task 7: FormSchemaValidator

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/formgen/FormSchemaValidator.java`
- Create: `backend/src/main/java/com/workflow/ai/formgen/AiFormGenerateResult.java`
- Create: `backend/src/test/java/com/workflow/ai/formgen/FormSchemaValidatorTest.java`

**Interfaces:**
- Produces:
  - `record AiFormGenerateResult(String schema, List<FieldInfo> fields, List<String> warnings)`
  - `record FieldInfo(String field, String title, String componentType)`
  - `class FormSchemaValidator { AiFormGenerateResult validate(String rawJson); }`（抛 `AiException(Code.EMPTY_RESPONSE, "模型输出无法解析")` 当非 JSON 且无法提取）

- [ ] **Step 1: 写失败测试**
  - 合法 schema → 通过且 warnings 空
  - 白名单外 type `slider` → 降级 `input` + warning
  - field 含中文/空格 `"请假 原因"` → 修正 snake_case（`请假_原因` → `qingjia_yuanyin`，用去空格+小写+下划线策略，具体算法见 Step 3）或跳过 + warning
  - 重复 field → 后者 `_2` 后缀 + warning
  - title 缺失 → 回填 field
  - 纯垃圾文本 → 抛 AiException
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**
  `ObjectMapper.readTree`；`rule` 非数组 → 正则 `\{[^{}]*"type"\s*:\s*"[^"]+"[^{}]*\}` 提取候选 JSON 块重试解析，仍失败 → 抛异常；逐项清洗：type 白名单映射（不在 → `input`）、field 规范化（仅保留 `[a-zA-Z0-9_]`、非字母开头前缀 `f_`、snake_case 化：大写转 `_小写`）、重复加 `_2`、title 回填 field；`warnings` 收集；最终序列化 `{"rule":[...]}`（用 `ObjectMapper` 重建 JsonNode 数组）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单 schema 输出校验与清洗`

---

### Task 8: AiFormGenerationService

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/formgen/AiFormGenerationService.java`
- Create: `backend/src/test/java/com/workflow/ai/formgen/AiFormGenerationServiceTest.java`

**Interfaces:**
- Consumes: `ChatModel`、`FormSchemaPromptBuilder`、`FormSchemaValidator`、`AiUsageRecorder`
- Produces: `class AiFormGenerationService { AiFormGenerateResult generateSync(String description); StreamGenerateResult generateStream(String description, Consumer<String> onDelta); }`，`record StreamGenerateResult(AiFormGenerateResult result, String rawText)`；内部 `ChatOptions` 固定 `temperature=0.3, maxTokens=4096, stream=true, responseFormat="json_object"`

- [ ] **Step 1: 写失败测试** — 注入 `FakeChatModel`（`ChatModel` 测试替身：`completeStream` 回调固定 schema 文本的 delta 后 onDone；`complete` 返回同文本）。断言 `generateSync` 返回清洗后结果；`generateStream` 的 onDelta 收到增量、返回 result。断言 recorder 被调用（注入 spy）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**（编排：buildMessages → completeStream 累积全文 → validate → recorder）。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单生成服务编排`

---

### Task 9: FormGenerationController（SSE + sync）

**Files:**
- Create: `backend/src/main/java/com/workflow/ai/formgen/FormGenerationController.java`
- Create: `backend/src/test/java/com/workflow/ai/formgen/FormGenerationControllerTest.java`

**Interfaces:**
- Consumes: `AiFormGenerationService`、`AiProperties`
- Produces: `POST /api/v1/ai/forms/generate`（SSE，`SseEmitter` 返回）、`POST /api/v1/ai/forms/generate/sync`（`R<AiFormGenerateResult>`）；请求体 record `FormGenerateRequest(String description)`
- SSE 事件：`meta`（`{"taskId":"...","model":"..."}`）→ `chunk`（`{"delta":"..."}`）→ `done`（`{"schema":"...","fields":[...],"warnings":[...]}`）或 `error`（`{"code":"...","msg":"..."}`）

- [ ] **Step 1: 写失败测试**
  - `MockMvc` + `FakeChatModel` bean（`@TestConfiguration`）：
    - 空描述 → 400
    - 未配置（enabled=false profile）→ `/sync` 503 `msg="AI 服务未配置"`；SSE 端点 `error` 事件
    - 正常 `/sync` → `code=0`、`data.schema` 可解析
    - 正常 SSE → 响应 Content-Type `text/event-stream`，body 含 `event: meta`、`event: done`（`MockMvc` 对 SseEmitter 需 `asyncDispatch`）
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**
  Controller：`@PostMapping` 两个端点；SSE 端点返回 `SseEmitter`（`new SseEmitter(300_000L)`），在 service 回调中 `emitter.send(SseEmitter.event().name(...).data(...))`，done/error 后 `emitter.complete()`；`@ExceptionHandler`/`try-catch` 统一错误 → `error` 事件；未启用时直接返回 503（`ResponseEntity.status(503)`）或 error 事件。复用现有 `R` 包装类型。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单生成 SSE/同步端点`

---

### Task 10: 前端 SSE 客户端 api/ai.ts

**Files:**
- Create: `frontend/src/api/ai.ts`
- Create: `frontend/src/api/__tests__/aiApi.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AiFieldInfo { field: string; title: string; componentType: string }
  export interface AiFormGenerateResult { schema: string; fields: AiFieldInfo[]; warnings: string[] }
  export function generateForm(description: string, handlers: {
    onMeta(m: { taskId: string; model: string }): void
    onDelta(delta: string): void
    onDone(r: AiFormGenerateResult): void
    onError(e: { code: string; msg: string }): void
  }): AbortController
  ```

- [ ] **Step 1: 写失败测试** — mock 全局 `fetch`（返回 `ReadableStream` 分块吐出 SSE 文本：meta → 2 chunk → done），断言回调顺序与参数、AbortController 中止后不再回调。
- [ ] **Step 2: 运行确认失败** — `npm run test -- aiApi`（用项目既有 Vitest 命令，见 `frontend/package.json`）。
- [ ] **Step 3: 实现**
  `fetch('/v1/ai/forms/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({description}), signal})`；`response.body.getReader()` + `TextDecoder`；按 `\n\n` 切事件块；解析 `event:`/`data:` 行；`done` 事件 `JSON.parse(data)` 后 onDone；`error` 事件 onError；非 200 → 读 `R` 结构取 msg 调 onError。返回 controller。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 前端 SSE 流式客户端封装`

---

### Task 11: AiFormGenDialog.vue

**Files:**
- Create: `frontend/src/views/form/components/AiFormGenDialog.vue`
- Create: `frontend/src/views/form/components/__tests__/AiFormGenDialog.test.ts`

**Interfaces:**
- Consumes: `generateForm`（Task 10）
- Produces: props `modelValue: boolean`；emit `update:modelValue`、`apply(rule: unknown[])`；内部 state：`description`、`status: 'idle'|'generating'|'done'|'error'`、`previewJson`、`fields`、`warnings`、`errorMsg`

- [ ] **Step 1: 写失败测试** — mock `generateForm`：
  - 空描述点生成 → 显示必填提示、不调用 generateForm
  - 生成中 → 按钮禁用、显示状态
  - onDelta 累积 → 预览区更新
  - done → "应用到设计器"可用，点击 emit `apply(rule)`（解析 schema 取 `rule`）
  - error → 显示错误 + 重试按钮
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**
  复用现有 `el-dialog` + `el-input`（参考 `StyleScriptDialog.vue` 弹窗风格）；预览区 `<pre>` 展示格式化 JSON；字段清单表格；warnings 用 `el-alert`（warning 类型）；生成中用 `v-loading` 或 loading 按钮。挂载时清空旧状态。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单生成弹窗组件`

---

### Task 12: FormDesigner.vue 集成

**Files:**
- Modify: `frontend/src/views/form/FormDesigner.vue`
- Create: `frontend/src/views/form/__tests__/FormDesigner.ai.test.ts`

**Interfaces:**
- Consumes: `AiFormGenDialog`（Task 11）
- Produces: 工具栏按钮（点击 → 弹窗）；`handleAiApply(rule)` 调 `designerRef.value.setRule(ensureRuleProps(enableCardDesignMode(rule)))`

- [ ] **Step 1: 写失败测试** — 渲染 FormDesigner（mock 内部依赖），点"AI 生成"按钮 → 弹窗出现；模拟弹窗 `apply` 事件 → 断言 `setRule` 被调用且入参为转换后的 rule（可断言通过 stub 的 `designerRef`）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现**
  参考 `DesignerToolbar`/现有 FormDesigner 工具栏结构加按钮（图标 `MagicStick`/`Sparkles`，文案"AI 生成"）；引入并挂载 `AiFormGenDialog`；实现 `handleAiApply`。
- [ ] **Step 4: 运行确认通过。**
- [ ] **Step 5: Commit** — `feat(ai): 表单设计器 AI 生成入口与画布回填`

---

### Task 13: 配置示例与全量验证

**Files:**
- Modify: `backend/src/main/resources/application.yml`（增补注释配置）
- Modify: `frontend/.env.example`（如存在，增补注释）

- [ ] **Step 1: application.yml 增补**
  ```yaml
  workflow:
    ai:
      enabled: false            # AI 服务开关；配置下方 api-key 后置 true
      base-url: ${AI_BASE_URL:https://api.deepseek.com/v1}
      api-key: ${AI_API_KEY:}
      model: ${AI_MODEL:deepseek-chat}
      temperature: 0.7
      max-tokens: 4096
      connect-timeout-ms: 5000
      read-timeout-ms: 120000
  ```
- [ ] **Step 2: 后端全量验证** — `mvn -q test` 全绿。
- [ ] **Step 3: 前端全量验证** — `npm run lint && npm run test` 全绿。
- [ ] **Step 4: 降级冒烟** — 未配置 key 启动后端，前端打开表单设计器 AI 入口 → 弹窗提示"AI 服务未配置"可重试、页面不崩溃。
- [ ] **Step 5: Commit** — `chore(ai): 配置示例与验证`

---

## Phase 2：统一 AI 助手改造（悬浮球 + 对话入口）

> 入口形态修订（见 design.md 第 10 节）：表单生成改为助手工具，经对话触发并上下文自动回填。原内嵌按钮方案废弃。

### Task 14: 基础设施支持工具调用

**Files:**
- Modify: `backend/.../ai/model/ChatMessage.java`（tool 角色 / toolCalls / toolCallId）
- Create: `backend/.../ai/model/{ToolSpec,ToolCall,ChatResult}.java`
- Modify: `backend/.../ai/model/{ChatOptions,ChatModel}.java`、`backend/.../ai/provider/OpenAiCompatibleChatModel.java`
- Test: `OpenAiCompatibleChatModelTest`（工具解析、tools 序列化、tool 消息）

- [x] 写测试 → 实现 → `mvn test -Dtest=OpenAiCompatibleChatModelTest` → Commit

### Task 15: 工具层与表单工具

**Files:**
- Create: `backend/.../ai/tool/{AiTool,AiToolRegistry}.java`、`backend/.../ai/formgen/GenerateFormSchemaTool.java`
- Test: `AiToolRegistryTest`、`GenerateFormSchemaToolTest`

- [x] 实现 → 测试

### Task 16: Agent 编排

**Files:**
- Create: `backend/.../ai/agent/AiAgentService.java`
- Test: `AiAgentServiceTest`（无工具 / 工具调用后回复 / 未配置）

- [x] 实现 → 测试

### Task 17: 对话端点

**Files:**
- Create: `backend/.../ai/chat/AiChatController.java`
- Delete: `backend/.../ai/formgen/FormGenerationController.java` + 测试
- Test: `AiChatControllerTest`（400 / 未配置 error / meta-message-done）

- [x] 实现 → 测试 → Commit `feat(ai): 统一助手后端（function calling agent + /ai/chat，移除独立表单端点）`

### Task 18: 前端状态 / 动作总线 / SSE 客户端

**Files:**
- Create: `frontend/src/stores/aiAssistantStore.ts`、`frontend/src/utils/aiActionBus.ts`
- Rewrite: `frontend/src/api/ai.ts`（chat SSE）
- Delete: `frontend/src/views/form/components/AiFormGenDialog.vue` + 测试
- Test: `aiAssistantStore.test.ts`、`aiActionBus.test.ts`、`api/__tests__/ai.test.ts`

- [x] 实现 → 测试

### Task 19: 悬浮球与显隐开关

**Files:**
- Create: `frontend/src/components/ai/AiAssistantOrb.vue`
- Modify: `frontend/src/App.vue`（挂载）、`frontend/src/layouts/AdminLayout.vue`（开关）
- Test: `AiAssistantOrb.test.ts`（可见性 / 发送 / 上下文回填 / 错误 / 清空）

- [x] 实现 → 测试

### Task 20: FormDesigner 改造

**Files:**
- Modify: `frontend/src/views/form/FormDesigner.vue`（移除内嵌入口；注册上下文 + 监听 applyFormSchema）
- Test: `FormDesigner.ai.test.ts`（源码级接线断言）

- [x] 实现 → 测试 → Commit `feat(ai): 统一悬浮球助手入口（前端）`
- [x] 全量验证：前端 1100 全通过；后端 AI 45 项全通过（全量仅剩既有 `PageDefinitionPublishIntegrationTest` 失败）
