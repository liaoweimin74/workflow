## Context

本项目是一个工作流平台，基于 Flowable 8 + Spring Boot 3 + Vue 3 + MySQL，采用模块化单体架构。本期迭代（第一阶段）的目标是搭建项目骨架、集成 Flowable 引擎、实现基础 REST API、跑通流程全链路、验证多租户机制。

当前状态：项目仅包含初始化的配置文件（PRD、AGENTS.md、.editorconfig 等），无任何代码。

## Goals / Non-Goals

**Goals:**
- Maven 多模块项目结构搭建，模块间依赖关系清晰
- Flowable 8 引擎集成，配置多租户模式
- 核心引擎服务封装（ProcessService、TaskService、IdentityService）
- 多租户上下文传递机制（TenantProvider、TenantInterceptor）
- 基础 REST API（流程定义 CRUD/部署、流程实例启动/终止、任务查询/完成）
- workflow-starter 自动配置模块，第三方项目引入即用
- Flyway 数据库迁移脚本（Flowable 表 + 自定义表）
- 可独立运行的 workflow-app 模块
- 单元测试验证核心链路

**Non-Goals:**
- 前端 UI（第二阶段）
- BPMN 设计器（第三阶段）
- 表单设计器（第四阶段）
- 通知、审计日志、统计（后续阶段）
- 流程驳回、会签、加签等高级功能（后续阶段）

## Decisions

### 1. Maven 模块结构

```
workflow-platform/
├── workflow-api/                  # REST API 层
├── workflow-core/                 # 引擎核心实现
├── workflow-model/                # 实体、DTO、Repository
├── workflow-starter/              # Spring Boot 自动配置
├── workflow-app/                  # 可独立部署的聚合应用
└── pom.xml                        # 父 POM
```

**理由**：模块化单体架构，业务边界清晰，workflow-api 和 workflow-starter 作为第三方集成入口，保留拆分微服务能力。

### 2. Flowable 多租户配置

使用 Flowable 的 ProcessEngineConfiguration 配置多租户：
- 每个请求通过 `X-Tenant-Id` Header 传递租户 ID
- `TenantInterceptor` 提取租户 ID 存入 `ThreadLocal<TenantContext>`
- 所有引擎操作通过 `TenantProvider` 自动注入 `tenantId`
- 查询时通过 `processDefinitionTenantId()` 等 API 自动过滤

**理由**：Flowable 原生支持 tenantId 字段，应用层实现租户上下文传递，不需要修改引擎源码。

### 3. 自定义表使用 Flyway 管理

Flowable 原生表由 Flowable 自动管理，自定义业务表（wf_user、wf_role 等）通过 Flyway 管理迁移。

**理由**：Flowable 表结构由 Flowable 版本决定，自定义表需要版本可控。

### 4. workflow-starter 自动配置

提供 `@EnableWorkflowEngine` 注解或 `META-INF/spring/*.imports` 自动配置：
- 自动配置 Flowable ProcessEngine
- 自动注册 TenantInterceptor
- 自动扫描自定义 ComponentHandler

**理由**：第三方项目引入 `workflow-starter` 依赖即可使用引擎，无需手动配置。

### 5. 自定义 IdentityService

不使用 Flowable 自带的 `ACT_ID_*` 表，通过自定义 `IdentityService` 实现，用户数据从 `wf_user`/`wf_role` 表读取。

**理由**：用户体系由业务系统控制，不与 Flowable 的身份表耦合，方便后续对接外部系统。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| Flowable 8 版本较新，文档和社区资源可能不足 | 依赖官方文档和源码，关键路径编写集成测试验证 |
| 多租户下数据隔离可能遗漏某些查询 | 统一通过 TenantProvider 封装查询条件，代码审查时重点检查 |
| Maven 多模块首次搭建存在依赖版本冲突 | 统一在父 POM 管理依赖版本，使用 BOM 方式管理 Flowable 依赖 |
| Flyway 与 Flowable 自动建表可能存在冲突 | 配置 Flyway 跳过 Flowable 的表（使用 `flyway.table` 或 `flyway.locations` 隔离） |
| ThreadLocal 在多线程环境下可能泄漏租户上下文 | 在请求完成过滤器（AfterCompletion）中清理，异步任务显式传递租户 ID |