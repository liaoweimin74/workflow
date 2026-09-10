# message-channel-miniprogram Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: 微信小程序渠道实现
系统 SHALL 提供 WECHAT_MINIPROGRAM 渠道适配器实现 ChannelAdapter 接口，通过微信订阅消息 API 发送模板消息。

#### Scenario: 发送小程序订阅消息
- WHEN 消息通过 WECHAT_MINIPROGRAM 渠道发送
- THEN 适配器 SHALL 调用微信订阅消息 API，发送模板消息（含 page path 和 data 字段）

### Requirement: 小程序模板映射
系统 SHALL 支持将消息模板 code 映射到微信小程序模板 ID。

#### Scenario: 模板 ID 映射
- WHEN 消息使用 TASK_CREATED 模板通过小程序渠道发送
- THEN 适配器 SHALL 根据映射关系找到对应的小程序模板 ID，填充模板数据

