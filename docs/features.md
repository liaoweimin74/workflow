# 功能清单

> 能力条目与版本差异说明。随功能变更同步更新。

## 核心能力

### 表单设计器

- 拖拽式表单构建（单行文本、数字、下拉、日期范围、文件上传等核心组件）
- 扩展组件：人员/部门选择、数据引用、子表、嵌套表单、分组容器等
- 表单字段权限（创建时填写 / 审批时查看）

### 流程执行引擎

- 流程定义、发起、审批、驳回、加签/转签、会签/或签、催办、超时处理
- 多租户隔离、流程版本管理

### 列表查询界面（视图/页面双轨）— 新增

- **视图轨（VIEW）**：
  - 页面管理：创建/编辑/发布/删除（DRAFT 可改可删，发布后不可改）
  - 视图设计器：勾选式配置可筛选字段（等值/模糊/范围匹配）、展示列、操作按钮、详情弹窗、事件动作链；绑定区选择数据源（FORM/WORKFLOW），列候选取自数据源 metadata
  - 通用渲染页 `/page/:pageKey`：查询区 + 表格 + 分页 + 操作按钮 + 详情/新增/编辑弹窗；只读数据源（WORKFLOW）自动隐藏写操作按钮，详情以 KV 展示
  - 发布不建表（无 DDL）；存量视图启动时自动迁移（formKey → FORM 数据源并回填 dataSourceId，幂等）
- **页面轨（PAGE，阶段二预留）**：自定义页面设计器 + 多数据源联动
- **事件与脚本**：声明式动作链（open-detail/open-link/open-create/edit/delete/refresh/export/message/set-filter/script），模板变量 `$row.字段` / `$param.参数`，脚本事件沙箱（默认关闭，`VITE_PAGE_SCRIPT_ENABLED=true` 开启）
- **数据源管理**：全局数据源（FORM/WORKFLOW/SYSTEM/API 多态，DRAFT/ENABLED/DISABLED 状态机）
  - **WORKFLOW（工作流表单，只读）**：绑定已发布的工作流表单（非 BUSINESS），跨流程实例聚合 `wf_form_data`；固定 5 系统列（instanceId/processStatus/initiatorName/startTime/currentNodeName）+ 表单 schema 列；不支持写操作（CUD 一律 400 中文提示）；启用校验：表单存在、已发布、非 BUSINESS
  - 存量视图自动迁移：启动时幂等扫描 type=VIEW 且 formKey 非空且 dataSourceId 为空的页面，按命名约定 `<表单名> 数据源` 复用或创建 FORM 数据源并回填（前提 PUBLISHED+BUSINESS，逐页面独立事务）

## 版本差异

| 版本 | 说明 |
| --- | --- |
| 阶段一 | 视图轨端到端可用（页面管理 → 视图设计 → 发布 → 通用渲染），数据源管理页可用（供阶段二消费） |
| 阶段二（规划） | 自定义页面轨（PAGE）+ 多数据源联动（左树右表）、数据源绑定层 dataSources[] 与动作总线 actions |
