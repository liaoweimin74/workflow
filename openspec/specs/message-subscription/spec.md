# message-subscription Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: 用户级订阅偏好
系统 SHALL 提供用户订阅偏好表，支持用户按消息类型设置接收/不接收。

#### Scenario: 用户关闭催办提醒
- WHEN 用户在消息中心关闭"催办提醒"类型的消息接收
- THEN 该用户后续 SHALL 不再收到催办类型的消息（紧急消息除外）

#### Scenario: 系统公告不可退订
- WHEN 用户尝试关闭"系统公告"类型的接收
- THEN 系统 SHALL 拒绝该操作，提示系统公告不可退订

### Requirement: 管理员级场景规则
系统 SHALL 提供订阅规则表 `msg_subscription_rule`，支持管理员配置场景级规则（适用范围×消息类型×渠道）。

#### Scenario: 场景规则覆盖用户偏好
- WHEN 用户关闭了催办提醒接收，但管理员配置了"财务流程催办强制发短信"的场景规则
- THEN 该用户在财务流程中的催办消息 SHALL 仍然通过短信发送

### Requirement: 紧急消息绕过订阅
优先级为 URGENT 的消息 SHALL 绕过所有订阅设置，强制发送到所有渠道。

#### Scenario: 紧急消息强制发送
- WHEN 用户关闭了所有消息类型的接收，但收到一条 URGENT 优先级的消息
- THEN 系统 SHALL 忽略用户订阅设置，强制发送该消息

### Requirement: 用户间通信始终发送
用户间通信（PRIVATE 类型）的消息 SHALL 始终发送，不受订阅设置影响。

#### Scenario: 私人消息不受订阅影响
- WHEN 用户 A 关闭了所有消息类型的接收，但用户 B 向其发送私人消息
- THEN 用户 A SHALL 仍然收到该私人消息

