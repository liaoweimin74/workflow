# BPMN 流程设计器 — 设计规格说明书

> 版本：v1.0  
> 日期：2026-08-02  
> 状态：定稿

---

## 1. 概述

本文档描述工作流平台 BPMN 流程设计器的设计方案。设计器基于 bpmn-js 构建，前端使用 Vue 3 + Element Plus，后端采用独立配置表存储自定义节点属性。

### 1.1 需求来源

- PRD 3.1 流程设计器
- 规格说明书第 4 章 BPMN 设计器

### 1.2 核心目标

用户在浏览器中通过拖拽方式设计 BPMN 2.0 流程图，支持保存草稿、部署到 Flowable 引擎、导入/导出 BPMN XML。

---

## 2. 技术选型

| 层 | 方案 | 理由 |
|---|---|---|
| 流程图引擎 | bpmn-js | 成熟稳定，BPMN 2.0 标准兼容 |
| 属性面板 | 完全重写，Element Plus 组件 | 自定义属性多，默认面板不够用 |
| 自定义属性存储 | 独立配置表 `wf_node_config`（JSON 字段） | 可查询、可版本管理、与 BPMN XML 解耦 |
| 视觉风格 | 轻量定制（配色、圆角、阴影、字体） | 不动底层渲染器，性价比高 |
| 路由方式 | 集成在现有前端，懒加载路由 | 按需加载，不影响主应用启动速度 |

---

## 3. 整体架构

### 3.1 页面布局

```
┌─────────────────────────────────────────────────┐
│                 流程设计器页面                      │
│  ┌──────────┬──────────────┬──────────────────┐  │
│  │ Palette  │  Canvas      │  Properties Panel │  │
│  │ (元素面板) │  (流程图画布)  │  (属性编辑面板)    │  │
│  │          │              │                  │  │
│  │ 开始事件  │              │  ┌────────────┐  │  │
│  │ 用户任务  │  [bpmn-js]   │  │ 基本信息    │  │  │
│  │ 网关     │              │  │ 审批人设置   │  │  │
│  │ 子流程   │              │  │ 表单权限    │  │  │
│  │ 泳道     │              │  │ 时限配置    │  │  │
│  │ 连线     │              │  │ 操作权限    │  │  │
│  │          │              │  │ 后端逻辑    │  │  │
│  └──────────┴──────────────┘  └────────────┘  │  │
│                                                   │
│  工具栏: [保存草稿] [部署] [导入] [导出] [模拟] [撤销] [重做] │
└─────────────────────────────────────────────────┘
```

三栏布局：
- **左侧 Palette**：可拖拽的 BPMN 元素列表
- **中间 Canvas**：bpmn-js 流程图绘制区域
- **右侧 Properties Panel**：选中节点的属性编辑面板，按节点类型动态切换

### 3.2 前端组件结构

```
frontend/src/views/designer/
├── ProcessDesigner.vue           # 主容器，三栏布局
├── components/
│   ├── Palette.vue               # 左侧元素面板
│   ├── DesignerCanvas.vue        # bpmn-js 画布封装
│   ├── PropertiesPanel.vue       # 右侧属性面板容器
│   └── toolbar/
│       ├── DesignerToolbar.vue   # 顶部工具栏
│       ├── SaveButton.vue
│       └── SimulateButton.vue
├── properties/                   # 属性编辑器（按节点类型分）
│   ├── index.ts                  # 节点类型 → 属性组件映射
│   ├── common/
│   │   ├── BasicInfo.vue         # 名称、描述（所有节点共有）
│   │   └── ConditionEditor.vue   # 连线条件编辑器
│   ├── StartEventProps.vue       # 开始事件：表单、发起人权限
│   ├── UserTaskProps.vue         # 用户任务：审批人、表单、时限、操作
│   │   ├── ApprovalSetting.vue   # 审批人设置
│   │   ├── FormPermission.vue    # 表单字段权限
│   │   ├── TimeoutSetting.vue    # 时限配置
│   │   └── OperationConfig.vue   # 驳回/加签/转签
│   ├── GatewayProps.vue          # 网关：默认流转
│   ├── SubProcessProps.vue       # 子流程：调用的流程、变量映射
│   └── EndEventProps.vue         # 结束事件
├── stores/
│   └── designerStore.ts          # Pinia store
└── utils/
    ├── bpmnModeler.ts            # bpmn-js Modeler 初始化
    ├── nodeConfigAdapter.ts      # 节点属性 ↔ BPMN 模型适配
    └── xmlParser.ts              # BPMN XML 导入/导出
```

### 3.3 属性面板映射机制

`properties/index.ts` 维护节点类型到属性编辑组件的映射表：

```typescript
const nodePropsMap: Record<string, Component[]> = {
  startEvent:      [BasicInfo, StartEventProps],
  userTask:        [BasicInfo, UserTaskProps],
  exclusiveGateway: [BasicInfo, GatewayProps],
  parallelGateway:  [BasicInfo, GatewayProps],
  inclusiveGateway: [BasicInfo, GatewayProps],
  subProcess:      [BasicInfo, SubProcessProps],
  endEvent:        [BasicInfo, EndEventProps],
  sequenceFlow:    [ConditionEditor],
};
```

选中节点时根据 `element.type` 查找对应组件列表，动态渲染到属性面板。如果某类节点不需要某个属性 Tab，就不渲染。

---

## 4. 数据流

### 4.1 读取流程

```
后端 GET /api/v1/process-definitions/{id}/editor
  → 返回 { bpmnXml, nodeConfigs: { "nodeId": { ...configJson } } }

前端加载:
  → bpmn-js 导入 bpmnXml（渲染流程图）
  → nodeConfigs 存入 designerStore（按 nodeId 索引）
  → 选中节点时，从 store 取对应配置填充属性面板
```

### 4.2 保存流程

```
前端保存:
  → bpmn-js 导出 bpmnXml
  → 从 designerStore 取出所有 nodeConfigs
  → PUT { bpmnXml, nodeConfigs: { "nodeId": { ... } } }

后端在一个事务内:
  1. 更新 wf_process_def.bpmn_xml
  2. DELETE wf_node_config WHERE process_def_id = ?
  3. 批量 INSERT wf_node_config（含 config_json）
```

### 4.3 节点属性同步

```
bpmn-js 选中节点
  → 触发 element.changed 事件
  → designerStore 根据 element.id 查找 nodeConfig
  → 属性面板渲染对应配置

属性面板修改值
  → 直接更新 designerStore 中的 nodeConfig
  → 不操作 bpmn-js 模型（BPMN XML 只存标准属性）
```

### 4.4 部署流程

```
前端点击部署:
  → 先自动保存（同上保存流程）
  → 调用 POST /api/v1/process-definitions/{id}/deploy
  → 后端将 wf_process_def.bpmn_xml 部署到 Flowable 引擎
  → 更新状态为 DEPLOYED，记录 deployId / procDefId
```

---

## 5. 后端 API

### 5.1 新增接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/process-definitions/{id}/editor` | 加载设计器数据，返回 bpmnXml + nodeConfigs |
| PUT | `/api/v1/process-definitions/{id}/design` | 保存设计器内容，事务内更新 bpmnXml + 替换 nodeConfigs |
| POST | `/api/v1/process-definitions/{id}/copy` | 复制流程定义（含 bpmnXml + nodeConfigs） |
| POST | `/api/v1/process-definitions/import` | 导入 BPMN XML，解析并返回预览 |
| GET | `/api/v1/categories` | 获取分类树 |
| POST | `/api/v1/categories` | 新建分类 |
| PUT | `/api/v1/categories/{id}` | 修改分类 |
| DELETE | `/api/v1/categories/{id}` | 删除分类 |

### 5.2 核心接口定义

**GET /api/v1/process-definitions/{id}/editor**

```json
{
  "bpmnXml": "<?xml ...>",
  "nodeConfigs": {
    "UserTask_1": {
      "basic": { "name": "部门经理审批", "description": "" },
      "approval": { "type": "role", "value": "dept_manager", "multiMode": "countersign" }
    }
  },
  "forms": [
    { "id": "form_001", "name": "请假申请单" }
  ]
}
```

**PUT /api/v1/process-definitions/{id}/design**

请求体同上。返回更新后的流程定义信息。

### 5.3 统一响应格式

遵循现有 `R<T>` 统一响应格式：
```json
{ "code": 0, "msg": "success", "data": { ... } }
```

---

## 6. 数据库设计

### 6.1 wf_node_config（新增）

```sql
CREATE TABLE wf_node_config (
    id              VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(64) NOT NULL,
    process_def_id  VARCHAR(64) NOT NULL,
    node_id         VARCHAR(255) NOT NULL,
    node_type       VARCHAR(64) NOT NULL,
    config_json     JSON NOT NULL,
    created_at      DATETIME,
    updated_at      DATETIME,
    UNIQUE KEY uk_node (tenant_id, process_def_id, node_id),
    INDEX idx_def (tenant_id, process_def_id)
);
```

### 6.2 wf_category（新增）

```sql
CREATE TABLE wf_category (
    id          VARCHAR(64) PRIMARY KEY,
    tenant_id   VARCHAR(64) NOT NULL,
    name        VARCHAR(255) NOT NULL,
    parent_id   VARCHAR(64),
    sort_order  INT DEFAULT 0,
    created_at  DATETIME,
    INDEX idx_tenant (tenant_id),
    INDEX idx_parent (parent_id)
);
```

### 6.3 config_json 结构

```json
{
  "basic": {
    "name": "节点名称",
    "description": ""
  },
  "approval": {
    "type": "user | role | dept_head | initiator_self | expression",
    "value": "审批人值",
    "multiMode": "countersign | or_sign"
  },
  "form": {
    "formDefId": "form_001",
    "fieldPermissions": { "field_key": "EDIT | VIEW" }
  },
  "timeout": {
    "duration": 7200,
    "action": "remind | escalate"
  },
  "operations": {
    "allowReject": true,
    "allowAddSign": false,
    "allowTransfer": true
  }
}
```

config_json 中的字段按节点类型可选。开始事件只需 basic + form；用户任务使用全部字段；结束事件只需 basic。

---

## 7. 视觉风格（轻量定制）

覆盖 bpmn-js 默认 SVG 样式，不修改底层渲染器：

- **配色**：主色调与 Element Plus 主题一致（蓝色系 #409EFF）
- **圆角**：节点圆角 8px（默认 4px）
- **阴影**：选中节点添加柔和阴影
- **字体**：与 Element Plus 保持一致（14px, -apple-system）
- **Palette**：自定义元素图标，分组展示
- **Context Pad**：自定义操作图标，匹配 Element Plus 风格

通过 CSS 变量和 bpmn-js 的自定义主题配置实现，不侵入 bpmn-js 核心代码。

---

## 8. 阶段划分

### 第一阶段（本期实现）

| 模块 | 内容 |
|---|---|
| bpmn-js 集成 | Vue 3 封装组件、懒加载路由 |
| 三栏布局 | Palette + Canvas + Properties Panel |
| 工具栏 | 保存草稿、部署、导入/导出 XML、撤销/重做 |
| 属性面板框架 | 按节点类型动态加载属性组件 |
| 基本信息 + 审批人设置 | 名称、描述、审批人类型/值、多人审批方式 |
| 连线条件编辑 | 条件表达式输入 |
| 保存/部署 API | `/editor`、`/design`、`/deploy` |
| 数据库 | wf_node_config、wf_category 建表 |
| 视觉轻量定制 | 配色、圆角、阴影 |
| 分类管理 | 分类 CRUD |
| 流程复制 | 基于已有流程定义复制 |

### 第二阶段（后续实现）

| 模块 | 内容 |
|---|---|
| 表单字段权限配置 | 选择表单 → 配置字段权限 |
| 时限配置 | 超时时间 + 超时动作 |
| 操作权限 | 驳回/加签/转签开关 |
| 流程模拟预览 | bpmn-js-token-simulation 集成 |
| 小地图导航 | diagram-js-minimap |
| 键盘快捷键 | 复制/粘贴/删除/撤销/重做 |

---

## 9. 开放性问题

- 文件上传存储方式（本地 / OSS / S3）：待后续决定
- 流程定义导入时 BPMN XML 的校验策略：第一期仅 bpmnlint 基础校验