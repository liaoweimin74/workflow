# message-admin Specification

## Purpose
TBD - created by archiving change message-center. Update Purpose after archive.
## Requirements
### Requirement: 模板管理页面
系统 SHALL 提供模板管理页面（/admin/notification/templates），支持模板列表、创建、编辑、启用/停用、复制、删除。

#### Scenario: 模板列表
- WHEN 管理员进入模板管理页面
- THEN SHALL 以 SearchTable 展示模板列表，包含编码、名称、分类、状态、操作列

#### Scenario: 模板编辑器
- WHEN 管理员点击编辑模板
- THEN SHALL 打开模板编辑器，支持 JSON 模板编辑 + 变量预览 + 多渠道预览

### Requirement: 渠道管理页面
系统 SHALL 提供渠道管理页面（/admin/notification/channels），展示已注册渠道列表，支持渠道配置、启用/停用、健康检查。

#### Scenario: 渠道配置
- WHEN 管理员点击 SMS 渠道的配置按钮
- THEN SHALL 打开短信渠道配置页，可编辑 api_key、api_secret、sign_name 等参数

#### Scenario: 渠道健康检查
- WHEN 管理员查看渠道管理页面
- THEN SHALL 显示每个渠道的启用状态、最近24小时发送成功率、平均响应时间

### Requirement: 订阅规则管理页面
系统 SHALL 提供订阅规则管理页面（/admin/notification/subscriptions），支持规则的增删改查和优先级排序。

#### Scenario: 创建场景规则
- WHEN 管理员创建规则"财务流程催办强制发短信"
- THEN SHALL 配置适用范围（流程=财务）、消息类型（催办）、渠道（SMS）、状态

### Requirement: 发送记录页面
系统 SHALL 提供发送记录页面（/admin/notification/deliveries），支持按时间/渠道/状态/接收人筛选，失败记录高亮，手动重发。

#### Scenario: 手动重发
- WHEN 管理员点击一条 FAILED 状态的发送记录的"重发"按钮
- THEN 系统 SHALL 重新触发该消息的发送流程

#### Scenario: 统计图表
- WHEN 管理员进入发送记录页面
- THEN SHALL 展示发送量趋势图、成功率图、渠道分布图

