# 消息事件治理与公告菜单挂接设计

## 1. 背景与目标

当前消息管理模块已经具备消息中心、模板、渠道、订阅规则、发送记录和公告页面，但仍有两个闭环缺口：

1. `AnnouncementList.vue` 已有前端路由和后端接口，但没有加入数据库动态菜单，管理员无法从左侧菜单进入。
2. `SubscriptionRule.eventCode` 目前是自由文本，缺少事件定义、状态管理、模板绑定和发送链路关联，无法可靠支持按业务事件配置通知策略。

本次设计目标：

- 将公告管理页面挂接到动态菜单，并授权 `ROLE_ADMIN`。
- 建立租户范围内可由管理员维护的业务事件字典。
- 支持一个事件绑定多个渠道模板，但同一事件同一渠道最多一个启用模板。
- 让业务发送时携带 `eventCode`，并让订阅规则按事件和渠道参与实际判定。
- 订阅动作明确区分 `ALLOW`、`DENY`、`FORCE`。

本设计不把 Spring `MessageEvent` 当作管理员配置对象。`MessageEvent` 仍是内部技术事件；管理员维护的是业务事件定义。

## 2. 事件定义模型

新增实体 `NotificationEventDefinition`，对应表 `msg_event_definition`：

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `tenantId` | 租户 ID |
| `eventCode` | 租户内唯一，建议大写英文/数字/下划线 |
| `eventName` | 管理员可读名称 |
| `description` | 触发条件和业务含义 |
| `businessDomain` | 流程、任务、审批等业务领域 |
| `enabled` | 是否启用 |
| `createdBy`/`createdAt` | 创建审计 |
| `updatedBy`/`updatedAt` | 更新审计 |

唯一约束为 `tenant_id + event_code`。代码格式校验使用 `^[A-Z][A-Z0-9_]{0,63}$`。

管理员可以查询、创建、编辑、启停事件。删除采用保护策略：如果事件已被模板或订阅规则引用，则拒绝删除并提示先解除引用；无引用事件才允许删除。停用事件不能用于新的事件发送。

## 3. 事件与模板关系

`MessageTemplate` 增加可选 `eventCode` 字段，关系为：

```text
一个事件 1 ─── N 多个模板
一个模板 N ─── 1 一个事件
```

同一事件可以按渠道拥有不同模板，例如：

```text
TASK_CREATED + IN_APP          -> 站内信模板
TASK_CREATED + SMS             -> 短信模板
TASK_CREATED + WECHAT_WORK     -> 企业微信模板
```

允许保留停用历史模板；运行时约束同一租户、事件、渠道最多一个启用模板。启用新模板时，如果已有同组合启用模板，应拒绝并要求先停用旧模板，避免隐式切换和重复发送。

模板管理页面新增事件选择和事件名称展示；事件选项只来自当前租户的启用事件定义，不再允许自由输入不存在的事件代码。

## 4. 发送链路

`Message` 和 `MessageEvent` 增加可选 `eventCode`：

```text
业务动作
  -> sendByEvent(senderId, eventCode, variables, messageType, recipientIds, channels)
  -> 校验事件存在且启用
  -> 按事件/渠道选择启用模板
  -> 渲染标题和正文
  -> 构造 Message(eventCode)
  -> 发布 MessageEvent(eventCode)
  -> MessageDispatcher
```

新增 `MessageSender.sendByEvent(...)` 作为推荐入口。现有 `sendByTemplate(...)` 保留兼容无事件的自由模板场景；有事件绑定的模板发送应显式校验事件一致性，防止调用方传入错误事件。

公告继续使用现有专用发布接口；公告不要求绑定业务事件，仍由 `templateCode=ANNOUNCEMENT` 和 `MessageType.PUBLIC + MessageCategory.SYSTEM` 标识。

事件代码必须由发送方显式声明，不能根据模板名称推断。模板绑定事件只负责选择内容模板，不负责决定业务语义。

## 5. 订阅规则判定

`SubscriptionRule` 增加 `action` 字段，取值：

- `ALLOW`：允许该事件通过该渠道发送。
- `DENY`：拒绝该事件通过该渠道发送。
- `FORCE`：强制发送，覆盖用户对该渠道的退订。

判定顺序：

1. `URGENT` 消息无条件发送。
2. `PRIVATE` 消息无条件发送。
3. 系统公告（`category=SYSTEM`）无条件发送。
4. 查找当前租户、`eventCode`、`channel`、优先级匹配的启用规则。
5. `FORCE` 返回发送；`DENY` 返回不发送；`ALLOW` 继续视为允许发送。
6. 没有匹配规则时，使用用户渠道订阅偏好。

规则冲突处理：同一租户、事件、渠道、优先级只允许一个启用规则；数据库或服务层必须校验，避免多个规则的优先级不确定。

事件为空的消息不命中事件规则，继续使用现有用户偏好逻辑。

## 6. 管理端接口

事件管理：

```text
GET    /api/v1/admin/notification/events
POST   /api/v1/admin/notification/events
PUT    /api/v1/admin/notification/events/{id}
DELETE /api/v1/admin/notification/events/{id}
POST   /api/v1/admin/notification/events/{id}/toggle
```

模板列表增加 `eventCode` 筛选：

```text
GET /api/v1/admin/notification/templates?eventCode=TASK_CREATED
```

订阅规则请求体增加：

```json
{
  "eventCode": "FINANCE_URGE",
  "channel": "SMS",
  "priority": "HIGH",
  "action": "FORCE",
  "enable": true
}
```

所有管理端接口均使用现有统一管理员鉴权机制，并限制在当前租户范围内。

## 7. 前端页面与菜单

新增页面：

```text
/messages/events
```

页面列出：事件代码、事件名称、业务领域、启用状态、模板数量、规则数量、创建时间和操作。

页面操作：创建、编辑、启停、删除；删除前显示引用保护提示。

修改 `SubscriptionRules.vue`：

- 事件代码改为启用事件下拉选择。
- 增加动作下拉（允许/拒绝/强制）。
- 展示事件名称。

修改 `TemplateList.vue`：

- 增加事件代码/事件名称列。
- 创建和编辑时使用事件下拉。
- 显示事件与渠道的启用模板状态。

动态菜单迁移新增：

```text
消息管理
├── 公告管理   /messages/announcements
└── 事件管理   /messages/events
```

两个菜单均授权 `ROLE_ADMIN`，同时添加列表和管理按钮权限。迁移必须幂等，避免已存在菜单时重复插入。

## 8. 错误处理与一致性

- 事件不存在或已停用：拒绝事件发送，返回明确业务错误。
- 模板不存在或无启用模板：拒绝该事件/渠道发送，不生成假成功记录。
- 事件删除存在引用：返回冲突错误，不级联删除模板或规则。
- 同事件同渠道启用模板冲突：拒绝启用。
- 同事件同渠道同优先级启用规则冲突：拒绝保存。
- 所有创建、更新、启停、删除操作记录操作者和时间。
- 事件和模板查询必须带租户条件，不能跨租户读取或绑定。

## 9. 测试策略

### 后端

- 事件定义 CRUD、格式校验、租户唯一性。
- 停用事件不可发送。
- 有模板/规则引用时禁止删除事件。
- 同事件同渠道只能有一个启用模板。
- `Message`/`MessageEvent` 正确携带 `eventCode`。
- `ALLOW`、`DENY`、`FORCE` 判定正确。
- `FORCE` 覆盖用户退订；`URGENT`、`PRIVATE`、系统公告优先语义不变。
- 普通用户访问事件管理、公告管理、订阅管理接口返回 403。
- 动态菜单迁移幂等，ROLE_ADMIN 能看到公告和事件菜单。

### 前端

- 事件管理页面列表、创建、编辑、启停、删除和引用错误提示。
- 订阅规则事件下拉、动作选择和提交参数。
- 模板事件下拉和筛选。
- 公告管理路由与动态菜单入口。
- API 错误状态的用户提示。

## 10. 实施边界与顺序

实施顺序：

1. 新增事件实体、Repository、服务和迁移。
2. 新增事件管理 API 与后端测试。
3. 给 Message/MessageEvent/MessageSender 增加 eventCode 链路。
4. 增加订阅规则 action 和事件判定。
5. 改造模板和订阅规则前端页面。
6. 新增事件管理前端页面与路由。
7. 增加公告与事件动态菜单迁移。
8. 全量测试、端到端验证和菜单验证。

本次不扩展邮件、App Push、复杂模板版本灰度、事件自动发现和多租户跨域复制；这些属于后续独立能力。
