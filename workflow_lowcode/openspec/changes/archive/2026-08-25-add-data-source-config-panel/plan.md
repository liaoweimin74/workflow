# DataSourceConfigPanel Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 创建通用的数据源配置面板组件，让所有设计器都能使用统一的数据源配置功能。

**Architecture:** 创建 `DataSourceConfigPanel.vue` 组件，提供数据源绑定配置界面。组件通过 Props 接收当前配置和全局数据源列表，通过 Emits 通知配置变更。保持现有的页面内数据源 → 全局数据源的绑定方式不变。

**Tech Stack:** Vue 3 Composition API, TypeScript, Element Plus

---

## Task 1: 创建 DataSourceConfigPanel 组件

- [ ] **Step 1:** 创建组件文件 `frontend/src/components/business/DataSourceConfigPanel.vue`
- [ ] **Step 2:** 定义组件 Props 接口（dataSources, enabledDataSources）
- [ ] **Step 3:** 定义组件 Emits 接口（update:dataSources）
- [ ] **Step 4:** 实现数据源绑定列表的渲染
- [ ] **Step 5:** 实现添加数据源绑定功能
- [ ] **Step 6:** 实现删除数据源绑定功能
- [ ] **Step 7:** 实现页面内标识编辑功能
- [ ] **Step 8:** 实现全局数据源选择功能
- [ ] **Step 9:** 实现数据验证逻辑
- [ ] **Step 10:** 实现配置变更事件触发

## Task 2: 集成到页面设计器

- [ ] **Step 1:** 修改 `PageDesigner.vue`，引入 DataSourceConfigPanel 组件
- [ ] **Step 2:** 替换现有的数据源配置弹窗为新组件
- [ ] **Step 3:** 保持现有数据源配置逻辑不变
- [ ] **Step 4:** 测试页面设计器的数据源配置功能

## Task 3: 编写测试用例

- [ ] **Step 1:** 编写组件单元测试
- [ ] **Step 2:** 测试添加数据源绑定功能
- [ ] **Step 3:** 测试删除数据源绑定功能
- [ ] **Step 4:** 测试数据验证逻辑
- [ ] **Step 5:** 测试事件触发功能

## Task 4: 文档和示例

- [ ] **Step 1:** 编写组件使用文档
- [ ] **Step 2:** 提供集成示例代码
- [ ] **Step 3:** 更新项目文档
