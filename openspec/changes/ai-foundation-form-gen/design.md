# Design: AI 基础设施层 + AI 表单生成

> 变更：`ai-foundation-form-gen`　|　基于方案 A（自研轻量 AI 客户端层）

## 1. 目标与范围

### 目标
- 建立可复用的 AI 调用基础设施（供应商抽象、流式、结构化输出、审计），后续 AI 能力（审批助手、流程生成、问数）直接消费。
- 交付首个业务场景：表单设计器 AI 生成表单。

### 范围
- **In scope**：后端 `com.workflow.ai` 模块（模型抽象 + OpenAI 兼容实现 + 配置 + 异常）；AI 表单生成（后端 prompt/校验/流式端点 + 前端弹窗交互）；前后端测试。
- **Out of scope**：RAG/向量库；审批助手、流程生成、NL2DSL 等其他 AI 能力；多模型供应商 UI 切换（配置驱动，后续可加）。
- **入口形态（修订）**：改为**统一悬浮球 + 对话**入口；表单生成作为助手工具，经对话触发并上下文自动回填。原"设计器内嵌按钮"形态已废弃（见第 10 节）。

## 2. 架构

```
frontend (Vue3)                         backend (Spring Boot 4.0.7, Spring Modulith)
┌──────────────────────┐                ┌───────────────────────────────────────────┐
│ FormDesigner.vue     │                │ com.workflow.ai  (新模块)                    │
│  └ AiFormGenDialog   │  POST /v1/ai/  │  ┌─ config: AiProperties                  │
│     └ aiApi.ts(SSE)  │────forms──────▶│  ├─ model: ChatModel/ChatMessage/Options   │
│       (fetch stream) │    /generate   │  ├─ provider: OpenAiCompatibleChatModel    │
│                      │◀══SSE═══chunks─│  ├─ sse: AiSseEmitterFactory               │
└──────────────────────┘                │  └─ support: AiException/AiUsageRecorder   │
                                        │ com.workflow.ai.formgen (业务场景)          │
                                        │  ┌─ FormGenerationController (SSE + sync)  │
                                        │  ├─ AiFormGenerationService                │
                                        │  ├─ FormSchemaPromptBuilder                │
                                        │  └─ FormSchemaValidator                    │
                                        └───────────────────────────────────────────┘
```

模块边界（Spring Modulith）：`ai` 模块对外仅暴露 `ChatModel`、`ChatMessage`、`AiException`；`ai.formgen` 依赖 `ai` 与 `engine.form`（复用 schema 相关工具）。

## 3. AI 基础设施层（com.workflow.ai）

### 3.1 配置 AiProperties（`@ConfigurationProperties(prefix="workflow.ai")`）

```yaml
workflow:
  ai:
    enabled: false            # 默认关闭；配置 api-key 后置 true
    base-url: ${AI_BASE_URL:https://api.deepseek.com/v1}
    api-key: ${AI_API_KEY:}
    model: ${AI_MODEL:deepseek-chat}
    temperature: 0.7
    max-tokens: 4096
    connect-timeout-ms: 5000
    read-timeout-ms: 120000   # 流式需较长读超时
```

`@ConditionalOnProperty(prefix="workflow.ai", name="enabled", havingValue="true")` 控制 `ChatModel` bean 装配；未启用时 `AiFormGenerationController` 返回 503 中文提示"AI 服务未配置"。

### 3.2 模型抽象

```java
public record ChatMessage(Role role, String content) {           // Role: system/user/assistant
    public enum Role { system, user, assistant }
}

public record ChatOptions(Double temperature, Integer maxTokens, boolean stream, JsonNode responseFormat /* null 表示默认 */) {}

public interface ChatModel {
    /** 非流式：完整返回 assistant 文本内容 */
    String complete(List<ChatMessage> messages, ChatOptions options);
    /** 流式：逐块回调 delta 文本；正常结束回调 onDone；异常回调 onError */
    void completeStream(List<ChatMessage> messages, ChatOptions options,
                        Consumer<String> onDelta, Consumer<String> onDone, Consumer<AiException> onError);
}
```

### 3.3 OpenAI 兼容实现 OpenAiCompatibleChatModel

基于 `RestClient`（pom 已有 `spring-boot-starter-restclient`）：

- **非流式**：`POST {base-url}/chat/completions`
  - body：`{model, messages:[{role,content}], temperature, max_tokens, stream:false, response_format: 非空时 {type:"json_object"}}`
  - 解析 `choices[0].message.content`；空 choices 抛 `AiException.EMPTY_RESPONSE`
- **流式**：`POST` 同上但 `stream:true`，`Accept: text/event-stream`
  - 逐行解析：`data: {...}` 行累积；`choices[0].delta.content` 非空即回调 onDelta；`data: [DONE]` 触发 onDone
  - 行内 JSON 解析失败跳过该行（容错）；读超时/连接失败抛 `AiException` 并回调 onError
  - 内部用 `RestClient` 的 `exchange` 拿原始 `ClientHttpResponse`，自行 `BufferedReader` 按行读流（RestClient 的 body-to-object 不适合 SSE）
- **重试**：非流式对 429/5xx 重试 1 次（指数退避 500ms）；流式不自动重试（避免重复输出），仅透传错误
- **超时**：连接/读超时取自配置；`SimpleClientHttpRequestFactory` 设置

### 3.4 异常 AiException

```java
public class AiException extends RuntimeException {
    public enum Code { CONFIG_MISSING, CONNECT_FAILED, TIMEOUT, HTTP_ERROR, EMPTY_RESPONSE, STREAM_ERROR }
    // 携带 code + httpStatus(可选)
}
```

全局异常处理器（复用现有 `@RestControllerAdvice` 模式）将 AI 错误映射为 `R` 统一响应（msg 中文提示），SSE 端点内错误以 `error` 事件推送。

### 3.5 调用审计 AiUsageRecorder

基础设施层增值：`@Around` 或显式调用，记录 `module/model/promptTokens/completionTokens/耗时/是否成功`，`log.info` 输出（后续可接审计表，本期只落日志，不建表）。

## 4. AI 表单生成（com.workflow.ai.formgen）

### 4.1 API

**流式**（主路径，前端消费）：
```
POST /api/v1/ai/forms/generate
Content-Type: application/json
{ "description": "员工请假单：姓名、部门、请假类型、开始日期、结束日期、请假天数、请假原因" }

响应：text/event-stream，事件序列：
event: meta      data: {"taskId":"...","model":"deepseek-chat"}          // 开始
event: chunk     data: {"delta":"{\"rule\":[{\"type\":"}                  // JSON schema 文本增量
event: done      data: {"schema":"<完整 JSON>","fields":[...],"warnings":[...]}  // 完成+校验结果
event: error     data: {"code":"...","msg":"..."}                        // 失败
```

**同步**（测试/简单消费方）：
```
POST /api/v1/ai/forms/generate/sync
{ "description": "..." }
→ R<AiFormGenerateResult> { schema, fields, warnings }
```

`AiFormGenerateResult`：
```java
public record AiFormGenerateResult(String schema, List<FieldInfo> fields, List<String> warnings) {}
public record FieldInfo(String field, String title, String componentType) {}
```

鉴权：`/api/v1/ai/**` 复用现有 Security 已认证路径（不新增白名单）。

### 4.2 Prompt 工程 FormSchemaPromptBuilder

System prompt 固定内容（英文书写更稳）：
- 角色：低代码表单设计助手
- 输出格式：严格 JSON `{"rule": [...]}`（form-create rule 数组），配合 `response_format: json_object`
- 组件类型白名单：`input`（单行文本）、`inputTextarea`（多行文本）、`inputNumber`（数字）、`select`（下拉单选）、`checkbox`（多选）、`radio`（单选）、`date`（日期）、`datetime`、`time`、`dateRange`、`switch`（开关）、`editor`（富文本）、`rate`（评分）、`divider`（分割线）、`groupContainer`（分组）
  - 说明：`userPicker`/`deptPicker`/`dataPicker` 需要额外数据源绑定，本期不自动生成
- 字段命名：`field` 用 snake_case 英文，正则 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`（与 `FormSchemaColumnExtractor.COL_PATTERN` 一致）；`title` 用中文
- 结构：每项 `{type, field, title, value: 默认值(null), validate: 必填时 [{required:true,message:"请填写X"}]}`；`select/radio/checkbox` 需带 `options`（`[{label,value}]`）
- 约束：描述中的中文标题 → 合理映射组件类型；枚举语义 → select/radio；数字 → inputNumber；日期 → date；多行 → inputTextarea
- 示例输出（few-shot 1 条：请假单）
- 用户输入仅作为 user message 传入

### 4.3 校验清洗 FormSchemaValidator

对 AI 输出 JSON 做防御性校验（AI 不可信）：
1. JSON 可解析、`rule` 为数组；否则 `warnings` + 尝试提取规则（正则兜底提取 `{...}` 块），失败则返回错误
2. 每项：`type` 必须在白名单（不在 → 降级为 `input` + warning）；`field` 必须匹配 COL_PATTERN（不匹配 → 自动改 snake_case 或跳过 + warning）；`field` 重复 → 加后缀 `_2`；`title` 缺失 → 回填 field
3. 输出 `fields`（FieldInfo 列表）供前端预览；`warnings` 汇总所有修正项
4. 清洗后序列化为最终 `schema`（`{"rule":[...]}`）

### 4.4 编排 AiFormGenerationService

```
generate(description):
  messages = [system(promptBuilder.build()), user(description)]
  options = {temperature: 0.3, maxTokens: 4096, stream:true, responseFormat: jsonObject}
  chatModel.completeStream(...)   // delta 透传给 SSE
  → done 时 schemaRaw = 累积全文
  → validator.validate(schemaRaw) → AiFormGenerateResult
```

温度用 0.3（结构化输出偏好确定性），与通用聊天默认 0.7 区分。

### 4.5 SSE 服务端

- `AiSseEmitterFactory`：每次请求 `new SseEmitter(5min)`，完成/超时/错误回调清理
- 与通知中心 `SseEmitterManager` 的区别：后者是 userId → emitter 的长连接推送通道；本处是请求-响应式一次性流，不复用、不混用
- 控制器用 `SseEmitter` 返回，`chunk` 事件带 `data`；前端 `EventSource` 无法带 POST body → 前端用 `fetch` + `ReadableStream` 手动解析 `text/event-stream`（方案见 5.2）

## 5. 前端

### 5.1 交互流程（FormDesigner.vue）

```
工具栏新增"✨ AI 生成"按钮 → 打开 AiFormGenDialog 弹窗
  → 用户输入描述 → 点"生成"
  → aiApi.generateForm(description) 流式接收
  → 弹窗内实时显示 JSON 预览（语法高亮/格式化）+ 字段清单 + warnings 提示
  → 生成完成 → "应用到设计器"按钮可用
  → 点击 → 回填：designerRef.setRule(ensureRuleProps(enableCardDesignMode(parsed.rule)))
  → 关弹窗，画布呈现新表单，用户继续拖拽微调
```

- 失败/未配置（503）→ 弹窗内错误提示 + 重试按钮；生成中禁用"应用到设计器"
- 支持"重新生成"（换 prompt 描述再次调用）
- 空描述校验（必填）

### 5.2 SSE 客户端封装 aiApi.ts

`fetch` 方案（POST + 流式）：
```ts
async function generateForm(description: string, handlers: {
  onMeta(m: {taskId: string}): void
  onDelta(delta: string): void
  onDone(r: AiFormGenerateResult): void
  onError(e: {code: string; msg: string}): void
}): Promise<AbortController>
```
- `fetch('/v1/ai/forms/generate', {method:'POST', body, headers, signal})`
- 读取 `response.body.getReader()`，`TextDecoder` 解码，按 `\n\n` 切事件块，解析 `event:` / `data:` 行
- 返回 `AbortController` 供"取消生成"
- 错误：HTTP 非 200 → 读 `R` 结构 msg 提示；SSE `error` 事件 → onError

### 5.3 组件

- `frontend/src/views/form/components/AiFormGenDialog.vue`（新）：描述输入、生成/取消/重试、流式预览区、字段清单、warnings、应用到设计器
- `FormDesigner.vue` 改动：工具栏加按钮 + 挂载弹窗 + 回填逻辑（回填复用现有 `ensureRuleProps`/`enableCardDesignMode` 链路）
- `frontend/src/api/ai.ts`（新）

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| AI 未配置（enabled=false / key 空） | 同步端点 503 `R{msg:"AI 服务未配置"}`；SSE 端点发 `error` 事件 |
| 连接失败/超时 | 同步：`R` 500 中文提示；SSE：`error` 事件 + onError；前端可重试 |
| 非 2xx（含 401/429/5xx） | 非流式重试 1 次后抛 AiException.HTTP_ERROR；SSE 透传 `error` 事件 |
| 模型输出非 JSON / 字段非法 | `FormSchemaValidator` 清洗 + `warnings`；完全不可用才报错 |
| 空 choices / 流中断 | AiException.EMPTY_RESPONSE / STREAM_ERROR → 前端提示重试 |
| 前端取消 | AbortController 中止 fetch，后端 emitter 完成回调清理 |

## 7. 测试策略

### 后端（TDD：RED → GREEN → REFACTOR）
- `AiPropertiesTest`：前缀绑定、默认值、enabled 条件装配（无 key 时不创建 ChatModel bean）
- `OpenAiCompatibleChatModelTest`：`MockRestServiceServer`（`spring-boot-starter-test` 自带）mock `/chat/completions`
  - 非流式：正常解析 content；空 choices 抛 EMPTY_RESPONSE；429 重试一次后成功/失败
  - 流式：模拟 SSE 行序列（含 `data: [DONE]`、夹带非 data 行、半行换行）验证 delta 累积与 onDone；读超时 onError
- `FormSchemaValidatorTest`：合法 schema 通过；非法组件类型降级 + warning；非法/重复 field 修正；title 回填；非 JSON 输入报错
- `FormSchemaPromptBuilderTest`：system prompt 含白名单与 COL_PATTERN 约束；user message 为描述原文
- `AiFormGenerationServiceTest`：注入测试用 `FakeChatModel`（返回固定 schema），验证编排、温度 0.3、validator 调用、审计记录
- `FormGenerationControllerTest`：SSE 端点返回事件序列（meta/chunk/done）；未配置时 503；`/sync` 返回 `R<AiFormGenerateResult>`
- 集成：`@SpringBootTest` + 未配置 key → ChatModel bean 不存在、controller 503（优雅降级验证）

### 前端（Vitest + @vue/test-utils）
- `aiApi.test.ts`：mock fetch（`ReadableStream` 模拟 SSE 块），验证 onMeta/onDelta/onDone/onError 触发顺序、AbortController 取消
- `AiFormGenDialog.test.tsx`：mock aiApi，验证描述校验、流式预览渲染、warnings 展示、应用回填回调
- `FormDesigner.ai.test.ts`：mock aiApi，验证工具栏按钮 → 弹窗 → 回填 `setRule` 调用（断言 rule 内容）

### 手工验证（不依赖 CI 真实 key）
- 用 `FakeChatModel` profile 或本地 Ollama 起真实链路验证流式体验
- 真实 DeepSeek key 冒烟（可选，本地执行）

## 8. 安全

- `/api/v1/ai/**` 仅登录用户（复用现有 Security），不做匿名放行
- API key 仅存后端 `application.yml`/环境变量，前端零接触
- system prompt 固定，用户输入仅作 user message；不承诺输出内容过滤（本期），提示注入风险以"固定 system prompt + 白名单校验兜底"缓解，记入 verify
- 审计日志记录 AI 调用（module/model/tokens/耗时/结果），便于追溯异常消耗

## 9. 非目标与后续

- 本变更不建任何新表（AI 调用仅日志）；后续如需调用统计再建表
- 模型供应商多选/UI 切换 → 后续 `workflow.ai.providers` 列表扩展

## 10. 统一 AI 助手（修订：悬浮球 + 对话入口）

> 用户确认：改为**统一悬浮球入口**，所有 AI 能力经对话完成；**上下文绑定自动回填**；对话**保留历史且可手动清空**；悬浮球在右下角，顶部工具栏提供显隐开关（默认开启）。原设计器内嵌按钮方案废弃。

### 10.1 入口
- `App.vue` 挂载 `AiAssistantOrb.vue`（全局，覆盖全屏设计器页；登录页隐藏）
- 悬浮球固定右下角；`AdminLayout` 顶部工具栏提供显隐开关（默认开启，`localStorage` 持久化）
- 点击开**完全悬浮的对话窗体**（固定于悬浮球上方，非抽屉），再次点击悬浮球收起

### 10.2 后端：对话 + 工具路由
- `POST /api/v1/ai/chat`（SSE：meta → tool_call → tool_result → message → done | error）
- `AiAgentService`：agent loop（最多 5 步）——把工具声明发给模型 → 执行 tool_calls → 回填 tool 消息 → 继续，直至最终文本
- `AiTool` + `AiToolRegistry`：工具注册与执行（异常返回错误 JSON 不中断）；工具签名携带 `AiToolContext`
- `GenerateFormSchemaTool`：复用 `AiFormGenerationService` 生成表单（能力层复用）
- `OpenPageTool`：页面跳转入口——`path` 仅接受当前用户**菜单白名单**（由客户端随请求提供），拒任意 URL
- 基础设施扩展：`ChatMessage` 增加 tool 角色 / `toolCalls` / `toolCallId`；`ChatOptions.tools`；`ChatModel.completeWithTools`；provider 解析 `tool_calls` 并序列化 tools/tool 消息
- **移除** `FormGenerationController`（不再有独立表单生成端点）

### 10.3 上下文与动作派发
- `aiAssistantStore`：`visible`（持久化）/ `messages` / `context`
- 页面注册上下文：FormDesigner 挂载注册 `{route:'form-designer', formId}`，卸载清除
- `aiActionBus`：`on/off/emit`（处理器异常隔离）
- FormDesigner 监听 `applyFormSchema` → `setRule(ensureRuleProps(enableCardDesignMode(rule)))`
- 抽屉在 form-designer 上下文收到 `generate_form_schema` 结果 → 派发动作并标记"已应用"
- 页面入口：请求上下文携带**用户菜单展平白名单**（`utils/menuIndex.ts`）；入口随 `message` 事件 `navigations` 返回（来源：`open_page` 工具结果，或模型未调用工具时按回复文本中的页面名兜底匹配）；渲染**文字 tag 链接**，点击 `router.push`（不自动跳转；已在目标页不跳转）
- 回复渲染：助手消息经 **Markdown** 渲染（`utils/markdown.ts` = `markdown-it(html:false)` + `DOMPurify` 消毒）；链接命中白名单 → `data-nav` 站内路由跳转，否则外链新窗口；用户消息保持纯文本

### 10.4 已知限制
- 对话最终回复为**非流式**（agent 含工具调用，暂不做 token 级流式）；前端以"正在处理…"占位
- 会话历史仅前端内存，不落库；刷新即失（符合当前需求）
- 本地小模型若不支持 tools，工具调用可能失败——DeepSeek/主流 OpenAI 兼容端点支持
