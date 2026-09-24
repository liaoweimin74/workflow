# ai-infrastructure Specification

## Purpose
TBD - created by archiving change ai-foundation-form-gen. Update Purpose after archive.
## Requirements
### Requirement: AI 配置与启用开关

系统 SHALL 提供 `workflow.ai` 配置前缀，包含 `enabled`、`base-url`、`api-key`、`model`、`temperature`、`max-tokens`、连接/读超时等配置项。`enabled` 默认 MUST 为 `false`。当 `enabled=false` 或 `api-key` 为空时，系统 SHALL 不装配 `ChatModel` bean，且所有 AI 端点 SHALL 返回 503 与中文提示"AI 服务未配置"。AI 端点 SHALL 仅允许已登录用户访问。

#### Scenario: 未配置时 AI 服务不可用

- **WHEN** `workflow.ai.enabled=false`（默认）或 `api-key` 为空
- **THEN** `ChatModel` bean 不存在
- **AND** 调用 AI 端点返回 503，`msg` 为"AI 服务未配置"

#### Scenario: 配置后启用

- **WHEN** `workflow.ai.enabled=true` 且 `api-key` 非空
- **THEN** `ChatModel` bean 正常装配
- **AND** AI 端点可正常调用

---

### Requirement: 模型供应商抽象

系统 SHALL 提供 `ChatModel` 接口，暴露非流式 `complete` 与流式 `completeStream` 两个方法。系统 SHALL 提供基于 OpenAI 兼容协议（`/chat/completions`）的实现，支持通过配置切换任意兼容端点（DeepSeek、通义千问、Qwen、Ollama 等）。消息模型 SHALL 支持 `system`、`user`、`assistant` 三种角色。

#### Scenario: 通过配置切换供应商

- **WHEN** 修改 `workflow.ai.base-url` 指向任一 OpenAI 兼容端点
- **THEN** 无需改代码，`ChatModel` 即调用新端点

#### Scenario: 三种角色消息

- **WHEN** 调用方传入 system/user/assistant 混合消息序列
- **THEN** 请求体 `messages` 按角色顺序原样透传

---

### Requirement: 非流式调用

`ChatModel.complete` SHALL 返回模型输出的完整 assistant 文本内容。当响应 `choices` 为空时，SHALL 抛出 `AiException`（`EMPTY_RESPONSE`）。HTTP 非 2xx 时 SHALL 抛出 `AiException`（`HTTP_ERROR`，携带状态码）。连接失败/读超时 SHALL 抛出 `AiException`（`CONNECT_FAILED`/`TIMEOUT`）。

#### Scenario: 正常非流式响应

- **WHEN** 调用 `complete` 且模型正常返回
- **THEN** 返回 `choices[0].message.content` 文本

#### Scenario: 空 choices

- **WHEN** 模型响应 `choices` 数组为空
- **THEN** 抛出 `AiException.EMPTY_RESPONSE`

#### Scenario: HTTP 错误

- **WHEN** 供应商返回 401/429/500 等非 2xx
- **THEN** 抛出 `AiException.HTTP_ERROR` 且携带状态码
- **AND** 对 429/5xx 自动重试 1 次（指数退避）后再失败

---

### Requirement: 流式调用

`ChatModel.completeStream` SHALL 通过 SSE 逐块回调文本增量。系统 SHALL 解析 `data: {...}` 行并提取 `choices[0].delta.content`，非空即回调 onDelta。遇 `data: [DONE]` 时 SHALL 回调 onDone。遇到无法解析的行 SHALL 跳过并继续。流式过程中发生连接失败/超时 SHALL 回调 onError。流式模式 SHALL 不自动重试。

#### Scenario: 正常流式输出

- **WHEN** 供应商按 SSE 协议返回多块 delta
- **THEN** onDelta 按序回调每个非空增量
- **AND** 收到 `data: [DONE]` 后回调 onDone

#### Scenario: 夹带异常行

- **WHEN** SSE 流中夹带非 `data:` 行或 JSON 无法解析的行
- **THEN** 跳过该行继续解析后续块
- **AND** 完整输出不受影响

#### Scenario: 流式中断

- **WHEN** 流在 `[DONE]` 前连接断开或超时
- **THEN** 回调 onError（`STREAM_ERROR`/`TIMEOUT`）
- **AND** 不回调 onDone

---

### Requirement: JSON 结构化输出

系统 SHALL 支持请求 `response_format: {"type":"json_object"}`，使模型输出符合 JSON 结构，供结构化场景（如表单 schema 生成）使用。`ChatOptions` SHALL 允许调用方指定是否启用 JSON 模式。

#### Scenario: 启用 JSON 模式

- **WHEN** 调用方设置 `responseFormat` 为 JSON 对象模式
- **THEN** 请求体携带 `response_format: {"type":"json_object"}`
- **AND** 返回内容为模型生成的 JSON 文本

---

### Requirement: 调用审计

系统 SHALL 记录每次 AI 调用日志，包含模块标识、模型、输入/输出 token 数、耗时与是否成功，以 `log.info` 输出。审计 SHALL 不阻塞主流程（记录失败不抛出异常）。

#### Scenario: 记录成功调用

- **WHEN** 一次非流式或流式调用正常完成
- **THEN** 输出包含 module/model/tokens/耗时的 info 日志

#### Scenario: 记录失败调用

- **WHEN** 调用失败（超时/HTTP 错误等）
- **THEN** 输出包含错误信息的 warn 日志
- **AND** 不额外抛出异常

