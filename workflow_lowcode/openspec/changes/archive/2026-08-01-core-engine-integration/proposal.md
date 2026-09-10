## Why

工作流平台需要从零开始搭建，第一期（核心框架 + 引擎集成）是整个系统的基础。没有这一层，后续的 BPMN 设计器、表单设计器、管理 UI 都无法运行。需要建立 Maven 多模块项目结构，集成 Flowable 8 引擎，实现多租户机制和基础 REST API，确保第三方系统可以通过 API 集成。

## What Changes

- 创建 Maven 多模块项目骨架（6 个模块）
- Flowable 8 引擎集成与配置
- 多租户上下文传递机制
- 核心引擎服务（ProcessService、TaskService、IdentityService）
- 基础 REST API（流程定义 CRUD/部署、流程实例启动/终止、任务查询/完成）
- workflow-starter 自动配置模块
- Flyway 数据库迁移脚本
- 可独立运行的 workflow-app
- 单元测试验证核心链路

## Capabilities

### New Capabilities

- **multi-tenant-engine** — 多租户 Flowable 引擎配置和租户上下文管理
- **process-definition-api** — 流程定义 CRUD 和部署的 REST API
- **process-instance-api** — 流程实例启动、终止、挂起/恢复的 REST API
- **task-api** — 任务查询、签收、完成的 REST API
- **engine-starter** — Spring Boot Starter 自动配置，第三方集成入口
- **identity-local** — 内置用户/角色/部门管理

## Impact

- 新增约 6 个 Maven 模块
- 依赖 Flowable 8.0.0+、Spring Boot 3.x、Spring Data JPA、Flyway、MySQL
- 新增 Flowable 原生表（ACT_*）和自定义业务表（wf_*）
- REST API 前缀 `/api/v1/`，所有请求需携带 `X-Tenant-Id` Header
- 第三方系统引入 `workflow-starter` 依赖即可使用引擎能力