# message-dispatch Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: 事件驱动分发
系统 SHALL 通过 Spring ApplicationEvent 机制接收消息事件，由 MessageDispatcher 统一分发。

#### Scenario: 业务模块发布消息事件
- WHEN 业务模块调用 ApplicationEventPublisher.publishEvent(MessageEvent)
- THEN MessageDispatcher SHALL 监听该事件并启动分发流程

### Requirement: 站内信同步发送
系统 SHALL 将站内信（IN_APP 渠道）同步写入数据库，保证用户即时可见。

#### Scenario: 站内信即时投递
- WHEN 消息包含 IN_APP 渠道
- THEN 系统 SHALL 同步写入 msg_message 和 msg_recipient 表，不经过异步队列

### Requirement: 外部渠道异步发送
系统 SHALL 将外部渠道（SMS/WECHAT_WORK/WECHAT_MINIPROGRAM 等）通过 @Async 异步发送。

#### Scenario: 异步发送短信
- WHEN 消息包含 SMS 渠道
- THEN 系统 SHALL 在独立线程中调用短信渠道适配器，不阻塞主线程

### Requirement: 发送失败重试
系统 SHALL 提供重试表 `msg_delivery_retry`，记录外部渠道发送失败的投递记录。

#### Scenario: 渠道发送失败
- WHEN 外部渠道适配器返回发送失败
- THEN 系统 SHALL 将失败记录写入 msg_delivery_retry 表，retry_count 为 0，next_retry_at 为 1 分钟后

#### Scenario: 定时重试任务
- WHEN 定时任务扫描到 retry_count < 3 且 next_retry_at ≤ 当前时间的记录
- THEN 系统 SHALL 重新调用渠道适配器发送，成功则删除重试记录，失败则 retry_count+1，next_retry_at 按 1min/5min/30min 退避

#### Scenario: 重试次数耗尽
- WHEN 重试记录 retry_count 达到 3 次
- THEN 系统 SHALL 标记该投递为 FAILED，不再重试，管理端可手动重发

### Requirement: 渠道投递状态跟踪
系统 SHALL 在 msg_recipient 的 channel_delivery_status_json 中记录每个渠道的投递状态。

#### Scenario: 多渠道投递状态
- WHEN 消息同时通过 IN_APP 和 SMS 发送
- THEN channel_delivery_status_json SHALL 包含 {"IN_APP": "DELIVERED", "SMS": "PENDING"} 状态

