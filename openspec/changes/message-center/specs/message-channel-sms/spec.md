## ADDED Requirements

### Requirement: 短信渠道实现
系统 SHALL 提供 SMS 渠道适配器实现 ChannelAdapter 接口，通过 HTTP API 调用短信服务商发送短信。

#### Scenario: 发送短信通知
- WHEN 消息通过 SMS 渠道发送
- THEN 适配器 SHALL 调用短信服务商 API，发送纯文本短信内容

### Requirement: 短信模板变量渲染
短信内容 SHALL 支持变量替换，变量格式为 ${variableName}。

#### Scenario: 渲染短信变量
- WHEN 短信模板内容为"您有新待办：${taskName}"
- THEN 发送时 SHALL 将 ${taskName} 替换为实际任务名称

### Requirement: 短信发送失败处理
短信发送失败时 SHALL 返回错误信息，由 dispatch 模块写入重试表。

#### Scenario: 短信 API 超时
- WHEN 短信服务商 API 响应超时
- THEN 适配器 SHALL 返回失败结果，error 信息包含超时原因
