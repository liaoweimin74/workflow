# ai-form-generation Specification

## Purpose

提供表单设计器的 AI 生成能力：用户以自然语言描述业务表单，系统经 prompt 工程生成 form-create rule JSON schema，经校验清洗后流式回传前端，设计者可一键回填画布继续拖拽编辑。作为 AI 基础设施层的首个消费场景。

## ADDED Requirements

### Requirement: AI 表单生成流式端点

系统 SHALL 提供 `POST /api/v1/ai/forms/generate`，接收 `{"description": string}`。description 为空时 SHALL 返回 400。成功时 SHALL 以 SSE 事件流返回：`meta`（含 taskId、model）→ 若干 `chunk`（schema JSON 文本增量）→ `done`（含完整 schema、字段清单、warnings）。失败时 SHALL 发送 `error` 事件（含 code、msg）。AI 未配置时 SHALL 发送 `error` 事件且 msg 为"AI 服务未配置"。

#### Scenario: 正常生成流程

- **WHEN** 用户提交非空描述且 AI 已配置
- **THEN** 先收到 `meta` 事件
- **AND** 随后收到若干 `chunk` 事件，拼接后为合法 JSON
- **AND** 最终收到 `done` 事件，含完整 schema 与字段清单

#### Scenario: 空描述

- **WHEN** description 为空或仅空白字符
- **THEN** 返回 400 中文提示

#### Scenario: 未配置 AI

- **WHEN** `workflow.ai.enabled=false`
- **THEN** SSE 发送 `error` 事件，msg 为"AI 服务未配置"

#### Scenario: 模型调用失败

- **WHEN** 供应商连接失败/超时/HTTP 错误
- **THEN** SSE 发送 `error` 事件并携带错误 code
- **AND** 流正常结束（不悬挂）

---

### Requirement: AI 表单生成同步端点

系统 SHALL 提供 `POST /api/v1/ai/forms/generate/sync`，语义与流式端点相同，但 SHALL 一次性返回 `R<AiFormGenerateResult>`。`AiFormGenerateResult` SHALL 包含 `schema`（JSON 字符串）、`fields`（FieldInfo 列表：field/title/componentType）、`warnings`（修正项说明列表）。AI 未配置时 SHALL 返回 503，`msg` 为"AI 服务未配置"。

#### Scenario: 同步生成成功

- **WHEN** 调用 `/sync` 且 AI 已配置
- **THEN** 返回 `code=0` 的 `R`，`data.schema` 为可解析的 form-create rule JSON
- **AND** `data.fields` 列出全部生成字段

#### Scenario: 同步未配置

- **WHEN** 调用 `/sync` 且 AI 未配置
- **THEN** 返回 503，`msg` 为"AI 服务未配置"

---

### Requirement: Prompt 工程约束

系统 SHALL 使用固定 system prompt 约束模型输出，包含：严格 JSON 输出（`{"rule":[...]}`）；组件类型白名单（input、inputTextarea、inputNumber、select、checkbox、radio、date、datetime、time、dateRange、switch、editor、rate、divider、groupContainer）；字段命名规范 `field` 为 snake_case 英文且匹配 `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`；`title` 为中文标签；`select/radio/checkbox` 必须携带 `options`；必填字段携带 `validate` 规则；至少一条 few-shot 示例。用户描述 SHALL 仅作为 user message 传入，不拼接进 system prompt。

#### Scenario: 生成结果受白名单约束

- **WHEN** 描述中包含可枚举选项（如"性别"）或数值、日期等语义
- **THEN** 生成的组件类型落在白名单内（枚举→select/radio、数值→inputNumber、日期→date）
- **AND** select/radio/checkbox 均带 options

#### Scenario: 描述作为 user message

- **WHEN** 用户描述含特殊指令性内容
- **THEN** 该内容仅出现在 user message
- **AND** system prompt 保持不变

---

### Requirement: 输出校验与清洗

系统 SHALL 对模型输出执行防御性校验与清洗：输出必须可解析为 JSON 且 `rule` 为数组，否则 SHALL 返回错误；组件类型不在白名单时 SHALL 降级为 `input` 并记入 warnings；`field` 不匹配命名规范时 SHALL 自动修正（转 snake_case）或跳过并记入 warnings；`field` 重复时 SHALL 追加后缀去重并记入 warnings；`title` 缺失时 SHALL 回填为 `field`。最终 schema SHALL 序列化为 `{"rule":[...]}` 结构。所有修正项 SHALL 汇总进 `warnings` 返回前端。

#### Scenario: 非法组件类型降级

- **WHEN** 模型输出含白名单外组件类型
- **THEN** 该字段降级为 `input`
- **AND** `warnings` 记录该修正

#### Scenario: 非法字段名修正

- **WHEN** 模型输出 `field` 含非法字符（如中文、空格、连字符）
- **THEN** 字段名被修正为合法 snake_case
- **AND** `warnings` 记录该修正

#### Scenario: 重复字段去重

- **WHEN** 模型输出两个相同 `field`
- **THEN** 后出现者追加 `_2` 后缀
- **AND** `warnings` 记录该修正

#### Scenario: 非 JSON 输出

- **WHEN** 模型输出无法解析为 JSON 且无法提取规则
- **THEN** 返回错误（同步 500 / SSE `error` 事件）
- **AND** 前端提示重新生成

---

### Requirement: 前端入口与画布回填

表单设计器工具栏 SHALL 提供"AI 生成"入口。点击后 SHALL 打开生成弹窗：描述输入（必填校验）、生成/取消/重试操作、流式 JSON 预览、字段清单与 warnings 展示、生成完成前禁用"应用到设计器"。点击"应用到设计器"后 SHALL 将生成 schema 的 `rule` 回填设计器画布（复用现有 setRule 链路），用户可继续拖拽编辑。模型失败或未配置 SHALL 在弹窗内展示错误并可重试。

#### Scenario: 生成并回填画布

- **WHEN** 用户在弹窗输入描述并生成成功
- **THEN** 预览区展示流式 JSON 与字段清单
- **AND** 点击"应用到设计器"后画布呈现生成的表单字段
- **AND** 用户可继续拖拽编辑

#### Scenario: 空描述拦截

- **WHEN** 描述为空时点击"生成"
- **THEN** 弹窗内提示必填
- **AND** 不发起请求

#### Scenario: 失败可重试

- **WHEN** 生成失败（模型错误/未配置/网络中断）
- **THEN** 弹窗内展示错误信息
- **AND** 提供重试按钮
- **AND** "应用到设计器"保持禁用
