# Brainstorm：视图查询设计器（View Designer）与自定义页面

> 变更：query-view-designer
> 日期：2026-08-16
> 方式：superpowers brainstorming 协作讨论（已全程完成）

## Design Summary

用户希望用设计器来设计"列表查询界面"。当前表单设计器发布 BUSINESS 表单时会自动生成物理表（`wf_biz_<formKey>`），而列表查询界面不需要建表——它需要**绑定**已发布表单对应的物理表，只做查询与展示。

**核心结论**：采用"视图 + 自定义页面"双轨方案，两轨共享数据层与 form-create 运行时引擎，发布动作不触发任何 DDL。

- **轨 A 视图（默认）**：字段清单勾选式设计器（ViewDesigner），配置搜索栏/表格列/操作按钮/详情弹窗/事件，发布时**编译为 form-create rule**，覆盖 80% 表格查询场景
- **轨 B 自定义页面（可选）**：复用 `@form-create/designer` 拖拽式设计器（PageDesigner），注册页面组件库（布局/展示/数据组件），绑定数据源 + 原生 on 事件 + 脚本，覆盖 20% 复杂/异形场景
- **数据模型**：独立 `wf_page_def` 表 + `PageDefinition` 实体（不复用 `wf_form_def`）
- **发布行为**：不调用 `DynamicTableManager`、不执行任何 DDL，仅做绑定/字段校验 + 视图编译
- **视图事件**："声明式动作链 + 沙箱脚本"双层机制，脚本沙箱 `ScriptSandbox` 为两轨共享基建

## Alternatives Considered

### 方案 A：扩展 `wf_form_def` 加新 type（VIEW/LIST）
- **做法**：在现有表单定义上增加第三种类型，复用现有列表/权限/版本管理
- **優點**：改动面小，复用现有 CRUD/发布链路
- **缺點**：`publish()` 已多分支，视图语义（绑定一对多、不建表、非表单布局）与表单混杂；历史查询逻辑受牵连
- **為何未採用**：语义混杂导致长期维护成本高，与表单领域解耦更清晰

### 方案 B：仅做声明式视图（ViewDefinition + 独立 ViewRenderer）
- **做法**：新建视图实体，配置只支持表格风格，渲染器单独实现
- **優點**：简单直接，满足 80% 表格场景
- **缺點**：只适合 SearchTable 风格的列表查询界面；卡片/看板/日历等异形风格与复杂交互无法覆盖；独立渲染器多维护一套
- **為何未採用**：无法满足用户"其他风格查询界面 + 自定义事件 + 与表单交互"的扩展性诉求

### 方案 C：视图 + 自定义页面双轨，统一 form-create 运行时（Agreed）
- **做法**：视图为声明式子集（发布编译为 rule），自定义页面为 form-create 拖拽（直接存 rule），两轨共享数据层与 FormRenderer 引擎
- **優點**：统一引擎少维护；视图快速配置、页面自由扩展；新风格只需注册新组件；事件/脚本两轨共享；发布均不建表
- **缺點**：第一期工程量较大（数据模型 + 编译器 + 两个设计器 + 渲染页 + 沙箱）
- **為何採用**：完整覆盖"默认快速查询 + 任意风格自定义 + 事件交互 + 绑定数据源"的全部诉求，且架构扩展路径清晰

## Agreed Approach

采用**方案 C：视图 + 自定义页面双轨，统一 form-create 运行时**。

设计核心：
1. 新建 `wf_page_def` 表（type=VIEW/PAGE、form_key 绑定、schema、版本管理、悲观锁发布）
2. `PageDefinitionService.publish()`：不建表、不执行 DDL；校验绑定表单已发布、引用列存在、搜索字段类型合法；VIEW 触发 `ViewCompiler` 编译
3. 前端：`PageListPage` / `ViewDesigner`（清单勾选）/ `PageDesigner`（form-create 拖拽）/ `PageRenderer`（`/page/:pageKey` 通用渲染）
4. 视图事件双层机制：声明式动作链（openDetail/openLink/refresh/… + `$row`/`$param` 模板变量）+ 沙箱脚本（注入 row/params/ds/api/actions 上下文）
5. 两轨共享：数据层（form_key + 字段白名单 + 查询 API 复用 BizDataService）、ScriptSandbox、FormRenderer
6. 实施分两阶段：阶段一轨 A（视图）先行交付，阶段二轨 B（页面）扩展

## Key Decisions

| 决策点 | 结论 |
|---|---|
| 数据源范围 | 仅已发布 BUSINESS 表单（`wf_biz_<formKey>` 物理表） |
| 配置内容 | 搜索栏 + 表格列 + 操作按钮 + 详情弹窗 |
| 定义模型 | 独立 `wf_page_def` 表 + `PageDefinition` 实体（不复用 `wf_form_def`） |
| 表单↔页面 | 一对多（一个业务表单可配多个查询页面） |
| 消费方式 | 发布后注册菜单 + 通用渲染页（`/page/<pageKey>`） |
| 设计器形态 | 视图轨：字段清单勾选式；页面轨：form-create 拖拽式 |
| 运行时统一 | 视图配置发布时编译为 form-create rule，两轨共用渲染引擎 |
| 视图事件 | "声明式动作链 + 沙箱脚本"双层机制 |
| 脚本沙箱 | 两轨共享同一 ScriptSandbox 基建（补足 PRD 3.2.4 未落地部分） |
| 现有功能 | 不改动 FormDesigner/FormDefinitionService.publish/DynamicTableManager |

## Open Questions

- 阶段二（页面轨）的页面组件库具体首批组件清单，待页面轨启动时确认
- ScriptSandbox 的受限执行实现选型（iframe/Function 包装/worker）在阶段一落地时验证
- 视图事件脚本默认是否开启（安全策略），需产品确认默认关闭、按需开启