## Why

工作流平台当前无任何消息通知能力。PRD 3.7 仅设计了站内信+外部渠道预留接口，但完全未实现。用户需要一个完整的消息通知平台，支持多渠道发送、模板管理、订阅/退订、管理端配置，以及 Web 端完整的消息处理界面。

## What Changes

新增 `notification` Spring Modulith 模块，包含：
- 消息核心模型（消息、接收人、模板、订阅规则、重试）
- 消息分发引擎（站内信同步 + 外部渠道异步）
- 渠道 SPI 接口 + 三个适配器实现（短信、企业微信、微信小程序）
- 消息模板引擎（结构化 JSON，按渠道差异化渲染）
- 订阅规则引擎（用户级类型开关 + 管理员级场景规则）
- Web 前端模块（铃铛 + 消息中心 + 管理端页面）
- REST API（用户端 + 管理端 + 内部 API）

## Capabilities

### New Capabilities

1. **message-core** — 消息核心模型与持久化（消息实体、接收人、状态机、多租户）
2. **message-dispatch** — 消息分发引擎（事件监听、同步站内信、异步外部渠道、重试机制）
3. **message-template** — 消息模板引擎（模板 CRUD、变量渲染、多渠道差异化、租户级覆盖）
4. **message-subscription** — 订阅规则引擎（用户偏好、场景规则、紧急消息绕过）
5. **message-channel-spi** — 渠道 SPI 接口定义（ChannelAdapter 接口、渠道枚举、配置契约）
6. **message-channel-sms** — 短信渠道适配器
7. **message-channel-wechatwork** — 企业微信渠道适配器
8. **message-channel-miniprogram** — 微信小程序渠道适配器
9. **message-web** — Web 前端模块（铃铛组件、消息中心页面、消息详情、跳转逻辑）
10. **message-admin** — 管理端前端（模板管理、渠道配置、订阅规则、发送记录）
11. **message-api** — REST API（用户端消息接口、管理端配置接口、内部发送接口）

### Modified Capabilities

12. **notification-3.7** — PRD 3.7 通知需求升级为完整消息平台（原站内信设计被本模块完全替代）

## Impact

- **后端**：新增 `com.workflow.notification` 模块 + 三个渠道子模块，Flyway 新增 5+ 张表
- **前端**：新增 `src/modules/notification/` 目录，layouts 模块引入铃铛组件（唯一跨模块修改）
- **数据库**：新增 msg_message、msg_recipient、msg_template、msg_subscription_rule、msg_delivery_retry 等表
- **API**：新增 20+ REST 端点（用户端 + 管理端 + 内部）
- **依赖**：无新增外部依赖，使用现有 Spring Events + @Async + Redis（可选缓存）
