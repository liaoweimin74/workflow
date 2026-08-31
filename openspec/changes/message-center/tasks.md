## 1. P1：核心模型与站内信

- [x] 1.1 创建 notification 模块骨架：package-info.java、模块目录结构（model/template/subscription/dispatch/channel/store/retry/admin）
- [x] 1.2 创建 msg_message 表 Flyway 迁移脚本（id, tenant_id, template_code, sender_id, sender_type, title, content JSON, link_json, priority, category, message_type, status, created_at）
- [x] 1.3 创建 msg_recipient 表 Flyway 迁移脚本（id, message_id, user_id, read_status, read_at, channel_delivery_status_json）
- [x] 1.4 实现 Message 实体、Recipient 实体、JPA Repository
- [x] 1.5 实现 MessageService：发送消息、查询列表（分页筛选）、查询详情、标记已读、批量已读、删除、未读计数
- [x] 1.6 实现 MessageEvent 事件类和 MessageDispatcher 分发器（站内信同步写入）
- [x] 1.7 实现 ChannelAdapter SPI 接口、ChannelType 枚举、ChannelDeliveryResult 返回类
- [x] 1.8 实现 IN_APP 渠道适配器（站内信，同步写入即完成）
- [x] 1.9 实现 REST API：用户端消息接口（7个端点）
- [x] 1.10 创建 msg_delivery_retry 表 Flyway 迁移脚本（id, message_id, channel, retry_count, next_retry_at, last_error, status）
- [x] 1.11 实现异步重试机制：@Async 异步发送 + RetryTask 定时任务（3级退避：1min/5min/30min，最多3次）
- [x] 1.12 后端单元测试：MessageService、MessageDispatcher、RetryTask

## 2. P1：Web 前端 - 铃铛与消息中心

- [x] 2.1 创建 src/modules/notification/ 前端模块骨架：api/、stores/、types/、router/、index.ts
- [x] 2.2 定义 TypeScript 类型：Message、MessageFilter、MessageTemplate、SubscriptionRule 等
- [x] 2.3 实现 notification API 封装层（调用后端用户端 API）
- [x] 2.4 实现 Pinia store：useNotificationStore（消息列表、未读数、已读操作）
- [x] 2.5 实现 NotificationBell 全局铃铛组件（未读数徽章 + 下拉面板 + 最近5条消息）
- [x] 2.6 在 layouts 中引入 NotificationBell 组件（唯一跨模块修改）
- [x] 2.7 实现 MessageCenter 消息中心页面（三栏布局：分类筛选 + 消息列表 + 消息详情）
- [x] 2.8 实现 MessageList 组件（复用 SearchTable，分页、筛选、批量操作）
- [x] 2.9 实现消息跳转逻辑（根据 linkTemplate.type 决定路由方式）
- [x] 2.10 注册前端路由（/messages 消息中心页面）
- [x] 2.11 前端单元测试：NotificationBell、MessageCenter、消息跳转逻辑

## 3. P2：模板引擎与订阅模型

- [x] 3.1 创建 msg_template 表 Flyway 迁移脚本（id, tenant_id, code, name, category, content_json, variables_json, status, created_at）
- [x] 3.2 实现 MessageTemplate 实体、JPA Repository
- [x] 3.3 实现 TemplateService：模板 CRUD、启用/停用、复制、变量校验、租户级覆盖查询
- [x] 3.4 实现 TemplateRenderer 模板渲染引擎：变量替换、按渠道差异化渲染、linkTemplate 渲染
- [x] 3.5 创建 msg_subscription_rule 表 Flyway 迁移脚本（id, tenant_id, scope_type, scope_value, message_type, channel, priority, status）
- [x] 3.6 创建 msg_user_subscription 表 Flyway 迁移脚本（user_id, message_type, enabled）
- [x] 3.7 实现 SubscriptionService：查询用户偏好、更新偏好、查询场景规则、判断是否发送（含紧急绕过逻辑）
- [x] 3.8 集成 SubscriptionService 到 MessageDispatcher（发送前检查订阅规则）
- [x] 3.9 后端单元测试：TemplateService、TemplateRenderer、SubscriptionService

## 4. P2：管理端前端

- [x] 4.1 实现管理端 API 封装层（调用后端管理端 API）
- [x] 4.2 实现 TemplateList 模板列表页（复用 SearchTable）
- [ ] 4.3 实现 TemplateEditor 模板编辑器（JSON 编辑 + 变量预览 + 多渠道预览）
- [ ] 4.4 实现 ChannelConfig 渠道管理页（渠道列表 + 配置编辑 + 健康检查展示）
- [ ] 4.5 实现 SubscriptionRules 订阅规则管理页（规则列表 + 创建/编辑 + 优先级排序）
- [x] 4.6 实现 DeliveryLog 发送记录页（复用 SearchTable + 筛选 + 失败高亮 + 手动重发 + 统计图表）
- [x] 4.7 实现 REST API：管理端模板/渠道/订阅/记录接口（8个端点）
- [x] 4.8 注册管理端路由（/admin/notification/*）
- [ ] 4.9 前端单元测试：管理端各页面组件

## 5. P3：渠道适配器

- [x] 5.1 实现 SMS 渠道适配器（ChannelAdapter 接口 + HTTP API 调用 + 变量渲染）
- [x] 5.2 实现 WECHAT_WORK 渠道适配器（企业微信应用消息 API + access_token 管理）
- [x] 5.3 实现 WECHAT_MINIPROGRAM 渠道适配器（微信订阅消息 API + 模板 ID 映射）
- [x] 5.4 渠道配置加密存储（AES-256 加密 api_key 等敏感参数）
- [x] 5.5 实现渠道健康检查接口（成功率、平均延迟统计）
- [x] 5.6 实现渠道测试连通性接口（POST /channels/{id}/test）
- [x] 5.7 实现内部 API：POST /api/v1/internal/notifications/send（服务间调用）
- [ ] 5.8 权限控制：用户端仅操作自己的消息、管理端需 ADMIN/NOTIFICATION_MANAGER 角色、内部 API 限服务间
- [ ] 5.9 各渠道适配器单元测试（Mock 外部 API）

## 6. P4：重试、监控与优化

- [x] 6.1 优化重试表索引（message_id + status + next_retry_at 联合索引）
- [ ] 6.2 实现发送记录统计查询接口（发送量趋势、成功率、渠道分布）
- [ ] 6.3 前端统计图表组件（ECharts 或 Element Plus 图表）
- [ ] 6.4 性能优化：消息列表查询索引优化、未读计数缓存（Redis 可选）
- [ ] 6.5 端到端集成测试：消息发送→接收→已读→跳转完整链路
- [x] 6.6 更新 PRD 3.7 通知章节，标注已由新模块替代
