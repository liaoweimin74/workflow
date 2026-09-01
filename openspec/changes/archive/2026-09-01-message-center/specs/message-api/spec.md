## ADDED Requirements

### Requirement: 用户端消息 API
系统 SHALL 提供以下用户端 REST API：
- GET /api/v1/notifications — 消息列表（分页、筛选）
- GET /api/v1/notifications/{id} — 消息详情
- PUT /api/v1/notifications/{id}/read — 标记已读
- POST /api/v1/notifications/read-all — 全部已读
- DELETE /api/v1/notifications/{id} — 删除消息
- GET /api/v1/notifications/unread-count — 未读数量
- POST /api/v1/notifications/send — 用户间通信发送

#### Scenario: 获取未读数
- WHEN 用户调用 GET /api/v1/notifications/unread-count
- THEN 系统 SHALL 返回该用户当前未读消息数量

#### Scenario: 用户间通信
- WHEN 用户 A 调用 POST /api/v1/notifications/send 发送消息给用户 B
- THEN 系统 SHALL 创建消息并投递到用户 B 的收件箱

### Requirement: 管理端 API
系统 SHALL 提供以下管理端 REST API：
- GET/POST/PUT /api/v1/admin/notification/templates — 模板 CRUD
- POST /api/v1/admin/notification/templates/{id}/toggle — 启用/停用
- GET/PUT /api/v1/admin/notification/channels — 渠道列表/配置
- POST /api/v1/admin/notification/channels/{id}/test — 测试渠道连通性
- GET/POST/PUT /api/v1/admin/notification/subscriptions — 订阅规则
- GET /api/v1/admin/notification/deliveries — 发送记录
- POST /api/v1/admin/notification/deliveries/{id}/retry — 手动重发

#### Scenario: 测试渠道连通性
- WHEN 管理员调用 POST /api/v1/admin/notification/channels/{id}/test
- THEN 系统 SHALL 向该渠道发送测试消息，返回发送结果

### Requirement: 内部 API
系统 SHALL 提供内部 API POST /api/v1/internal/notifications/send，供其他模块调用发送消息。

#### Scenario: 内部模块调用
- WHEN engine 模块需要发送通知
- THEN SHALL 通过 ApplicationEvent 发布事件，由 notification 模块监听处理（推荐方式）
- 或直接调用内部 API（备选方式）

### Requirement: 权限控制
用户端 API SHALL 仅允许用户操作自己的消息。管理端 API SHALL 需要 ADMIN 或 NOTIFICATION_MANAGER 角色。内部 API SHALL 仅限服务间调用。

#### Scenario: 用户越权访问
- WHEN 用户 A 尝试读取用户 B 的消息
- THEN 系统 SHALL 返回 403 Forbidden
