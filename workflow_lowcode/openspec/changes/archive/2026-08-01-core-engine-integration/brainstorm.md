## Design Summary

工作流平台基于 Flowable 8 + Spring Boot 3 + Vue 3 + MySQL，采用模块化单体架构（Maven 多模块），支持多租户。系统提供 BPMN 设计器（bpmn-js + 深度主题定制）、拖拽式表单设计器（插件化组件扩展 + 事件脚本 + 可视化规则）、流程执行引擎（会签/或签/加签/转签/驳回/催办/超时处理）。通过 REST API 集成到其他业务系统，第一期内置用户管理，后续通过 IdentityProvider 接口对接。

本期迭代范围：核心框架 + 引擎集成，即第一阶段——搭建项目骨架、集成 Flowable 引擎、实现基础 REST API、跑通流程全链路、验证多租户。

## Alternatives Considered

### 方案 A：单体应用
- **做法**：一个 Spring Boot 应用 + 一个 Vue 前端，所有功能在一个项目中
- **优点**：开发速度快，部署简单，一个 jar 包
- **缺点**：模块边界模糊，不利于第三方集成
- **为何未采用**：缺乏模块边界，不利于后续拆分和第三方集成

### 方案 B：微服务架构
- **做法**：拆分为多个独立服务（引擎服务、设计服务、管理服务等）
- **优点**：独立扩展、故障隔离、适合大团队
- **缺点**：开发周期长 2-3 倍，部署运维复杂
- **为何未采用**：对当前阶段过度设计

### 方案 C：模块化单体（Agreed）
- **做法**：物理上单体部署，逻辑上分 Maven 多模块（workflow-api / workflow-core / workflow-model / workflow-starter / workflow-app / workflow-ui）
- **优点**：开发快，模块边界清晰，Starter 模式方便第三方集成，保留拆分微服务能力
- **为何未采用**：N/A — 这是选定方案

## Agreed Approach

模块化单体架构，Maven 多模块。`workflow-starter` 提供 Spring Boot 自动配置，第三方系统引入后即可使用引擎能力；`workflow-api` 提供 REST API。第一期先做核心框架 + 引擎集成。

## Key Decisions

1. **技术栈**：Spring Boot 3 + Flowable 8 + Vue 3 + Element Plus + MySQL + Maven
2. **架构**：模块化单体（Maven 多模块），非微服务
3. **多租户**：逻辑隔离（共享数据库，tenantId 字段），请求头 `X-Tenant-Id` 传递
4. **集成方式**：REST API + workflow-starter 自动配置
5. **用户/组织对接**：第一期 local 模式（自建表），预留 IdentityProvider 接口
6. **用户权限**：RBAC（超级管理员 / 租户管理员 / 流程设计者 / 普通用户）
7. **BPMN 设计器**：bpmn-js + 深度主题定制（现代美观风格）
8. **表单设计器**：拖拽式 + 插件化组件扩展 + 事件脚本（前端沙箱） + 可视化规则
9. **通知**：第一期站内信，预留外部渠道接口
10. **驳回**：第一期驳回到发起人+重新提交，第二期驳回到任意节点
11. **后端逻辑**：支持调用外部 API / 调用本系统 Bean / 执行脚本三种方式
12. **部署**：jar + Docker + Docker Compose

## Open Questions

- 文件上传存储方式：本地 vs 对象存储（第一期可先本地）
- 通知推送方式：轮询 vs WebSocket（第一期可先轮询）
- 多租户用户注册方式：管理员创建 vs 自助注册（第一期管理员创建）