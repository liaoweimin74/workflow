# 数据源自动创建功能实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 实现业务表单创建时自动创建数据源，系统结构数据源在系统初始化时自动创建，并将数据源管理界面调整为只读模式。

**Architecture:** 采用Spring事件机制实现事件驱动同步，通过ApplicationEvent在业务表单创建/修改/删除时自动同步数据源。系统结构数据源通过SystemDataSourceInitializer在系统启动时自动创建。

**Tech Stack:** Spring Boot, Spring Event, Vue 3, Element Plus, MySQL

---

## Task 1: 后端事件机制实现

- [ ] **Step 1:** 创建 Spring 事件类
  - 创建 `FormCreatedEvent` 类，继承 `ApplicationEvent`
  - 创建 `FormUpdatedEvent` 类，继承 `ApplicationEvent`
  - 创建 `FormDeletedEvent` 类，继承 `ApplicationEvent`
  - 事件类包含业务表单ID、表单名称等必要信息

- [ ] **Step 2:** 创建事件监听器
  - 创建 `DataSourceSyncListener` 类，使用 `@EventListener` 注解
  - 监听 `FormCreatedEvent` 事件，自动创建 FORM 类型数据源
  - 监听 `FormUpdatedEvent` 事件，自动更新数据源配置
  - 监听 `FormDeletedEvent` 事件，自动删除数据源

- [ ] **Step 3:** 在 FormService 中发布事件
  - 在 `createForm` 方法中发布 `FormCreatedEvent`
  - 在 `updateForm` 方法中发布 `FormUpdatedEvent`
  - 在 `deleteForm` 方法中发布 `FormDeletedEvent`

- [ ] **Step 4:** 创建系统初始化器
  - 创建 `SystemDataSourceInitializer` 类，使用 `@PostConstruct` 注解
  - 在系统启动时检查并创建 dept-tree 和 user-tree 数据源
  - 确保数据源状态为 ENABLED，用户不可修改

## Task 2: 数据源管理接口调整

- [ ] **Step 1:** 移除数据源创建接口
  - 删除 `DataSourceController` 中的 `createDataSource` 方法
  - 删除对应的 REST 接口 `POST /api/v1/data-sources`

- [ ] **Step 2:** 移除数据源编辑接口
  - 删除 `DataSourceController` 中的 `updateDataSource` 方法
  - 删除对应的 REST 接口 `PUT /api/v1/data-sources/{id}`

- [ ] **Step 3:** 移除数据源删除接口
  - 删除 `DataSourceController` 中的 `deleteDataSource` 方法
  - 删除对应的 REST 接口 `DELETE /api/v1/data-sources/{id}`

- [ ] **Step 4:** 保留数据源查看接口
  - 保留 `getDataSourceList` 方法和 `GET /api/v1/data-sources` 接口
  - 保留 `getDataSourceById` 方法和 `GET /api/v1/data-sources/{id}` 接口

- [ ] **Step 5:** 添加数据源只读校验
  - 在保留的接口中添加只读校验逻辑
  - 拒绝创建、编辑、删除操作，返回错误信息

## Task 3: 数据库结构调整

- [ ] **Step 1:** 修改数据源表结构
  - 在 `wf_data_source` 表中添加 `form_id` 字段
  - 设置字段类型为 VARCHAR(64)，可为空
  - 添加注释：关联的业务表单ID

- [ ] **Step 2:** 创建数据迁移脚本
  - 编写 Flyway 迁移脚本，将现有手动创建的数据源转换为自动管理模式
  - 为现有 FORM 类型数据源关联对应的业务表单

- [ ] **Step 3:** 更新数据源表索引
  - 为 `form_id` 字段添加索引
  - 更新 `wf_data_source` 表的索引信息

## Task 4: 前端界面调整

- [ ] **Step 1:** 修改数据源管理页面
  - 在 `DataSourceListPage` 组件中移除新增、删除、编辑按钮
  - 保留查看按钮，点击后显示数据源详情

- [ ] **Step 2:** 修改数据源详情页面
  - 在 `DataSourceDetailPage` 组件中将所有字段设置为只读
  - 显示数据源由系统自动管理的提示信息

- [ ] **Step 3:** 修改业务表单页面
  - 在业务表单详情页面中显示关联的数据源信息
  - 数据源信息设置为只读，不可编辑

- [ ] **Step 4:** 添加数据源状态提示
  - 在数据源管理页面添加提示信息："数据源由系统自动管理，不支持手动操作"
  - 在数据源详情页面添加状态说明

## Task 5: 测试与验证

- [ ] **Step 1:** 单元测试
  - 为 `DataSourceSyncListener` 编写单元测试
  - 为 `SystemDataSourceInitializer` 编写单元测试
  - 测试事件监听器的正确性

- [ ] **Step 2:** 集成测试
  - 测试业务表单创建时自动创建数据源的完整流程
  - 测试业务表单修改时自动更新数据源
  - 测试业务表单删除时自动删除数据源

- [ ] **Step 3:** 接口测试
  - 验证数据源管理接口的只读限制
  - 测试拒绝创建、编辑、删除操作

- [ ] **Step 4:** 界面测试
  - 验证前端界面的只读模式
  - 测试用户无法执行新增、删除、编辑操作

- [ ] **Step 5:** 性能测试
  - 测试事件同步机制对系统性能的影响
  - 验证在高并发场景下的性能表现