# 工作流平台需求规格说明书

> 版本：v1.0  
> 日期：2026-08-01  
> 状态：初稿

---

## 1. 概述

### 1.1 项目目标

基于 Flowable 最新版本（8.0.0+）开发一个完整的工作流系统，包含前后端应用。系统提供工作流设计器、表单设计器、流程执行引擎，并支持方便地集成到其他业务系统中。

### 1.2 核心能力

- **流程设计**：浏览器端拖拽式 BPMN 2.0 流程设计
- **表单设计**：拖拽式表单构建器，支持复杂字段类型和组件扩展
- **流程执行**：基于 Flowable 的流程引擎，完整的流程生命周期管理
- **系统集成**：REST API 方式集成，支持多租户

### 1.3 技术栈

| 层级 | 技术 | 版本 |
|---|---|---|
| 后端框架 | Spring Boot | 3.x |
| 流程引擎 | Flowable | 8.0.0+ |
| 前端框架 | Vue | 3.x |
| UI 库 | Element Plus | 最新 |
| 构建工具 | Vite | 最新 |
| 数据库 | MySQL | 8.x |
| 项目构建 | Maven | 多模块 |

---

## 2. 系统架构

### 2.1 模块化单体架构

物理上单体部署，逻辑上分为多个 Maven 模块，保留后续拆分微服务的能力。

```
workflow-platform/
├── workflow-api/                  # 对外 REST API
│   ├── controller/                # REST 控制器
│   ├── dto/                       # 请求/响应 DTO
│   └── interceptor/               # 多租户拦截器
│
├── workflow-core/                 # 引擎核心
│   ├── engine/                    # Flowable 引擎封装
│   │   ├── ProcessService         # 流程部署/启动/管理
│   │   ├── TaskService            # 任务处理
│   │   └── IdentityService        # 用户/组管理
│   ├── form/                      # 表单引擎
│   │   ├── FormService            # 表单渲染/提交
│   │   └── FormDataHandler        # 表单数据与流程变量映射
│   ├── tenant/                    # 多租户
│   │   ├── TenantProvider         # 租户上下文
│   │   └── ProcessTenantFilter    # 流程数据租户过滤
│   ├── notification/              # 通知中心
│   ├── listener/                  # 流程/任务监听器
│   └── config/                    # Flowable 配置
│
├── workflow-model/                # 通用领域模型
│   ├── entity/                    # JPA 实体
│   ├── enums/                     # 枚举
│   └── repository/                # 数据访问层
│
├── workflow-starter/              # Spring Boot Starter
│   ├── autoconfigure/             # 自动配置
│   └── properties/                # 配置属性
│
├── workflow-app/                  # 可独立部署的聚合应用
│   ├── WorkflowApplication.java
│   ├── config/                    # 全局配置
│   └── resources/
│       ├── application.yml
│       └── db/migration/          # Flyway 迁移脚本
│
├── workflow-ui/                   # Vue 3 前端
│   ├── views/
│   │   ├── designer/              # BPMN 设计器
│   │   ├── form-builder/          # 表单设计器
│   │   ├── process/               # 流程管理
│   │   └── admin/                 # 系统管理
│   ├── components/                # 通用组件
│   ├── api/                       # API 客户端
│   └── store/                     # Pinia 状态管理
│
└── pom.xml                        # 父 POM
```

### 2.2 模块职责

| 模块 | 职责 | 对外暴露 |
|---|---|---|
| `workflow-api` | REST API 接口层，定义所有对外端点 | 可独立发布为 jar |
| `workflow-core` | 引擎核心实现，封装 Flowable 操作 | 不暴露给外部 |
| `workflow-model` | 实体、枚举、DTO、Repository | 所有模块依赖 |
| `workflow-starter` | Spring Boot 自动配置，第三方集成入口 | 第三方项目引入 |
| `workflow-app` | 聚合应用，可独立部署运行 | 部署产物 |
| `workflow-ui` | Vue 3 前端管理界面 | 独立部署 / Nginx |

### 2.3 集成方式

第三方系统通过 REST API 集成，也可以通过引入 `workflow-starter` 依赖获得自动配置的引擎 Bean。

---

## 3. 多租户

### 3.1 隔离策略

采用**逻辑隔离**（共享数据库，tenantId 字段区分数据归属）。

| 数据 | 隔离方式 |
|---|---|
| 流程定义（BPMN） | Flowable 原生 `TENANT_ID_` 字段 |
| 流程实例/任务 | Flowable 原生 `TENANT_ID_` 字段 |
| 表单定义 | 自定义表 `wf_form_def.tenant_id` |
| 用户/角色 | 自定义表 `wf_user.tenant_id` / `wf_role.tenant_id` |
| 审计日志 | 自定义表 `wf_audit_log.tenant_id` |
| 通知 | 自定义表 `wf_notification.tenant_id` |

### 3.2 租户上下文传递

```
请求 → HTTP Header: X-Tenant-Id → TenantInterceptor → TenantContext(ThreadLocal)
```

所有引擎操作通过 `TenantProvider` 自动注入当前租户 ID。

### 3.3 关键实现点

```java
// 部署流程时注入 tenantId
repositoryService.createDeployment()
    .tenantId(tenantContext.getTenantId())
    .addBpmnModel(...)
    .deploy();

// 查询时自动过滤
repositoryService.createProcessDefinitionQuery()
    .processDefinitionTenantId(tenantContext.getTenantId())
    .list();

// 启动流程时指定 tenant
runtimeService.startProcessInstanceByKeyAndTenantId(
    processKey, variables, tenantContext.getTenantId()
);
```

---

## 4. BPMN 设计器

### 4.1 技术选型

基于 **bpmn-js** 构建，深度定制主题以呈现现代美观的视觉风格。

| 组件 | 用途 |
|---|---|
| `bpmn-js` | BPMN 2.0 模型编辑器核心 |
| `bpmn-js-properties-panel` | 元素属性编辑面板 |
| `bpmn-js-token-simulation` | 流程模拟 |
| `bpmnlint` | 流程合规性校验 |
| `diagram-js-minimap` | 小地图导航 |

### 4.2 功能范围

- 拖拽绘制流程图（开始/结束事件、用户任务、网关、子流程、泳道等）
- 节点属性编辑（名称、负责人、候选人/候选角色、过期时间、表单绑定）
- 连线条件编辑
- 导入/导出 BPMN XML
- 流程模拟预览
- 撤销/重做
- 键盘快捷键
- 小地图导航
- 中文语言包

### 4.3 主题定制

覆盖默认 SVG 样式，实现圆角卡片、柔和阴影、现代配色方案的设计风格。

### 4.4 流程定义数据库表

```sql
CREATE TABLE wf_process_def (
    id            VARCHAR(64) PRIMARY KEY,
    tenant_id     VARCHAR(64) NOT NULL,
    name          VARCHAR(255),
    process_key   VARCHAR(255),
    version       INT DEFAULT 1,
    category_id   VARCHAR(64),
    bpmn_xml      LONGTEXT,
    form_ids      VARCHAR(1024),    -- 关联的表单 ID 列表
    status        VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT / DEPLOYED / SUSPENDED
    deploy_id     VARCHAR(64),      -- Flowable 部署 ID
    proc_def_id   VARCHAR(64),      -- Flowable 流程定义 ID
    description   TEXT,
    created_by    VARCHAR(64),
    created_at    DATETIME,
    updated_at    DATETIME,
    UNIQUE KEY uk_tenant_version (tenant_id, process_key, version),
    INDEX idx_tenant (tenant_id)
);
```

---

## 5. 表单设计器

### 5.1 前端架构

```
form-builder/
├── core/
│   ├── FormEngine.ts              # 表单引擎核心
│   ├── ComponentRegistry.ts       # 组件注册表
│   └── interfaces.ts              # 组件接口定义
├── built-in/                      # 内置组件
│   ├── InputWidget.ts
│   ├── SelectWidget.ts
│   ├── DatePickerWidget.ts
│   └── ...
├── custom/                        # 用户自定义组件
├── components/
│   ├── FormDesigner.vue           # 设计器主容器
│   ├── FormRenderer.vue           # 运行时表单渲染器
│   ├── ComponentPanel.vue         # 左侧组件面板
│   ├── Canvas.vue                 # 中间拖拽画布
│   └── PropertyPanel.vue          # 右侧属性编辑面板
└── store/
    └── formStore.ts
```

### 5.2 内置组件

**第一期实现（核心组件）：**

| 组件 | 说明 |
|---|---|
| 单行文本 | 支持前缀/后缀、占位提示 |
| 多行文本 | 支持高度调整 |
| 数字输入 | 支持整数/小数、最大/最小值 |
| 下拉选择 | 单选，支持搜索、级联 |
| 多选下拉 | 多选，支持全选 |
| 单选 | 选项组 |
| 多选 | 多选项组 |
| 日期 | 年月日选择 |
| 日期范围 | 起止日期范围 |
| 文件上传 | 单文件/多文件上传 |

**第二期实现（扩展组件）：**

| 组件 | 说明 |
|---|---|
| 人员选择 | 从组织架构选择用户 |
| 部门选择 | 从组织架构选择部门 |
| 数据引用（data-picker） | 从业务表/表单/外部 API 选取数据 |
| 表格（子表） | 动态行，每行含多个字段，支持公式计算 |
| 嵌套表单 | 内联子表单字段 |
| 分组容器 | 字段分组，支持折叠 |
| 分割线 | 视觉分隔 |
| 自动编号 | 基于规则自动生成编号 |
| 富文本 | HTML 内容编辑 |
| 开关 | 布尔值切换 |
| 评分 | 星级评分 |
| 地址 | 省市区级联 |

### 5.3 组件扩展机制

组件通过**插件化注册**方式扩展，无需修改核心代码。

```typescript
// 组件接口定义
interface FormComponentDefinition {
  type: string;                    // 组件类型标识
  name: string;                    // 显示名称
  icon: string;                    // 图标
  category: string;                // 分组：basic / advanced / layout
  designerComponent: Component;    // 设计器预览组件
  rendererComponent: Component;    // 运行时渲染组件
  defaultProps: () => Record<string, any>;  // 默认属性
  propertySchema: PropertySchema;  // 属性配置面板定义
  formatValue?: (value: any, props: any) => any;  // 值格式化
  validate?: (value: any, props: any) => string | null;  // 校验
}

// 注册方式
FormEngine.registerComponent('auto-number', AutoNumberWidget);
```

后端对称支持：

```java
public interface ComponentHandler {
    String getType();
    Object handle(ComponentContext ctx);
}
```

前后端通过 `type` 字段关联。

### 5.4 组件属性配置

每个组件的属性面板动态生成，按组件类型展示不同配置项。

属性分组示例：
- **基本属性**：字段标识（key）、显示名称、占位提示、默认值、栅格占位
- **校验规则**：必填、最小值/最大值、正则表达式、自定义校验
- **高级属性**：数据源配置、条件显隐规则、事件脚本
- **样式属性**：宽度、高度、自定义 CSS 类名

### 5.5 事件脚本

组件支持在前端执行 JavaScript 脚本，用于控制交互行为。

**支持的事件钩子：**

| 事件 | 触发时机 | 用途 |
|---|---|---|
| `onInit` | 字段初始化时 | 设置默认值、加载初始数据 |
| `onChange` | 字段值变化时 | 联动计算、显隐控制、值校验 |
| `onBlur` | 字段失去焦点时 | 数据校验、格式化 |
| `onVisible` | 字段可见性变化时 | 加载数据、重置值 |

**脚本沙箱 API：**

```javascript
// 脚本中可用的上下文 API
this.getValue('fieldKey')            // 获取其他字段值
this.setValue('fieldKey', value)     // 设置其他字段值
this.setVisible('fieldKey', bool)    // 控制字段显隐
this.setRequired('fieldKey', bool)   // 控制字段必填
this.setOptions('fieldKey', [...])   // 动态设置选项
this.setDisabled('fieldKey', bool)   // 控制字段禁用
this.getFormData()                   // 获取整个表单数据
this.resetField('fieldKey')          // 重置字段值
this.formatDate(value, format)       // 日期格式化工具
```

**安全措施：**
- 脚本在沙箱中执行，无 DOM 访问权限
- 设置执行超时（5 秒）和调用次数限制
- 单个脚本异常不影响其他字段
- 提供脚本测试运行面板和执行日志

### 5.6 可视化规则配置

常用联动场景提供可视化配置，降低 JS 编写门槛。

**规则类型：**
- **显隐规则**：当字段 A = 值 X 时，显示/隐藏字段 B
- **计算规则**：字段 C = 字段 A + 字段 B
- **校验规则**：自定义校验条件
- **选项过滤**：当字段 A = 值 X 时，字段 B 的选项限制为特定集合

### 5.7 数据源引用

`data-picker` 组件支持从以下来源选取数据：

| 数据源类型 | 说明 |
|---|---|
| `TABLE` | 本系统业务表（配置表名+字段） |
| `FORM` | 本系统其他工作流表单实例 |
| `API` | 外部系统 REST API |

支持级联联动（如先选部门，再选项目时只显示该部门项目）。

### 5.8 表单字段权限

**第一期（简单版）：** 字段区分"创建时填写"和"审批时查看"两种模式。

**第二期（完整版）：** 细粒度角色控制，支持按角色配置字段的可见/可编辑权限。

### 5.9 表单定义数据库表

```sql
CREATE TABLE wf_form_def (
    id            VARCHAR(64) PRIMARY KEY,
    tenant_id     VARCHAR(64) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    description   VARCHAR(1024),
    schema_json   JSON NOT NULL,       -- JSON Schema
    ui_schema     JSON,                -- UI 布局配置
    version       INT DEFAULT 1,
    status        VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT / PUBLISHED
    created_by    VARCHAR(64),
    created_at    DATETIME,
    updated_at    DATETIME,
    INDEX idx_tenant (tenant_id)
);

CREATE TABLE wf_form_instance (
    id              VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    form_def_id     VARCHAR(64) NOT NULL,
    process_inst_id VARCHAR(64),
    task_id         VARCHAR(64),
    form_data       JSON NOT NULL,
    submitted_by    VARCHAR(64),
    submitted_at    DATETIME,
    INDEX idx_tenant_process (tenant_id, process_inst_id)
);
```

### 5.10 表单 → 流程变量映射

表单字段的 `key` 自动成为 Flowable 流程变量名，提交值自动映射为变量值。

---

## 6. REST API

### 6.1 API 分组

| 分组 | 前缀 | 说明 |
|---|---|---|
| 流程定义 | `/api/v1/process-definitions` | CRUD、部署、版本管理 |
| 流程实例 | `/api/v1/process-instances` | 启动、终止、挂起/恢复、高亮图 |
| 任务 | `/api/v1/tasks` | 待办/已办、审批、转办、委派、催办 |
| 表单定义 | `/api/v1/form-definitions` | CRUD、发布、版本管理 |
| 表单实例 | `/api/v1/form-instances` | 提交、查询 |
| 数据源 | `/api/v1/data-sources` | 数据源查询接口 |
| 通知 | `/api/v1/notifications` | 站内信查询、已读 |
| 身份认证 | `/api/v1/auth` | 登录、JWT |
| 用户/组织 | `/api/v1/identity` | 用户、角色、部门管理 |
| 系统管理 | `/api/v1/admin` | 租户管理、配置、审计日志 |
| 统计 | `/api/v1/statistics` | 流程统计、任务效率 |

### 6.2 核心接口

**流程定义：**
```
GET    /api/v1/process-definitions                    # 列表（分页）
POST   /api/v1/process-definitions                     # 创建/保存草稿
PUT    /api/v1/process-definitions/{id}                # 更新
POST   /api/v1/process-definitions/{id}/deploy         # 部署到引擎
DELETE /api/v1/process-definitions/{id}                 # 删除
GET    /api/v1/process-definitions/{id}/xml             # 获取 BPMN XML
POST   /api/v1/process-definitions/{id}/copy            # 复制流程
```

**流程实例：**
```
POST   /api/v1/process-instances                        # 启动流程
GET    /api/v1/process-instances                        # 列表（分页）
POST   /api/v1/process-instances/{id}/suspend           # 挂起
POST   /api/v1/process-instances/{id}/resume            # 恢复
POST   /api/v1/process-instances/{id}/terminate         # 终止
GET    /api/v1/process-instances/{id}/diagram           # 流程图高亮
```

**任务：**
```
GET    /api/v1/tasks                                     # 待办列表
GET    /api/v1/tasks/historic                            # 已办列表
POST   /api/v1/tasks/{id}/claim                          # 签收
POST   /api/v1/tasks/{id}/complete                       # 完成（提交表单）
POST   /api/v1/tasks/{id}/reject                         # 驳回（退回发起人）
POST   /api/v1/tasks/{id}/transfer                       # 转办
POST   /api/v1/tasks/{id}/delegate                       # 委派
POST   /api/v1/tasks/{id}/urge                           # 催办
```

### 6.3 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "req-uuid-xxx"
}
```

### 6.4 分页响应

```json
{
  "code": 0,
  "data": {
    "records": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

### 6.5 请求头

```
X-Tenant-Id: tenant-xxx
Authorization: Bearer <jwt-token>
```

---

## 7. 用户权限与组织架构

### 7.1 角色体系

| 角色 | 范围 | 权限 |
|---|---|---|
| 超级管理员 | 平台级 | 管理所有租户、系统配置 |
| 租户管理员 | 租户级 | 管理本租户用户/角色/权限 |
| 流程设计者 | 租户级 | 设计/编辑/部署流程、设计/发布表单 |
| 普通用户 | 租户级 | 发起流程、处理任务 |

### 7.2 权限模型

RBAC（基于角色的访问控制），模块级 + 操作级权限粒度。

**权限模块：**
- 流程管理：查看、创建、编辑、删除、部署
- 表单管理：查看、创建、编辑、删除、发布
- 任务处理：查看、处理、转办、委派
- 系统管理：用户管理、角色管理、租户管理
- 审计日志：查看、导出
- 统计分析：查看

### 7.3 用户/组织对接

**第一期（内置模式）：** 系统自建 `wf_user`、`wf_dept`、`wf_role` 表，内置用户管理功能。

**后续（对接模式）：** 预留 `IdentityProvider` 接口，业务系统实现回调 API 提供用户/组织数据。工作流系统在需要时调用业务系统接口获取，支持本地缓存兜底。

```java
public interface IdentityProvider {
    UserInfo getUser(String userId);
    List<UserInfo> listUsers(String deptId, int page, int size);
    DeptInfo getDept(String deptId);
    List<DeptInfo> listDepts(String parentId);
    List<String> getUserRoles(String userId);
    List<UserInfo> getUsersByRole(String roleCode);
}
```

### 7.4 与 Flowable 身份体系的关系

不使用 Flowable 自带的 `ACT_ID_*` 表，通过自定义 `IdentityService` 实现映射，用户体系完全由业务系统控制。

---

## 8. 流程引擎功能

### 8.1 基础能力

- 流程定义部署/激活/挂起
- 流程实例启动/挂起/恢复/终止
- 任务签收/完成/转办/委派
- 流程变量管理
- 流程图高亮跟踪

### 8.2 会签与或签

Flowable 原生 `multiInstanceLoopCharacteristics` 支持：

- **会签（全部通过）**：`sequential` 或 `parallel` 模式，所有审批人通过才通过
- **或签（一人通过）**：任一审批人通过即通过

### 8.3 加签与转签

- **加签**：当前审批人临时增加其他审批人共同审批
- **转签**：当前审批人将审批权转给他人

### 8.4 驳回

**第一期（基础版）：** 驳回到发起人，发起人修改后重新提交。
- 驳回时记录驳回原因
- 重新提交后流程从驳回节点继续流转

**第二期（增强版）：** 驳回到任意历史节点（计入需求，暂缓实现）。

### 8.5 催办

- 发起人可手动点击催办
- 同任务催办间隔限制（如 30 分钟）
- 记录催办次数

### 8.6 超时处理

系统级定时扫描，非 BPMN 原生方式：

- 可配置超时规则（按任务定义 key）
- 超时后自动发送通知
- 超时升级：自动转给上级或指定审批人
- 扫描间隔可配置

---

## 9. 通知机制

### 9.1 通知场景

| 场景 | 触发时机 | 接收方 |
|---|---|---|
| 新任务待办 | 创建任务 | 审批人 |
| 任务催办 | 发起人催办 | 审批人 |
| 任务超时 | 超过设定时间 | 审批人 |
| 超时升级 | 超时后升级 | 上级/指定人 |
| 审批结果 | 流程通过/驳回/完成 | 发起人 |
| 加签通知 | 被加签 | 被加签人 |

### 9.2 通知渠道

**第一期：** 站内信（系统内置通知中心）

**第二期/按需：** 预留 `NotificationChannel` 接口，支持邮件、企业微信、钉钉等。

### 9.3 通知模板

可配置的模板，支持变量替换。

### 9.4 数据库表

```sql
CREATE TABLE wf_notification (
    id              VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    recipient_id    VARCHAR(64) NOT NULL,
    type            VARCHAR(32) NOT NULL,   -- task_assign / urge / timeout / escalate / result
    title           VARCHAR(512) NOT NULL,
    content         TEXT,
    process_inst_id VARCHAR(64),
    task_id         VARCHAR(64),
    is_read         TINYINT(1) DEFAULT 0,
    created_at      DATETIME,
    INDEX idx_recipient (tenant_id, recipient_id, is_read)
);
```

---

## 10. 审计日志

### 10.1 日志范围

| 操作类型 | 记录内容 |
|---|---|
| 流程定义 | 创建/编辑/删除/部署/复制 |
| 表单定义 | 创建/编辑/删除/发布 |
| 流程实例 | 启动/挂起/恢复/终止/驳回 |
| 任务 | 审批/驳回/转办/委派/加签/催办 |
| 系统管理 | 租户管理/用户管理/角色权限变更 |

### 10.2 实现方式

AOP 切面 + `@Audited` 注解。

### 10.3 数据库表

```sql
CREATE TABLE wf_audit_log (
    id              VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    operator_id     VARCHAR(64) NOT NULL,
    operator_name   VARCHAR(255),
    operation_type  VARCHAR(64) NOT NULL,
    resource_type   VARCHAR(64),
    resource_id     VARCHAR(64),
    detail          JSON,
    ip_address      VARCHAR(64),
    user_agent      VARCHAR(512),
    created_at      DATETIME,
    INDEX idx_tenant_type (tenant_id, operation_type, created_at),
    INDEX idx_resource (resource_type, resource_id)
);
```

---

## 11. 流程版本管理

### 11.1 版本策略

- 同一 `processKey` 部署多次，自动递增版本号（Flowable 原生）
- 运行中的实例保持使用当前版本，不受新版本影响
- 新发起流程默认使用最新已部署版本
- 设计中未部署的为草稿，不占用版本号
- 支持版本回滚（将历史版本重新部署为当前版本）

### 11.2 版本状态

```
草稿 (DRAFT) → 已部署 (DEPLOYED) ⇄ 挂起 (SUSPENDED)
```

### 11.3 版本对比（第二期）

支持在界面上对比两个版本的 BPMN 图差异。

---

## 12. 流程分类

### 12.1 分类结构

树形结构，支持多级分类。如：按部门（人事/财务/行政）或按类型（审批/业务流程）。

### 12.2 数据库表

```sql
CREATE TABLE wf_category (
    id          VARCHAR(64) PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    parent_id   VARCHAR(64),
    sort_order  INT,
    created_at  DATETIME,
    INDEX idx_tenant (tenant_id)
);
```

---

## 13. 统计与监控

### 13.1 第一期（基础统计）

| 维度 | 内容 |
|---|---|
| 流程热度 | 各流程发起次数、完成次数、平均耗时 |
| 任务效率 | 各节点平均处理时长、超时率 |
| 个人绩效 | 个人待办数、已办数、平均处理时长 |
| 实时概览 | 运行中实例数、本月发起数、待办总数 |

### 13.2 第二期（高级分析，计入需求）

- SLA 监控与达标率分析
- 瓶颈分析（耗时最长、驳回率最高的节点）
- 趋势分析（按月/周的流程量趋势）
- 可视化仪表盘

---

## 14. 部署方式

| 方式 | 提供 |
|---|---|
| JAR 部署 | Spring Boot fat jar |
| Docker | Dockerfile |
| Docker Compose | docker-compose.yml（含 MySQL） |
| K8s | 暂不提供 |

---

## 15. 分阶段开发计划

### 第一阶段：核心框架 + 引擎集成

**目标：** 跑通"部署流程 → 启动实例 → 完成任务"全链路，验证多租户。

| 模块 | 内容 |
|---|---|
| 项目骨架 | Maven 多模块搭建、父 POM、Spring Boot 3 + Flowable 8 集成 |
| workflow-core | Flowable 引擎配置、多租户 TenantProvider、基础 Service 层 |
| workflow-model | JPA 实体、Repository、Flyway 迁移脚本 |
| workflow-api | 流程定义 CRUD、流程实例启动/终止、任务查询/完成 |
| workflow-starter | 自动配置 |
| workflow-app | 可独立运行的 Spring Boot 应用 |
| MySQL | 表结构初始化 |

### 第二阶段：管理后台 UI

**目标：** Vue 3 前端实现流程管理、任务处理的管理界面。

| 模块 | 内容 |
|---|---|
| 前端项目 | Vite + Vue 3 + TypeScript + Element Plus + Pinia |
| 流程管理 | 流程定义列表、部署/挂起、版本查看 |
| 任务管理 | 待办/已办列表、审批通过/驳回/转办 |
| 流程跟踪 | 流程图高亮、流转记录 |
| 用户登录 | JWT 认证、租户登录 |
| 用户/角色管理 | 第一期内置模式 |
| 通知中心 | 站内信列表 |
| 审计日志 | 操作日志查询 |

### 第三阶段：BPMN 设计器

**目标：** 浏览器中拖拽设计流程图，保存并部署到引擎。

| 模块 | 内容 |
|---|---|
| bpmn-js 集成 | Vue 组件封装、自定义主题美化 |
| 属性面板 | 节点属性编辑（负责人、候选人、表单绑定） |
| 流程保存/部署 | 保存草稿 → 部署到 Flowable 引擎 |
| 流程模拟 | 流程预览 |
| 表单绑定 | 在用户任务节点上选择已发布表单 |
| 流程分类 | 分类管理 |
| 流程复制 | 基于已有流程定义复制 |

### 第四阶段：表单设计器

**目标：** 拖拽式表单设计器，表单与流程变量打通。

| 模块 | 内容 |
|---|---|
| 设计器核心 | 拖拽引擎、组件面板、画布、属性面板 |
| 内置组件（10 个核心） | 文本、数字、下拉、日期、文件上传等 |
| 组件扩展机制 | ComponentRegistry、前后端接口 |
| 事件脚本 | 沙箱执行、可视化规则配置 |
| 表单渲染器 | 运行时展示、提交数据 |
| 表单 → 流程变量 | 自动映射 |

### 后续阶段（按需）

| 功能 | 优先级 |
|---|---|
| 扩展组件（人员/部门选择、data-picker、表格、自动编号等） | 高 |
| 驳回任意节点 | 高 |
| 邮件/企微/钉钉通知 | 中 |
| SLA 监控/仪表盘 | 中 |
| 表单字段细粒度权限 | 中 |
| 版本对比视图 | 低 |
| K8s 部署 | 低 |
| 国际化 | 低 |

---

## 16. 开放性问题

### 16.1 已确认但暂缓

- 驳回任意节点（第二阶段实现）
- 表单字段细粒度角色权限（第二阶段实现）
- SLA 监控/瓶颈分析/仪表盘（第二阶段实现）
- 版本对比视图（第二阶段实现）
- 邮件/企微/钉钉通知（按需实现）
- K8s 部署（暂不排期）

### 16.2 待讨论

（以下为开发过程中可能需要进一步明确的事项）

- 文件上传的存储方式：本地存储 / 对象存储（OSS/S3）
- 多租户下的用户注册方式：管理员创建 vs 自助注册
- 通知的推送方式：轮询 vs WebSocket
- 流程定义导入/导出的格式和范围