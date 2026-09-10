## ADDED Requirements

### Requirement: 模板实体模型
系统 SHALL 提供模板表 `msg_template`，包含：id、tenant_id、code（唯一标识）、name、category、content_json（结构化 JSON）、variables_json（变量声明）、status（ENABLED/DISABLED）、created_at。

#### Scenario: 创建消息模板
- WHEN 管理员创建模板 code 为 TASK_CREATED
- THEN 系统 SHALL 在 msg_template 表中创建记录，status 为 ENABLED

### Requirement: 结构化 JSON 模板
模板 content_json SHALL 按渠道 key 存储差异化内容，支持纯文本（SMS）、富文本（WECHAT_WORK）、带 path 的结构（WECHAT_MINIPROGRAM）。

#### Scenario: 渲染短信模板
- WHEN 使用 TASK_CREATED 模板通过 SMS 渠道发送
- THEN 系统 SHALL 渲染 content_json["SMS"] 中的变量，生成纯文本短信内容

#### Scenario: 渲染小程序模板
- WHEN 使用 TASK_CREATED 模板通过 WECHAT_MINIPROGRAM 渠道发送
- THEN 系统 SHALL 渲染 content_json["WECHAT_MINIPROGRAM"] 中的 path 和 content 变量

### Requirement: 模板变量校验
系统 SHALL 在发送时校验模板变量的必填性，缺少必填变量时 SHALL 抛出 BusinessException。

#### Scenario: 缺少必填变量
- WHEN 使用 TASK_CREATED 模板发送消息，但未提供 taskId 变量
- THEN 系统 SHALL 抛出 BusinessException，提示缺少必填变量 taskId

### Requirement: 租户级模板覆盖
系统 SHALL 支持同一 template_code 在不同租户下拥有不同的模板内容。

#### Scenario: 租户自定义模板
- WHEN 租户 A 创建 code 为 TASK_CREATED 的模板
- THEN 租户 A 的用户收到 TASK_CREATED 消息时 SHALL 使用租户 A 的模板内容，而非全局默认模板

### Requirement: 模板 linkTemplate
模板 SHALL 包含 linkTemplate 字段，定义消息跳转逻辑，包含 type（INTERNAL/WORKFLOW_INSTANCE/EXTERNAL/DEEPLINK）和对应的 url/deeplink 模板。

#### Scenario: 流程实例跳转
- WHEN 消息的 linkTemplate.type 为 WORKFLOW_INSTANCE
- THEN 前端 SHALL 渲染跳转按钮，点击后路由到 /process/${instanceId}
