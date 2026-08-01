## Why

当前工作流平台缺少可视化流程设计器，流程定义只能通过直接编写 BPMN XML 部署，非技术人员无法参与流程设计。用户需要在浏览器中通过拖拽方式设计 BPMN 2.0 流程图，并配置节点属性、审批人、条件等业务信息。第一期实现核心设计器能力，使流程定义可以通过可视化界面创建和编辑。

## What Changes

**BPMN 流程设计器（新增）**
- 在现有前端管理后台中新增流程设计器页面，懒加载路由
- 基于 bpmn-js 实现三栏布局（Palette / Canvas / Properties Panel）
- 支持拖拽创建 BPMN 2.0 元素：开始/结束事件、用户任务、网关、子流程、泳道、连线
- 支持保存草稿、部署到 Flowable 引擎、导入/导出 BPMN XML、撤销/重做
- 支持节点属性配置（基本信息、审批人设置、连线条件）

**后端 API 扩展**
- 新增设计器相关接口：`/editor`、`/design`、`/copy`、`/import`
- 新增分类管理接口：CRUD

**数据库新增**
- `wf_node_config`：节点自定义属性配置表（JSON 字段）
- `wf_category`：流程分类表

## Capabilities

### New Capabilities

- `bpmn-designer` — BPMN 流程设计器，可视化拖拽编辑流程图
- `process-definition-category` — 流程定义分类管理

### Modified Capabilities

无。当前不修改已有能力。

## Impact

- **前端**：新增 `frontend/src/views/designer/` 模块，安装 bpmn-js 依赖
- **后端**：ProcessDefinitionController 新增设计器接口，新增 ProcessDesignService
- **数据库**：新增两张表（wf_node_config、wf_category）
- **依赖**：前端新增 bpmn-js、bpmn-js-properties-panel、diagram-js-minimap 等依赖