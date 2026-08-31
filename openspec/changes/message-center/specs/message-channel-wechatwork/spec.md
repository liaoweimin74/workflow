## ADDED Requirements

### Requirement: 企业微信渠道实现
系统 SHALL 提供 WECHAT_WORK 渠道适配器实现 ChannelAdapter 接口，通过企业微信 API 发送消息。

#### Scenario: 发送企业微信通知
- WHEN 消息通过 WECHAT_WORK 渠道发送
- THEN 适配器 SHALL 调用企业微信应用消息 API，支持 text/markdown 类型消息

### Requirement: 企业微信应用配置
系统 SHALL 支持配置企业微信 corp_id、corp_secret、agent_id 等参数。

#### Scenario: 加载企微配置
- WHEN 系统启动时
- THEN 适配器 SHALL 从配置文件加载企业微信相关参数，获取 access_token
