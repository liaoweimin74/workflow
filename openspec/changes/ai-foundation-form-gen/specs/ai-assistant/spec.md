# ai-assistant Specification

## Purpose

为平台提供**统一的 AI 助手入口**：全站右下角悬浮球 + 对话抽屉。用户通过自然语言对话完成平台内的 AI 能力（当前为表单生成，后续可扩展），助手通过工具调用完成任务，并按当前页面上下文把结果派发给宿主页。取代「每个功能各挂一个 AI 入口」的分散形态。

## ADDED Requirements

### Requirement: 全局悬浮球入口

系统 SHALL 在应用根部（`App.vue`）挂载全局 AI 助手悬浮球，固定于视口右下角，覆盖含全屏路由（流程/表单/页面设计器）在内的所有页面。悬浮球 SHALL 在登录页不显示。默认状态 SHALL 为显示。

#### Scenario: 任意页面可见

- **WHEN** 用户处于除登录页外的任意页面（含全屏设计器页）
- **THEN** 右下角显示 AI 助手悬浮球

#### Scenario: 登录页不显示

- **WHEN** 用户处于登录页
- **THEN** 不显示悬浮球

---

### Requirement: 顶部工具栏显隐开关

主界面顶部工具栏 SHALL 提供 AI 助手显示/隐藏开关，默认开启。切换 SHALL 立即生效并持久化到 `localStorage`，刷新后保持。

#### Scenario: 关闭后隐藏并持久化

- **WHEN** 用户点击顶部工具栏的 AI 助手开关关闭
- **THEN** 悬浮球隐藏
- **AND** 刷新页面后仍为隐藏

#### Scenario: 默认开启

- **WHEN** 用户首次进入（未存过偏好）
- **THEN** 悬浮球默认显示

---

### Requirement: 对话窗体与历史

悬浮球点击后 SHALL 打开**完全悬浮的对话窗体**（固定浮层，非侧边抽屉），再次点击悬浮球 SHALL 收起。窗体 SHALL 保留多轮对话历史（前端会话内维护，不上后端、不落库），并 SHALL 提供「清空对话」按钮供用户手动清理。清空 SHALL 移除全部历史消息。

#### Scenario: 点击悬浮球打开悬浮窗体

- **WHEN** 用户点击右下角悬浮球
- **THEN** 打开悬浮于页面之上的对话窗体
- **AND** 再次点击悬浮球收起

#### Scenario: 多轮历史保留

- **WHEN** 用户先请求"生成请假单"，再请求"把日期字段改成必填"
- **THEN** 窗体展示完整历史
- **AND** 后续请求携带历史供助手理解指代

#### Scenario: 手动清空

- **WHEN** 用户点击"清空对话"
- **THEN** 历史消息全部移除

---

### Requirement: 页面上下文注册

页面 SHALL 能向助手注册当前上下文（如路由标识、表单 id）。表单设计器 SHALL 在挂载时注册 `{route:'form-designer', formId}`，卸载时清除。助手请求 SHALL 携带当前上下文。

#### Scenario: 表单设计器注册上下文

- **WHEN** 用户打开表单设计器
- **THEN** 助手上下文包含 `route=form-designer` 与当前 `formId`
- **AND** 离开设计器后上下文被清除

---

### Requirement: 对话端点与事件流

系统 SHALL 提供 `POST /api/v1/ai/chat`，请求体包含 `message`、`history`、`context`。message 为空时 SHALL 返回 400。端点 SHALL 以 SSE 返回事件：`meta` →（`tool_call` → `tool_result`）* → `message` → `done`；失败时 SHALL 返回 `error` 事件。AI 未配置时 SHALL 返回 `error` 事件，msg 为"AI 服务未配置"。端点 SHALL 仅允许已登录用户访问。

#### Scenario: 正常对话

- **WHEN** 用户发送非空消息且 AI 已配置
- **THEN** 依次收到 meta、可能的 tool_call/tool_result、message、done 事件

#### Scenario: 空消息

- **WHEN** message 为空或仅空白
- **THEN** 返回 400

#### Scenario: 未配置 AI

- **WHEN** `workflow.ai.enabled=false` 或 api-key 为空
- **THEN** SSE 返回 `error` 事件，msg 为"AI 服务未配置"

---

### Requirement: 工具路由与执行

助手 SHALL 基于工具（function calling）完成能力调用：后端 SHALL 提供工具注册表汇总所有工具，并在每轮对话把工具声明发给模型、按模型返回的 tool_calls 执行工具、把结果回填后继续对话，直至模型给出最终回复或达到最大步数。工具执行异常 SHALL 返回错误 JSON 而不中断对话。系统 SHALL 至少注册 `generate_form_schema` 工具。

#### Scenario: 模型请求工具

- **WHEN** 模型返回 tool_calls
- **THEN** 系统执行对应工具并回填 tool 消息后继续对话
- **AND** 最终给出文本回复

#### Scenario: 未知工具或工具异常

- **WHEN** 模型请求未注册工具或工具执行抛异常
- **THEN** 返回错误 JSON 作为工具结果，对话继续
- **AND** 不抛出中断

#### Scenario: 达到最大步数

- **WHEN** 工具调用循环超过最大步数
- **THEN** 助手回复提示需求过大、请拆分

---

### Requirement: 结果动作派发

助手产出结果后 SHALL 通过动作总线请求宿主页执行动作。系统 SHALL 提供动作总线（注册/注销/派发）。表单生成工具结果 SHALL 在上下文为表单设计器时派发 `applyFormSchema` 动作，由设计器回填画布，并在助手消息中标记"已应用到当前表单"；非表单设计器上下文 SHALL 不派发，提示结果已生成。动作处理器异常 SHALL 不影响其他处理器。

#### Scenario: 上下文绑定自动回填

- **WHEN** 上下文为表单设计器且工具结果为表单 schema
- **THEN** 派发 `applyFormSchema` 动作
- **AND** 设计器回填画布
- **AND** 助手消息标记已应用

#### Scenario: 非设计器上下文不派发

- **WHEN** 上下文不是表单设计器
- **THEN** 不派发动作
- **AND** 助手提示已生成、可到设计器应用

#### Scenario: 处理器异常隔离

- **WHEN** 某动作处理器抛异常
- **THEN** 其他处理器仍正常执行

---

### Requirement: 页面跳转入口

助手 SHALL 能在回复中提供可点击的页面入口，**但 SHALL NOT 自动跳转**——仅当用户点击入口时才经由前端路由跳转。助手 SHALL NOT 声称"已为你打开/已跳转"某页面（其无法替用户打开页面）。

入口 SHALL 随 `message` 事件以 `navigations` 列表返回（每项含 `path`、`label`），来源为二者之一：
1. `open_page` 工具结果（模型主动提供）；或
2. 当模型未调用该工具时，按**回复文本中出现的页面名**从当前用户页面白名单匹配（最多 3 个）。

`path` SHALL 仅接受当前用户可访问页面白名单（由客户端随请求提供的菜单树展平结果，含全部菜单），不接受任意 URL。入口 SHALL 以**文字 tag 链接**渲染。

#### Scenario: 提供页面入口并跳转

- **WHEN** 助手回答涉及某页面（如"怎么添加用户"→用户管理）
- **THEN** 回复携带 `navigations`，展示可点击的文字 tag 入口
- **AND** 点击后路由跳转到该页面

#### Scenario: 不自动跳转

- **WHEN** 助手返回了页面入口
- **THEN** 页面不发生自动跳转
- **AND** 仅当用户点击入口时才跳转

#### Scenario: 模型未调用工具时的兜底

- **WHEN** 模型未调用 open_page，但回复文本中出现了白名单中的页面名
- **THEN** 按文本匹配补全对应入口

#### Scenario: 非白名单路径被拒绝

- **WHEN** 模型给出不在白名单中的 path（如外部 URL）
- **THEN** 工具返回错误
- **AND** 不产生跳转入口

#### Scenario: 已在目标页

- **WHEN** 用户点击的入口正是当前所在页面
- **THEN** 不重复跳转，仅提示
