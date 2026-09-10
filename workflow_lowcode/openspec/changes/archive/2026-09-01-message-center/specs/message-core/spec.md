## ADDED Requirements

### Requirement: 消息实体模型
系统 SHALL 提供消息主表 `msg_message`，包含以下字段：id、tenant_id、template_code、sender_id、sender_type、title、content（JSON）、link_json（JSON）、priority（ENUM: LOW/NORMAL/HIGH/URGENT）、category（ENUM: WORKFLOW/SYSTEM/USER/EXTERNAL）、message_type（ENUM: PUBLIC/PRIVATE）、status（ENUM: DRAFT/SENT/FAILED）、created_at。

#### Scenario: 创建工作流消息
- WHEN 业务模块通过 MessageEvent 发送一条工作流消息
- THEN 系统 SHALL 在 msg_message 表中创建记录，status 为 SENT，category 为 WORKFLOW

#### Scenario: 创建系统公告
- WHEN 管理员通过管理端创建系统公告
- THEN 系统 SHALL 在 msg_message 表中创建记录，message_type 为 PUBLIC，category 为 SYSTEM

### Requirement: 消息接收人模型
系统 SHALL 提供接收人表 `msg_recipient`，包含以下字段：id、message_id、user_id、read_status（ENUM: UNREAD/READ）、read_at、channel_delivery_status_json（JSON，记录各渠道投递状态）。

#### Scenario: 私人消息指定接收人
- WHEN 发送一条私人消息给用户 A 和用户 B
- THEN 系统 SHALL 为每个接收人创建一条 msg_recipient 记录，read_status 初始为 UNREAD

#### Scenario: 公共消息广播
- WHEN 发送一条公共消息
- THEN 系统 SHALL 为所有目标用户创建 msg_recipient 记录

### Requirement: 消息状态管理
系统 SHALL 支持消息状态流转：DRAFT → SENT → FAILED（仅外部渠道失败时）。

#### Scenario: 标记消息已读
- WHEN 用户调用已读接口
- THEN 系统 SHALL 将对应 msg_recipient 的 read_status 更新为 READ，read_at 设为当前时间

#### Scenario: 批量标记已读
- WHEN 用户调用全部已读接口
- THEN 系统 SHALL 将该用户所有 UNREAD 的 msg_recipient 更新为 READ

### Requirement: 多租户隔离
系统 SHALL 确保不同租户的消息数据完全隔离，查询和操作 MUST 基于 tenant_id 过滤。

#### Scenario: 租户 A 查询消息
- WHEN 租户 A 的用户查询消息列表
- THEN 系统 SHALL 仅返回 tenant_id 匹配租户 A 的消息

### Requirement: 消息删除
系统 SHALL 支持用户删除自己的消息（软删除或物理删除）。

#### Scenario: 用户删除消息
- WHEN 用户删除一条消息
- THEN 系统 SHALL 仅允许删除该用户作为接收人的消息记录
