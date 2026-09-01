# 消息通知模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作流平台中构建完整的消息通知模块，支持多渠道发送、模板管理、订阅/退订、Web端消息中心界面。

**Architecture:** 采用 Spring Modulith 模块化架构，核心模块 `notification` 管理消息全生命周期，渠道通过 SPI 解耦，业务通过 Spring Events 发布消息事件。前端独立模块 `src/modules/notification/`，复用现有业务组件。

**Tech Stack:** Java 21, Spring Boot 4, Spring Modulith, Spring Events + @Async, MySQL + Flyway, Vue 3 + Element Plus + Pinia, TypeScript

## Global Constraints

- Java 21, Spring Boot 4.0.7, Spring Modulith 2.0.0
- Vue 3.5+, Element Plus 2.14+, Pinia 4.0+, TypeScript 6.0
- MySQL 8+, Flyway 迁移
- 前端新增代码放在 `src/modules/notification/` 独立目录
- 复用 SearchTable、LookupPicker、DataPicker 等现有组件
- TDD 开发（RED → GREEN → REFACTOR）

---

## File Structure

### 后端文件

| 文件 | 职责 |
|---|---|
| `backend/src/main/java/com/workflow/notification/` | notification 模块根包 |
| `notification/model/Message.java` | 消息实体 |
| `notification/model/Recipient.java` | 接收人实体 |
| `notification/model/MessageTemplate.java` | 模板实体 |
| `notification/model/SubscriptionRule.java` | 订阅规则实体 |
| `notification/model/UserSubscription.java` | 用户订阅偏好 |
| `notification/model/ChannelType.java` | 渠道枚举 |
| `notification/model/MessagePriority.java` | 优先级枚举 |
| `notification/model/MessageCategory.java` | 分类枚举 |
| `notification/channel/ChannelAdapter.java` | 渠道 SPI 接口 |
| `notification/channel/ChannelMessage.java` | 渠道消息 DTO |
| `notification/channel/ChannelDeliveryResult.java` | 投递结果 |
| `notification/channel/InAppChannelAdapter.java` | 站内信适配器 |
| `notification/dispatch/MessageDispatcher.java` | 分发协调器 |
| `notification/dispatch/MessageEvent.java` | 消息事件 |
| `notification/template/TemplateService.java` | 模板服务 |
| `notification/template/TemplateRenderer.java` | 模板渲染器 |
| `notification/subscription/SubscriptionService.java` | 订阅服务 |
| `notification/store/MessageService.java` | 消息存储服务 |
| `notification/store/DeliveryRetryService.java` | 重试服务 |
| `notification/store/RetryTask.java` | 定时重试任务 |
| `notification/admin/TemplateController.java` | 模板管理 API |
| `notification/admin/ChannelController.java` | 渠道管理 API |
| `notification/admin/SubscriptionController.java` | 订阅管理 API |
| `notification/admin/DeliveryController.java` | 发送记录 API |
| `notification/api/NotificationController.java` | 用户端 API |
| `notification/api/InternalNotificationController.java` | 内部 API |

### 前端文件

| 文件 | 职责 |
|---|---|
| `frontend/src/modules/notification/` | 模块根目录 |
| `notification/api/notification.ts` | 用户端 API 封装 |
| `notification/api/admin.ts` | 管理端 API 封装 |
| `notification/stores/notification.ts` | Pinia store |
| `notification/types/index.ts` | TypeScript 类型 |
| `notification/router/index.ts` | 路由配置 |
| `notification/components/NotificationBell.vue` | 全局铃铛 |
| `notification/components/MessageList.vue` | 消息列表 |
| `notification/components/MessageFilter.vue` | 筛选面板 |
| `notification/views/MessageCenter.vue` | 消息中心 |
| `notification/views/MessageDetail.vue` | 消息详情 |
| `notification/views/admin/TemplateList.vue` | 模板列表 |
| `notification/views/admin/TemplateEditor.vue` | 模板编辑器 |
| `notification/views/admin/ChannelConfig.vue` | 渠道配置 |
| `notification/views/admin/SubscriptionRules.vue` | 订阅规则 |
| `notification/views/admin/DeliveryLog.vue` | 发送记录 |

---

### Task 1: 模块骨架与数据模型

**Files:**
- Create: `backend/src/main/java/com/workflow/notification/package-info.java`
- Create: `backend/src/main/java/com/workflow/notification/model/` (所有实体类)
- Create: `backend/src/test/java/com/workflow/notification/model/` (测试)
- Modify: Flyway 迁移脚本

**Interfaces:**
- Produces: Message, Recipient, MessageTemplate, SubscriptionRule, UserSubscription 实体

- [ ] **Step 1: 创建模块目录结构**
```bash
mkdir -p backend/src/main/java/com/workflow/notification/{model,channel,dispatch,template,subscription,store,retry,admin,api}
mkdir -p backend/src/test/java/com/workflow/notification/
```

- [ ] **Step 2: 创建 package-info.java**
```java
package com.workflow.notification;
// 消息通知模块
```

- [ ] **Step 3: 编写 Message 实体测试**
```java
@Test
void message_creation_with_all_fields() {
    Message msg = Message.builder()
        .tenantId(1L)
        .templateCode("TASK_CREATED")
        .senderId(100L)
        .senderType("SYSTEM")
        .title("新任务通知")
        .content(Map.of("taskName", "审批任务"))
        .priority(MessagePriority.NORMAL)
        .category(MessageCategory.WORKFLOW)
        .messageType(MessageType.PRIVATE)
        .status(MessageStatus.SENT)
        .build();
    assertThat(msg.getTenantId()).isEqualTo(1L);
    assertThat(msg.getStatus()).isEqualTo(MessageStatus.SENT);
}
```

- [ ] **Step 4: 运行测试确认失败**
Run: `mvn test -pl backend -Dtest=MessageTest -q`
Expected: FAIL (类不存在)

- [ ] **Step 5: 实现 Message 实体**
```java
@Entity
@Table(name = "msg_message")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class Message {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private Long tenantId;
    private String templateCode;
    private Long senderId;
    private String senderType;
    private String title;
    @Column(columnDefinition = "JSON")
    private Map<String, Object> content;
    @Column(columnDefinition = "JSON")
    private Map<String, Object> linkJson;
    @Enumerated(EnumType.STRING)
    private MessagePriority priority;
    @Enumerated(EnumType.STRING)
    private MessageCategory category;
    @Enumerated(EnumType.STRING)
    private MessageType messageType;
    @Enumerated(EnumType.STRING)
    private MessageStatus status;
    private LocalDateTime createdAt;
    @PrePersist
    void prePersist() { createdAt = LocalDateTime.now(); }
}
```

- [ ] **Step 6: 运行测试确认通过**
Run: `mvn test -pl backend -Dtest=MessageTest -q`
Expected: PASS

- [ ] **Step 7: 实现 Recipient 实体（同 TDD 循环）**
- [ ] **Step 8: 实现 MessageTemplate 实体（同 TDD 循环）**
- [ ] **Step 9: 实现 SubscriptionRule 和 UserSubscription 实体（同 TDD 循环）**
- [ ] **Step 10: 实现枚举类（ChannelType, MessagePriority, MessageCategory, MessageType, MessageStatus）**
- [ ] **Step 11: 创建 Flyway 迁移脚本**
```sql
-- V{version}__create_notification_tables.sql
CREATE TABLE msg_message (...);
CREATE TABLE msg_recipient (...);
CREATE TABLE msg_template (...);
CREATE TABLE msg_subscription_rule (...);
CREATE TABLE msg_user_subscription (...);
CREATE TABLE msg_delivery_retry (...);
```

- [ ] **Step 12: Commit**
```bash
git add -A
git commit -m "feat(notification): 模块骨架与数据模型"
```

---

### Task 2: ChannelAdapter SPI 接口

**Files:**
- Create: `notification/channel/ChannelAdapter.java`
- Create: `notification/channel/ChannelMessage.java`
- Create: `notification/channel/ChannelDeliveryResult.java`
- Create: `notification/channel/InAppChannelAdapter.java`
- Test: `notification/channel/InAppChannelAdapterTest.java`

**Interfaces:**
- Produces: ChannelAdapter 接口、ChannelMessage、ChannelDeliveryResult、InAppChannelAdapter

- [ ] **Step 1: 编写 ChannelAdapter 接口测试**
```java
@Test
void in_app_adapter_returns_channel_type() {
    InAppChannelAdapter adapter = new InAppChannelAdapter();
    assertThat(adapter.getChannelType()).isEqualTo(ChannelType.IN_APP);
    assertThat(adapter.isAvailable()).isTrue();
}
```

- [ ] **Step 2: 运行测试确认失败**
Run: `mvn test -pl backend -Dtest=InAppChannelAdapterTest -q`
Expected: FAIL

- [ ] **Step 3: 实现 ChannelAdapter 接口**
```java
public interface ChannelAdapter {
    ChannelType getChannelType();
    ChannelDeliveryResult send(ChannelMessage message);
    boolean isAvailable();
}
```

- [ ] **Step 4: 实现 ChannelMessage 和 ChannelDeliveryResult**
- [ ] **Step 5: 实现 InAppChannelAdapter（站内信，直接写入即成功）**
- [ ] **Step 6: 运行测试确认通过**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): ChannelAdapter SPI 接口与站内信适配器"
```

---

### Task 3: MessageService 消息存储服务

**Files:**
- Create: `notification/store/MessageService.java`
- Create: `notification/store/MessageRepository.java`
- Create: `notification/store/RecipientRepository.java`
- Test: `notification/store/MessageServiceTest.java`

**Interfaces:**
- Consumes: Message, Recipient 实体
- Produces: MessageService（send, list, detail, markRead, markAllRead, delete, unreadCount）

- [ ] **Step 1: 编写 MessageService 测试**
```java
@Test
void send_private_message_creates_recipients() {
    Message msg = Message.builder().messageType(MessageType.PRIVATE).build();
    List<Long> recipientIds = List.of(1L, 2L);
    messageService.send(msg, recipientIds);
    assertThat(recipientRepository.findByMessageId(msg.getId())).hasSize(2);
}
```

- [ ] **Step 2-6: TDD 循环实现 MessageService**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): MessageService 消息存储服务"
```

---

### Task 4: MessageDispatcher 分发协调器

**Files:**
- Create: `notification/dispatch/MessageEvent.java`
- Create: `notification/dispatch/MessageDispatcher.java`
- Test: `notification/dispatch/MessageDispatcherTest.java`

**Interfaces:**
- Consumes: MessageEvent, ChannelAdapter, MessageService
- Produces: MessageDispatcher（监听事件，同步站内信，异步外部渠道）

- [ ] **Step 1: 编写 MessageDispatcher 测试**
```java
@Test
void dispatch_creates_in_app_message_and_async_others() {
    MessageEvent event = new MessageEvent(this, message, recipientIds, channels);
    dispatcher.handleEvent(event);
    // 站内信同步写入
    verify(messageService).send(message, recipientIds);
    // 外部渠道异步
    verify(asyncExecutor).execute(any(Runnable.class));
}
```

- [ ] **Step 2-6: TDD 循环实现 MessageDispatcher**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): MessageDispatcher 分发协调器"
```

---

### Task 5: REST API - 用户端

**Files:**
- Create: `notification/api/NotificationController.java`
- Create: `notification/api/NotificationControllerTest.java`

**Interfaces:**
- Consumes: MessageService
- Produces: 7 个 REST 端点

- [ ] **Step 1: 编写 API 测试**
```java
@Test
void get_unread_count_returns_number() {
    mockMvc.perform(get("/api/v1/notifications/unread-count"))
        .andExpect(status().isOk());
}
```

- [ ] **Step 2-6: TDD 循环实现控制器**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 用户端 REST API"
```

---

### Task 6: 异步重试机制

**Files:**
- Create: `notification/store/DeliveryRetryService.java`
- Create: `notification/store/RetryTask.java`
- Create: `notification/store/DeliveryRetryRepository.java`
- Test: `notification/store/RetryTaskTest.java`

**Interfaces:**
- Consumes: DeliveryRetryRepository, ChannelAdapter
- Produces: DeliveryRetryService（save, retry）, RetryTask（定时扫描）

- [ ] **Step 1: 编写 RetryTask 测试**
```java
@Test
void retry_task_retries_failed_deliveries() {
    // 创建一条 retry_count=0 的失败记录
    retryTask.run();
    // 验证重试被触发
}
```

- [ ] **Step 2-6: TDD 循环实现**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 异步重试机制"
```

---

### Task 7: 前端模块骨架

**Files:**
- Create: `frontend/src/modules/notification/` 目录结构
- Create: `notification/types/index.ts`
- Create: `notification/api/notification.ts`
- Create: `notification/stores/notification.ts`
- Create: `notification/router/index.ts`
- Create: `notification/index.ts`

- [ ] **Step 1: 创建前端模块目录**
```bash
mkdir -p frontend/src/modules/notification/{api,stores,types,router,components,views/admin}
```

- [ ] **Step 2: 定义 TypeScript 类型**
```typescript
export interface Message {
  id: number
  title: string
  content: Record<string, any>
  link?: MessageLink
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  category: 'WORKFLOW' | 'SYSTEM' | 'USER' | 'EXTERNAL'
  messageType: 'PUBLIC' | 'PRIVATE'
  status: 'DRAFT' | 'SENT' | 'FAILED'
  createdAt: string
}
```

- [ ] **Step 3: 实现 API 封装层**
- [ ] **Step 4: 实现 Pinia store**
- [ ] **Step 5: 实现路由配置**
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(notification): 前端模块骨架"
```

---

### Task 8: NotificationBell 全局铃铛

**Files:**
- Create: `notification/components/NotificationBell.vue`
- Modify: `frontend/src/layouts/` (引入铃铛组件)
- Test: `notification/components/__tests__/NotificationBell.test.ts`

**Interfaces:**
- Consumes: useNotificationStore
- Produces: NotificationBell 组件

- [ ] **Step 1: 编写铃铛组件测试**
```typescript
it('shows unread count badge', () => {
  const wrapper = mount(NotificationBell, { store })
  expect(wrapper.find('.badge').text()).toBe('3')
})
```

- [ ] **Step 2-5: TDD 循环实现 NotificationBell**
- [ ] **Step 6: 在 layouts 中引入铃铛组件**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 全局铃铛组件"
```

---

### Task 9: MessageCenter 消息中心页面

**Files:**
- Create: `notification/views/MessageCenter.vue`
- Create: `notification/components/MessageList.vue`
- Create: `notification/components/MessageFilter.vue`
- Test: `notification/views/__tests__/MessageCenter.test.ts`

**Interfaces:**
- Consumes: useNotificationStore, SearchTable 组件
- Produces: MessageCenter 页面（三栏布局）

- [ ] **Step 1: 编写消息中心页面测试**
```typescript
it('renders three-column layout', () => {
  const wrapper = mount(MessageCenter)
  expect(wrapper.find('.filter-panel').exists()).toBe(true)
  expect(wrapper.find('.message-list').exists()).toBe(true)
  expect(wrapper.find('.message-detail').exists()).toBe(true)
})
```

- [ ] **Step 2-6: TDD 循环实现**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 消息中心页面"
```

---

### Task 10: TemplateService 模板引擎

**Files:**
- Create: `notification/template/TemplateService.java`
- Create: `notification/template/TemplateRenderer.java`
- Create: `notification/template/MessageTemplateRepository.java`
- Test: `notification/template/TemplateServiceTest.java`

**Interfaces:**
- Consumes: MessageTemplate 实体
- Produces: TemplateService（CRUD, toggle, copy）, TemplateRenderer（render）

- [ ] **Step 1: 编写模板渲染测试**
```java
@Test
void render_replaces_variables_in_sms_template() {
    String template = "您有新待办：${taskName}";
    String result = templateRenderer.render(template, Map.of("taskName", "审批任务"));
    assertThat(result).isEqualTo("您有新待办：审批任务");
}
```

- [ ] **Step 2-6: TDD 循环实现**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 模板引擎"
```

---

### Task 11: SubscriptionService 订阅服务

**Files:**
- Create: `notification/subscription/SubscriptionService.java`
- Create: `notification/subscription/UserSubscriptionRepository.java`
- Create: `notification/subscription/SubscriptionRuleRepository.java`
- Test: `notification/subscription/SubscriptionServiceTest.java`

**Interfaces:**
- Consumes: UserSubscription, SubscriptionRule 实体
- Produces: SubscriptionService（getUserPreferences, updatePreference, shouldSend）

- [ ] **Step 1: 编写订阅判断测试**
```java
@Test
void urgent_message_bypasses_subscription() {
    Message msg = Message.builder().priority(MessagePriority.URGENT).build();
    boolean shouldSend = subscriptionService.shouldSend(msg, userId, ChannelType.SMS);
    assertThat(shouldSend).isTrue(); // 紧急消息绕过所有设置
}
```

- [ ] **Step 2-6: TDD 循环实现**
- [ ] **Step 7: Commit**
```bash
git commit -m "feat(notification): 订阅服务"
```

---

### Task 12: 管理端 REST API

**Files:**
- Create: `notification/admin/TemplateController.java`
- Create: `notification/admin/ChannelController.java`
- Create: `notification/admin/SubscriptionController.java`
- Create: `notification/admin/DeliveryController.java`
- Test: 各控制器测试

**Interfaces:**
- Consumes: TemplateService, SubscriptionService, MessageService
- Produces: 8 个管理端 REST 端点

- [ ] **Step 1-5: TDD 循环实现各控制器**
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(notification): 管理端 REST API"
```

---

### Task 13: 管理端前端页面

**Files:**
- Create: `notification/views/admin/TemplateList.vue`
- Create: `notification/views/admin/TemplateEditor.vue`
- Create: `notification/views/admin/ChannelConfig.vue`
- Create: `notification/views/admin/SubscriptionRules.vue`
- Create: `notification/views/admin/DeliveryLog.vue`
- Create: `notification/api/admin.ts`

- [ ] **Step 1-5: 实现各管理端页面（复用 SearchTable）**
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(notification): 管理端前端页面"
```

---

### Task 14: 渠道适配器实现

**Files:**
- Create: `notification/channel/sms/SmsChannelAdapter.java`
- Create: `notification/channel/wechatwork/WechatWorkChannelAdapter.java`
- Create: `notification/channel/miniprogram/MiniprogramChannelAdapter.java`
- Test: 各适配器 Mock 测试

- [ ] **Step 1: 实现 SMS 适配器（Mock HTTP API）**
- [ ] **Step 2: 实现企业微信适配器（Mock API）**
- [ ] **Step 3: 实现小程序适配器（Mock API）**
- [ ] **Step 4: 实现渠道配置加密存储**
- [ ] **Step 5: 实现渠道健康检查和测试连通性**
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(notification): 渠道适配器实现"
```

---

### Task 15: 内部 API 与权限控制

**Files:**
- Create: `notification/api/InternalNotificationController.java`
- Modify: Security 配置（新增权限规则）

- [ ] **Step 1: 实现内部 API 端点**
- [ ] **Step 2: 配置权限控制（用户端/管理端/内部 API）**
- [ ] **Step 3: Commit**
```bash
git commit -m "feat(notification): 内部 API 与权限控制"
```

---

### Task 16: 端到端集成测试与优化

**Files:**
- Test: 端到端集成测试
- Modify: 性能优化（索引、缓存）

- [ ] **Step 1: 编写端到端测试：发送→接收→已读→跳转**
- [ ] **Step 2: 性能优化：消息列表查询索引**
- [ ] **Step 3: 未读计数缓存（Redis 可选）**
- [ ] **Step 4: 更新 PRD 3.7**
- [ ] **Step 5: 最终 Commit**
```bash
git commit -m "feat(notification): 端到端测试与优化"
```
