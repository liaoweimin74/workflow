# Notification Event Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立管理员可维护的业务消息事件体系，贯通事件、渠道模板和 `ALLOW/DENY/FORCE` 订阅规则，并将公告管理与事件管理挂接到动态菜单。

**Architecture:** 保留 Spring `MessageEvent` 作为内部技术事件；新增租户级 `NotificationEventDefinition` 作为业务事件字典。`Message`/`MessageEvent` 携带业务 `eventCode`，`MessageSender.sendByEvent` 校验事件并按事件+渠道选择启用模板；`SubscriptionService` 按事件规则动作和用户偏好进行最终判定。公告菜单和事件菜单通过幂等 Flyway 菜单迁移加入动态菜单体系。

**Tech Stack:** Spring Boot、Spring Data JPA、Flyway、Spring ApplicationEvent、Vue 3、TypeScript、Element Plus、SearchTable、Vitest、JUnit 5、Mockito。

## Global Constraints

- 所有功能变更在当前 `feature/message-center` worktree 中完成，`main` 分支保持干净。
- 后端实现采用 TDD：先写失败测试，再写最小实现，再重构和回归。
- 业务事件代码格式固定为 `^[A-Z][A-Z0-9_]{0,63}$`。
- 事件唯一性限定在 `tenant_id + event_code`。
- 同一租户、事件、渠道最多一个启用模板。
- 同一租户、事件、渠道、优先级最多一个启用订阅规则。
- 规则动作固定为 `ALLOW`、`DENY`、`FORCE`。
- `URGENT`、`PRIVATE` 和 `category=SYSTEM` 的既有必达语义必须保持。
- 事件、模板、规则的查询和绑定必须带当前租户条件，不允许跨租户访问。
- 事件被模板或订阅规则引用时禁止删除，只允许停用或先解除引用。
- 不新增邮件、复杂模板灰度、事件自动发现和跨租户复制功能。

---

## 文件地图

### 后端新增

- `backend/src/main/java/com/workflow/notification/model/NotificationEventDefinition.java`：事件字典实体。
- `backend/src/main/java/com/workflow/notification/store/NotificationEventDefinitionRepository.java`：事件查询和唯一性接口。
- `backend/src/main/java/com/workflow/notification/event/NotificationEventService.java`：事件 CRUD、格式校验、引用保护、启停。
- `backend/src/main/java/com/workflow/notification/admin/EventDefinitionController.java`：管理员事件管理 API。
- `backend/src/main/resources/db/migration/V29__add_notification_event_definitions.sql`：事件表和动态菜单迁移；当前 worktree 迁移最高版本为 V28，因此使用 V29。

### 后端修改

- `backend/src/main/java/com/workflow/notification/model/Message.java`：增加持久化 `eventCode`。
- `backend/src/main/java/com/workflow/notification/dispatch/MessageEvent.java`：增加可选 `eventCode`，保留无事件兼容构造器。
- `backend/src/main/java/com/workflow/notification/dispatch/MessageSender.java`：增加 `sendByEvent(...)`，校验事件并选择渠道模板；保留 `sendByTemplate(...)`。
- `backend/src/main/java/com/workflow/notification/model/MessageTemplate.java`：增加可选 `eventCode`。
- `backend/src/main/java/com/workflow/notification/template/MessageTemplateRepository.java`：增加按租户/事件/渠道/启用状态查询和冲突查询。
- `backend/src/main/java/com/workflow/notification/template/TemplateService.java`：校验事件绑定和启用模板唯一性。
- `backend/src/main/java/com/workflow/notification/model/SubscriptionRule.java`：增加 `action`。
- `backend/src/main/java/com/workflow/notification/subscription/SubscriptionRuleRepository.java`：增加按租户/事件/渠道/优先级/启用状态查询。
- `backend/src/main/java/com/workflow/notification/subscription/SubscriptionService.java`：接入事件规则判定和动作优先级。
- `backend/src/main/java/com/workflow/notification/admin/SubscriptionController.java`：事件规则字段校验和租户隔离。
- `backend/src/main/java/com/workflow/notification/admin/TemplateController.java`：事件筛选和事件绑定输入处理。
- `backend/src/main/java/com/workflow/notification/admin/AnnouncementController.java`：保持公告不绑定业务事件，仅确保动态菜单可见。

### 前端新增

- `frontend/src/modules/notification/views/admin/EventDefinitionList.vue`：事件字典管理页面。
- `frontend/src/modules/notification/api/event.ts`：事件管理 API。

### 前端修改

- `frontend/src/modules/notification/types/index.ts`：事件定义、规则动作、模板事件字段类型。
- `frontend/src/modules/notification/api/admin.ts`：事件筛选和订阅动作字段。
- `frontend/src/modules/notification/views/admin/SubscriptionRules.vue`：事件下拉、动作下拉、事件名称。
- `frontend/src/modules/notification/views/admin/TemplateList.vue`：事件绑定、事件筛选、事件列。
- `frontend/src/router/index.ts`：确认公告路由和新增事件路由。

### 测试

- `backend/src/test/java/com/workflow/notification/event/NotificationEventServiceTest.java`
- `backend/src/test/java/com/workflow/notification/admin/EventDefinitionControllerTest.java`
- `backend/src/test/java/com/workflow/notification/dispatch/MessageSenderTest.java`
- `backend/src/test/java/com/workflow/notification/subscription/SubscriptionServiceTest.java`
- `backend/src/test/java/com/workflow/notification/admin/SubscriptionControllerTest.java`
- `backend/src/test/java/com/workflow/notification/template/TemplateServiceTest.java`
- `frontend/src/modules/notification/views/admin/__tests__/EventDefinitionList.test.ts`
- 事件管理和动态菜单相关迁移/集成验证脚本或测试。

---

## Task 1: 挂接公告管理动态菜单

**Files:**
- Create: `backend/src/main/resources/db/migration/V29__add_notification_event_definitions.sql`
- Modify: `frontend/src/router/index.ts`（仅确认已有 `/messages/announcements`，不重复添加）
- Test: 数据库迁移验证和前端路由检查

**Interfaces:**
- Produces database menu `messages/announcements` under parent menu id 250 with `ROLE_ADMIN` authorization.
- Produces database menu `messages/events` reserved for Task 7.

- [ ] **Step 1: Write migration verification first**

  验证迁移包含幂等插入、公告菜单、事件菜单、列表权限和管理权限；公告菜单组件必须为 `modules/notification/views/admin/AnnouncementList`。

- [ ] **Step 2: Run migration-level verification**

  Run: 在测试数据库执行 Flyway migration，并查询 `sys_menu` 与 `sys_role_menu`。
  Expected: `/messages/announcements` 仅有一条子菜单记录，`ROLE_ADMIN` 获得该菜单及其按钮权限，重复执行不会产生重复记录。

- [ ] **Step 3: Implement migration**

  在同一个幂等迁移中加入：

  ```sql
  INSERT IGNORE INTO sys_menu
      (id, parent_id, menu_name, menu_type, path, component, permission, icon,
       sort_order, status, is_deleted, created_at, updated_at)
  VALUES
      (260, 250, '公告管理', 1, '/messages/announcements',
       'modules/notification/views/admin/AnnouncementList',
       'notification:announcement:list', 'Notification', 6, 1, 0, NOW(), NOW());
  ```

  同步插入公告管理按钮权限、事件管理菜单占位记录和 `ROLE_ADMIN` 关联。若数据库版本已使用，必须选取未使用版本并同步调整文件名。

- [ ] **Step 4: Verify front-end route and dynamic menu**

  Run: `npx vitest run src/modules/notification` and manually log in as admin.
  Expected: 左侧消息管理下出现“公告管理”，点击后进入 `/messages/announcements`；直接访问该路由仍能正常加载。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/resources/db/migration frontend/src/router/index.ts
  git commit -m "feat: mount announcement management in notification menu"
  ```

---

## Task 2: 建立事件实体与持久化约束

**Files:**
- Create: `backend/src/main/java/com/workflow/notification/model/NotificationEventDefinition.java`
- Create: `backend/src/main/java/com/workflow/notification/store/NotificationEventDefinitionRepository.java`
- Modify: `backend/src/main/resources/db/migration/V29__add_notification_event_definitions.sql`（与 Task 1 同一迁移时一次完成）
- Test: `backend/src/test/java/com/workflow/notification/event/NotificationEventServiceTest.java`

**Interfaces:**
- Entity fields: `id`, `tenantId`, `eventCode`, `eventName`, `description`, `businessDomain`, `enabled`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`。
- `EventDefinitionCommand`: `record EventDefinitionCommand(String eventCode, String eventName, String description, String businessDomain)`。
- Repository methods:
  - `Optional<NotificationEventDefinition> findByTenantIdAndEventCode(String tenantId, String eventCode)`
  - `boolean existsByTenantIdAndEventCode(String tenantId, String eventCode)`
  - `Page<NotificationEventDefinition> findByTenantId(..., Pageable pageable)`

- [ ] **Step 1: Write failing entity/service tests**

  覆盖合法代码接受、空代码拒绝、小写和非法字符拒绝、租户内重复代码拒绝、默认 `enabled=true`。

- [ ] **Step 2: Run tests to verify failure**

  Run: `mvn -Dtest=NotificationEventServiceTest test`
  Expected: FAIL，因为实体、服务和校验尚未实现。

- [ ] **Step 3: Implement entity, repository and migration**

  使用 JPA `@Entity`、租户+事件代码唯一约束、时间审计回调；迁移使用 `CREATE TABLE IF NOT EXISTS` 和唯一索引。所有字段长度与设计文档一致。

- [ ] **Step 4: Run tests**

  Run: `mvn -Dtest=NotificationEventServiceTest test`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/workflow/notification/model/NotificationEventDefinition.java backend/src/main/java/com/workflow/notification/store/NotificationEventDefinitionRepository.java backend/src/main/resources/db/migration
  git commit -m "feat: add tenant-scoped notification event definitions"
  ```

---

## Task 3: 实现事件管理服务与管理员 API

**Files:**
- Create: `backend/src/main/java/com/workflow/notification/event/NotificationEventService.java`
- Create: `backend/src/main/java/com/workflow/notification/admin/EventDefinitionController.java`
- Test: `backend/src/test/java/com/workflow/notification/event/NotificationEventServiceTest.java`
- Test: `backend/src/test/java/com/workflow/notification/admin/EventDefinitionControllerTest.java`

**Interfaces:**
- Service:
  - `PageResult<NotificationEventDefinition> list(String tenantId, int page, int size, String keyword, Boolean enabled)`
  - `NotificationEventDefinition create(String tenantId, String operator, EventDefinitionCommand command)`
  - `NotificationEventDefinition update(String tenantId, Long id, String operator, EventDefinitionCommand command)`
  - `void delete(String tenantId, Long id)`
  - `void toggle(String tenantId, Long id, String operator)`
  - `NotificationEventDefinition requireEnabled(String tenantId, String eventCode)`
- Controller routes:
  - `GET /api/v1/admin/notification/events`
  - `POST /api/v1/admin/notification/events`
  - `PUT /api/v1/admin/notification/events/{id}`
  - `DELETE /api/v1/admin/notification/events/{id}`
  - `POST /api/v1/admin/notification/events/{id}/toggle`

- [ ] **Step 1: Write failing service/controller tests**

  覆盖 CRUD、分页搜索、启停、租户隔离、管理员鉴权、被模板或订阅规则引用时删除返回冲突。

- [ ] **Step 2: Run tests to verify failure**

  Run: `mvn -Dtest=NotificationEventServiceTest,EventDefinitionControllerTest test`
  Expected: FAIL。

- [ ] **Step 3: Implement service and controller**

  当前租户从 `TenantProvider` 获取，当前操作者从 `LoginUser` 获取；控制器复用 `NotificationAdminAuthorization.requireAdmin()`。删除前分别检查模板和订阅规则引用，发现任一引用返回 409 业务错误。

- [ ] **Step 4: Run tests**

  Run: `mvn -Dtest=NotificationEventServiceTest,EventDefinitionControllerTest test`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/workflow/notification/event backend/src/main/java/com/workflow/notification/admin/EventDefinitionController.java backend/src/test/java/com/workflow/notification/event backend/src/test/java/com/workflow/notification/admin/EventDefinitionControllerTest.java
  git commit -m "feat: add notification event administration API"
  ```

---

## Task 4: 贯通 Message 与 MessageEvent 的 eventCode

**Files:**
- Modify: `backend/src/main/java/com/workflow/notification/model/Message.java`
- Modify: `backend/src/main/java/com/workflow/notification/dispatch/MessageEvent.java`
- Modify: `backend/src/main/java/com/workflow/notification/dispatch/MessageSender.java`
- Modify: `backend/src/main/java/com/workflow/notification/api/InternalNotificationController.java`
- Modify: `backend/src/main/java/com/workflow/notification/api/TemplateSendRequest.java`
- Test: `backend/src/test/java/com/workflow/notification/dispatch/MessageSenderTest.java`
- Test: `backend/src/test/java/com/workflow/notification/MessageEndToEndTest.java`

**Interfaces:**
- `Message.eventCode: String`。
- `MessageEvent(Object source, Message message, List<Long> recipientIds, List<ChannelType> channels, String eventCode)`。
- 保留旧 `MessageEvent` 构造器，将 `eventCode` 设为 `null`。
- `MessageSender.sendByEvent(Long senderId, String eventCode, Map<String,Object> variables, MessageType messageType, List<Long> recipientIds, List<ChannelType> channels)`。
- `TemplateSendRequest.eventCode` 为可选兼容字段。

- [ ] **Step 1: Write failing event propagation tests**

  覆盖 `sendByEvent` 将事件代码写入 `Message` 和 `MessageEvent`，事件不存在/停用时拒绝发送；旧 `sendByTemplate` 无事件调用仍然可用。

- [ ] **Step 2: Run tests to verify failure**

  Run: `mvn -Dtest=MessageSenderTest,MessageEndToEndTest test`
  Expected: 新增断言 FAIL。

- [ ] **Step 3: Implement event propagation**

  `MessageSender` 注入 `NotificationEventService`，先 `requireEnabled`；按后续 Task 5 的模板查询接口选择模板。内部 API 增加 eventCode 透传但不允许客户端伪造租户。

- [ ] **Step 4: Run tests**

  Run: `mvn -Dtest=MessageSenderTest,MessageEndToEndTest test`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/workflow/notification/model/Message.java backend/src/main/java/com/workflow/notification/dispatch backend/src/main/java/com/workflow/notification/api backend/src/test/java/com/workflow/notification/dispatch/MessageSenderTest.java backend/src/test/java/com/workflow/notification/MessageEndToEndTest.java
  git commit -m "feat: propagate business event codes through message sending"
  ```

---

## Task 5: 将模板绑定到事件和渠道

**Files:**
- Modify: `backend/src/main/java/com/workflow/notification/model/MessageTemplate.java`
- Modify: `backend/src/main/java/com/workflow/notification/template/MessageTemplateRepository.java`
- Modify: `backend/src/main/java/com/workflow/notification/template/TemplateService.java`
- Modify: `backend/src/main/java/com/workflow/notification/admin/TemplateController.java`
- Test: `backend/src/test/java/com/workflow/notification/template/TemplateServiceTest.java`

**Interfaces:**
- `MessageTemplate.eventCode: String`。
- Repository queries:
  - `Optional<MessageTemplate> findByTenantIdAndEventCodeAndChannelAndEnabled(...)`
  - `boolean existsByTenantIdAndEventCodeAndChannelAndEnabled(...)`
- `TemplateService.getTemplateForEvent(String tenantId, String eventCode, ChannelType channel)`。

- [ ] **Step 1: Write failing template binding tests**

  覆盖创建模板绑定启用事件、事件不存在或停用拒绝、同事件同渠道第二个启用模板拒绝、停用历史模板允许保留、按事件+渠道能找到唯一启用模板。

- [ ] **Step 2: Run tests to verify failure**

  Run: `mvn -Dtest=TemplateServiceTest test`
  Expected: FAIL。

- [ ] **Step 3: Implement model/repository/service/controller changes**

  模板绑定事件时通过 `NotificationEventService` 校验当前租户；模板启用时检查组合唯一性；模板无事件仍允许作为兼容模板，但 `sendByEvent` 只选择匹配事件模板。

- [ ] **Step 4: Run tests**

  Run: `mvn -Dtest=TemplateServiceTest test`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/workflow/notification/model/MessageTemplate.java backend/src/main/java/com/workflow/notification/template backend/src/main/java/com/workflow/notification/admin/TemplateController.java backend/src/test/java/com/workflow/notification/template/TemplateServiceTest.java
  git commit -m "feat: bind notification templates to events and channels"
  ```

---

## Task 6: 接入 ALLOW/DENY/FORCE 订阅规则判定

**Files:**
- Modify: `backend/src/main/java/com/workflow/notification/model/SubscriptionRule.java`
- Modify: `backend/src/main/java/com/workflow/notification/subscription/SubscriptionRuleRepository.java`
- Modify: `backend/src/main/java/com/workflow/notification/subscription/SubscriptionService.java`
- Modify: `backend/src/main/java/com/workflow/notification/admin/SubscriptionController.java`
- Test: `backend/src/test/java/com/workflow/notification/subscription/SubscriptionServiceTest.java`
- Test: `backend/src/test/java/com/workflow/notification/admin/SubscriptionControllerTest.java`

**Interfaces:**
- `SubscriptionRule.action: SubscriptionRuleAction`，枚举值 `ALLOW/DENY/FORCE`。
- `SubscriptionService.shouldSend(Message message, Long userId, ChannelType channel)` 判定顺序：`URGENT` → `PRIVATE` → `SYSTEM` → 启用事件规则 → 用户偏好。
- Repository: `findEnabledByTenantIdAndEventCodeAndChannelAndPriority(...)`。

- [ ] **Step 1: Write failing rule tests**

  覆盖：`FORCE` 覆盖用户退订；`DENY` 拦截普通消息；`ALLOW` 允许发送；无事件规则回退用户偏好；事件为空不查事件规则；`URGENT/PRIVATE/SYSTEM` 保持必达。

- [ ] **Step 2: Run tests to verify failure**

  Run: `mvn -Dtest=SubscriptionServiceTest,SubscriptionControllerTest test`
  Expected: 新增动作断言 FAIL。

- [ ] **Step 3: Implement action and matching**

  增加数据库字段和枚举转换；保存启用规则前检查组合冲突；判定时 `FORCE` 直接返回 true，`DENY` 直接返回 false，`ALLOW` 返回 true；未匹配规则继续调用用户偏好。

- [ ] **Step 4: Run tests**

  Run: `mvn -Dtest=SubscriptionServiceTest,SubscriptionControllerTest test`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/main/java/com/workflow/notification/model/SubscriptionRule.java backend/src/main/java/com/workflow/notification/subscription backend/src/main/java/com/workflow/notification/admin/SubscriptionController.java backend/src/test/java/com/workflow/notification/subscription backend/src/test/java/com/workflow/notification/admin/SubscriptionControllerTest.java
  git commit -m "feat: apply event subscription rule actions"
  ```

---

## Task 7: 新增事件管理前端页面

**Files:**
- Create: `frontend/src/modules/notification/views/admin/EventDefinitionList.vue`
- Create: `frontend/src/modules/notification/api/event.ts`
- Modify: `frontend/src/modules/notification/types/index.ts`
- Modify: `frontend/src/router/index.ts`
- Test: `frontend/src/modules/notification/views/admin/__tests__/EventDefinitionList.test.ts`

**Interfaces:**
- API functions: `getEventDefinitions`, `createEventDefinition`, `updateEventDefinition`, `deleteEventDefinition`, `toggleEventDefinition`。
- Type `EventDefinition` fields: `id`, `eventCode`, `eventName`, `description`, `businessDomain`, `enabled`, `templateCount`, `ruleCount`, `createdAt`。

- [ ] **Step 1: Write failing component/API tests**

  覆盖列表渲染、事件代码格式校验、创建/编辑/启停/删除按钮、引用保护错误提示、API 参数正确传递。

- [ ] **Step 2: Run tests to verify failure**

  Run: `npx vitest run src/modules/notification/views/admin/__tests__/EventDefinitionList.test.ts`
  Expected: FAIL，因为页面和 API 尚未存在。

- [ ] **Step 3: Implement API, types, page and route**

  页面使用现有 `SearchTable`，创建/编辑表单包含事件代码、名称、说明、业务领域；事件代码编辑时不可改变已有代码；删除按钮显示引用冲突；新增 `/messages/events` 路由。

- [ ] **Step 4: Run tests**

  Run: `npx vitest run src/modules/notification`
  Expected: PASS。

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/modules/notification frontend/src/router/index.ts
  git commit -m "feat: add notification event management page"
  ```

---

## Task 8: 改造模板和订阅规则页面

**Files:**
- Modify: `frontend/src/modules/notification/views/admin/SubscriptionRules.vue`
- Modify: `frontend/src/modules/notification/views/admin/TemplateList.vue`
- Modify: `frontend/src/modules/notification/api/admin.ts`
- Modify: `frontend/src/modules/notification/types/index.ts`
- Test: 现有 notification 前端测试及新增页面测试

**Interfaces:**
- 订阅规则提交必须包含 `eventCode`, `channel`, `priority`, `action`, `enable`。
- 模板筛选支持 `eventCode`，模板提交支持 `eventCode`。

- [ ] **Step 1: Write failing UI/API tests**

  覆盖事件下拉只加载启用事件、规则动作显示三种中文标签、模板按事件筛选、错误响应可见。

- [ ] **Step 2: Run tests to verify failure**

  Run: `npx vitest run src/modules/notification`
  Expected: 新增断言 FAIL。

- [ ] **Step 3: Implement page integration**

  订阅规则页面加载 `GET /events?enabled=true`，将事件代码从 input 改为 select，增加动作 select；模板页面同样使用事件 select，展示事件列和筛选条件。

- [ ] **Step 4: Run tests and type check**

  Run: `npx vitest run src/modules/notification`; `npx vue-tsc --noEmit`
  Expected: notification 测试全绿；本次修改相关文件无 TypeScript 错误。其他预先存在的无关错误单独记录。

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/modules/notification
  git commit -m "feat: connect templates and subscription rules to events"
  ```

---

## Task 9: 端到端验证与收尾

**Files:**
- Modify only if verification exposes a defect in the files above.
- Test: all backend and frontend notification tests; migration/menu verification.

- [ ] **Step 1: Run backend full regression**

  Run: `mvn test` from `backend/`。
  Expected: 全部测试通过，重点确认旧的无事件 `sendByTemplate`、公告发布、订阅偏好和 P0 重试链路未回归。

- [ ] **Step 2: Run frontend regression and type check**

  Run: `npx vitest run src/modules/notification`; `npx vue-tsc --noEmit` from `frontend/`。
  Expected: notification 测试全绿；本次相关页面和路由无类型错误。

- [ ] **Step 3: Run real database verification**

  验证以下场景：
  1. admin 创建事件 `FINANCE_URGE`。
  2. 创建 `FINANCE_URGE + SMS + FORCE` 规则。
  3. 用户关闭 SMS 订阅。
  4. 通过 `sendByEvent` 发送 `FINANCE_URGE`。
  5. 结果应为 FORCE 规则允许发送；事件消息携带 `eventCode`。
  6. 停用事件后再次发送应被拒绝。
  7. 公告管理和事件管理都出现在左侧动态菜单，且普通用户访问返回 403。

- [ ] **Step 4: Inspect final changes**

  Run: `git status --short`; `git diff --check`; `git log --oneline -15`。
  Expected: 无未预期文件、无空白错误、提交按功能原子化。

- [ ] **Step 5: Commit any verification-only fix**

  仅当验证确实发现本次实现缺陷时提交修复，提交信息使用仓库已有的 semantic English 风格。

---

## Implementation Order

```text
Task 1  公告动态菜单
  ↓
Task 2  事件实体与持久化
  ↓
Task 3  事件管理 API
  ↓
Task 4  Message/MessageEvent eventCode
  ↓
Task 5  事件-模板绑定
  ↓
Task 6  ALLOW/DENY/FORCE 判定
  ↓
Task 7  事件管理前端
  ↓
Task 8  模板/订阅规则前端
  ↓
Task 9  全量验证
```

每个 Task 完成后先运行其局部测试，再进入下一个 Task；Task 4、5、6 必须按顺序执行，因为发送入口、模板选择和规则判定存在直接依赖。
