## Why

工作流平台后端引擎能力已完整（审批/转办/加签/驳回/会签或签/流程高亮均已实现），前端管理后台框架已就绪，但面向普通用户的两个核心入口——流程发起与任务处理——仅有空壳页面。用户无法在系统中浏览可发起的流程，也无法集中处理待办、查看已办与跟踪自己发起的流程。PRD v1.0 完全缺失这部分需求（v1.1 已补充 3.11/3.12），需在本变更中补齐用户侧能力，使平台从"能设计能运行"进入"能实际使用"。

## What Changes

**流程中心（3.11）**
- From: `ProcessCenterPage.vue` 空壳（el-empty 占位）
- To: 按分类分组展示已部署流程卡片 + 名称搜索 + 点击发起跳转独立发起页
- Reason: 普通用户无流程发起入口
- Impact: non-breaking，新增页面

**发起流程页（3.11.3）**
- From: 不存在
- To: 独立页面 `/process/start/:processDefinitionId`，含流程基本信息 + 流程图预览（折叠）+ 发起表单 + 提交/取消
- Reason: 发起流程需填写表单，独立页面空间充足
- Impact: non-breaking，新增路由

**待办中心（3.12）**
- From: `ProcessTodoPage.vue` 空壳（el-empty 占位）
- To: 待办/已办/我发起的三 Tab 列表，每 Tab 含筛选 + 分页
- Reason: 用户需集中处理任务与跟踪流程
- Impact: non-breaking，改造现有空壳页面

**任务处理详情页（3.12.1）**
- From: 不存在
- To: `/process/todo/:taskId`，标准三段布局（流程信息 + 审批表单 + 意见区）+ 右侧流程跟踪，支持通过/驳回/转办/委派/加签/转签
- Reason: 任务处理需要完整上下文与操作能力
- Impact: non-breaking，新增路由

**后端 API 扩展**
- From: `GET /api/v1/deployed-processes` 仅分页无筛选；`GET /api/tasks` 返回裸 Task 字段；无审批记录时间线 API；无催办 API
- To: 流程列表支持分类/名称/状态筛选；任务列表返回 VO 含关联信息；新增审批记录历史 API；新增催办 API
- Reason: 前端页面所需数据后端无法完整提供
- Impact: non-breaking，扩展参数与返回字段，新增端点

## Capabilities

### New Capabilities

- `process-center`: 流程中心 — 已部署流程的分类分组浏览、搜索、发起入口
- `process-start`: 发起流程 — 独立页面填写发起表单并启动流程实例
- `todo-center`: 待办中心 — 待办/已办/我发起的三视图任务列表与筛选
- `task-detail`: 任务处理详情 — 标准三段布局展示流程信息、审批表单、操作区与流程跟踪
- `process-tracking`: 流程跟踪 — 流程实例的高亮图与审批记录时间线
- `task-remind`: 任务催办 — 对待办审批人发起催办，含频率限制

### Modified Capabilities

（无 — 本变更为纯新增能力，不修改已有 spec 级需求）
