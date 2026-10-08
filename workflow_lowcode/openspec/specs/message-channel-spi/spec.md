# message-channel-spi Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: ChannelAdapter 接口
系统 SHALL 定义 ChannelAdapter SPI 接口，包含以下方法：send(ChannelMessage) → ChannelDeliveryResult、getChannelType() → ChannelType、isAvailable() → boolean。

#### Scenario: 实现渠道适配器
- WHEN 开发者创建新的渠道适配器类实现 ChannelAdapter 接口
- THEN Spring 容器 SHALL 自动发现并注册该适配器，无需修改核心代码

### Requirement: 渠道枚举
系统 SHALL 定义 ChannelType 枚举：IN_APP、SMS、WECHAT_WORK、WECHAT_MINIPROGRAM、APP。

#### Scenario: 使用渠道枚举
- WHEN 业务代码指定消息发送渠道
- THEN SHALL 使用 ChannelType 枚举值，不使用字符串

### Requirement: 渠道配置契约
每个渠道适配器 SHALL 声明自己的配置类，通过 @ConfigurationProperties 或类似机制加载。

#### Scenario: 短信渠道配置
- WHEN 系统启动时
- THEN SMS 渠道适配器 SHALL 从配置文件中加载 api_key、api_secret、sign_name 等配置

### Requirement: 渠道健康检查
系统 SHALL 提供渠道健康检查接口，返回最近发送成功率和平均延迟。

#### Scenario: 检查渠道状态
- WHEN 管理员查看渠道管理页面
- THEN 系统 SHALL 显示每个渠道的启用状态、最近24小时发送成功率、平均响应时间

### Requirement: 渠道优先级排序
系统 SHALL 支持配置多渠道同时发送时的优先级排序。

#### Scenario: 多渠道优先级
- WHEN 消息同时指定 SMS 和 WECHAT_WORK 渠道
- THEN 系统 SHALL 按优先级顺序依次发送，高优先级失败不影响低优先级发送

