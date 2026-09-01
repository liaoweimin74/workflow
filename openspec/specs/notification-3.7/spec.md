# notification-3.7 Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: PRD 3.7 通知需求升级
PRD 3.7 原设计的站内信通知中心和外部通知渠道接口预留，MUST be completely replaced by this message notification module.

**变更内容**：
- 原"站内信查询、已读" → 升级为完整的站内信消息中心（铃铛 + 独立页面 + 批量操作）
- 原"预留外部通知渠道接口（邮件、企微、钉钉等）" → 升级为完整的渠道 SPI + 三个适配器实现（SMS、企微、小程序）
- 原"通知模板可配置" → 升级为结构化 JSON 模板引擎 + 多渠道差异化渲染
- 原"通知场景：新任务、催办、超时、超时升级、审批结果、加签" → 保持不变，由 engine 模块发布对应 MessageEvent

**迁移策略**：
- 新模块实现后，PRD 3.7 的 API 分组中"通知"行将被替换为新模块的 API
- 无需数据迁移（原模块未实现，无存量数据）

#### Scenario: PRD 3.7 notification capability is replaced
- **WHEN** the notification module is deployed
- **THEN** the notification API group SHALL use the message center, channel SPI, template engine, and event-driven delivery behavior described by this change

