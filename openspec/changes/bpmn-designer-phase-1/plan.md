# BPMN 流程设计器（第一阶段）实现计划

> **For agentic workers:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** 实现 BPMN 流程设计器第一阶段功能：可视化拖拽设计流程图、属性配置（基本信息+审批人）、保存/部署/导入/导出。

**Architecture:** 前端基于 bpmn-js + Vue 3 + Element Plus，三栏布局。属性面板完全重写，自定义属性通过独立配置表 wf_node_config 存储。后端扩展 ProcessDefinitionController，新增 ProcessDesignService。数据库新增 wf_node_config 和 wf_category 两张表。

**Tech Stack:** Vue 3 + Element Plus + bpmn-js + Pinia | Spring Boot + Flowable + JPA + Flyway | MySQL 8

---

## Task 1: 后端 — 数据库 Flyway 迁移脚本

- [ ] **Step 1:** 创建 `V4__create_wf_node_config.sql`，定义 wf_node_config 表（id, tenant_id, process_def_id, node_id, node_type, config_json JSON, created_at, updated_at）
- [ ] **Step 2:** 创建 `V5__create_wf_category.sql`，定义 wf_category 表（id, tenant_id, name, parent_id, sort_order, created_at）
- [ ] **Step 3:** 创建 NodeConfig JPA 实体，使用 `@Table(name = "wf_node_config")`，配置 JSON 字段映射
- [ ] **Step 4:** 创建 Category JPA 实体，支持自关联 parent_id 树形结构
- [ ] **Step 5:** 创建 NodeConfigRepository（findByProcessDefId, deleteByProcessDefId）
- [ ] **Step 6:** 创建 CategoryRepository（findByTenantIdOrderBySortOrder）

**Commit:** `feat: add wf_node_config and wf_category tables`

## Task 2: 后端 — 设计器服务层

- [ ] **Step 1:** 创建 `EditorDTO`（bpmnXml, nodeConfigs Map<String, JsonNode>, forms List）
- [ ] **Step 2:** 创建 `DesignSaveRequest` DTO（bpmnXml, nodeConfigs Map<String, JsonNode>）
- [ ] **Step 3:** 创建 `ProcessDesignService`：
  - `loadEditor(String processDefId)` → 读取 wf_process_def.bpmnXml + wf_node_config 记录
  - `saveDesign(String processDefId, DesignSaveRequest)` → 事务内更新 bpmnXml + 替换 nodeConfigs
  - `copyProcess(String processDefId)` → 复制流程定义 + 节点配置
  - `importBpmn(String bpmnXml)` → 解析 XML 返回预览
- [ ] **Step 4:** 创建 `CategoryService`（CRUD + 树形查询）
- [ ] **Step 5:** 扩展 ProcessDefinitionController：
  - GET /{id}/editor → loadEditor
  - PUT /{id}/design → saveDesign
  - POST /{id}/copy → copyProcess
  - POST /import → importBpmn
- [ ] **Step 6:** 创建 `CategoryController`（CRUD 接口）

**Commit:** `feat: add process designer API endpoints`

## Task 3: 前端 — 依赖安装与基础配置

- [ ] **Step 1:** `npm install bpmn-js bpmn-js-properties-panel diagram-js-minimap @types/bpmn-js`
- [ ] **Step 2:** 创建 `stores/designerStore.ts`：
  - state: bpmnXml, nodeConfigs Map, selectedNodeId
  - actions: setNodeConfig, getNodeConfig, clearConfigs
- [ ] **Step 3:** 创建 `utils/bpmnModeler.ts`：
  - initModeler(container) → 创建 Modeler 实例
  - 配置 moddleExtensions（Flowable extension）
- [ ] **Step 4:** 创建 `utils/nodeConfigAdapter.ts`：
  - 封装 bpmn-js element.businessObject 的读写
  - setNodeName / getNodeName / setAssignee 等工具函数
- [ ] **Step 5:** 创建 `utils/xmlParser.ts`：
  - importXml(modeler, xml) → 导入 BPMN XML
  - exportXml(modeler) → 导出 BPMN XML
- [ ] **Step 6:** 在 router 中添加 `/workflow/designer` 路由，懒加载 `@/views/designer/ProcessDesigner.vue`

**Commit:** `feat: add bpmn-js dependencies and designer infrastructure`

## Task 4: 前端 — 设计器页面布局

- [ ] **Step 1:** 创建 `ProcessDesigner.vue`：
  - 全屏三栏 flex 布局
  - 左侧 Palette（240px），中间 Canvas（flex:1），右侧 Properties Panel（360px）
  - 顶部工具栏
  - 初始化 bpmn-js Modeler
- [ ] **Step 2:** 创建 `Palette.vue`：
  - 分组展示 BPMN 元素（事件、任务、网关、子流程、泳道）
  - 每个元素带图标和名称
  - 使用 bpmn-js 的 PaletteProvider 自定义
- [ ] **Step 3:** 创建 `DesignerCanvas.vue`：
  - 封装 bpmn-js 画布容器
  - 监听 element.changed 事件
  - 选中节点时通知 store
- [ ] **Step 4:** 创建 `PropertiesPanel.vue`：
  - 监听 store.selectedNodeId 变化
  - 根据节点类型动态加载对应属性组件
  - 空状态提示"选择一个节点以编辑属性"
- [ ] **Step 5:** 创建 `DesignerToolbar.vue`：
  - 按钮：保存草稿、部署、导入、导出、撤销、重做
  - 保存/部署调用 API
- [ ] **Step 6:** 创建 `api/processDefinition.ts`：
  - getEditor(id), saveDesign(id, data), deploy(id), copyProcess(id), importBpmn(file)

**Commit:** `feat: implement designer three-column layout and toolbar`

## Task 5: 前端 — 属性面板组件

- [ ] **Step 1:** 创建 `properties/index.ts`：
  - nodePropsMap: Record<string, Component[]>
  - 映射：startEvent → [BasicInfo], userTask → [BasicInfo, ApprovalSetting] 等
- [ ] **Step 2:** 创建 `properties/common/BasicInfo.vue`：
  - 表单：名称（必填 el-input）、描述（可选 el-input textarea）
  - v-model 绑定 designerStore.nodeConfig
- [ ] **Step 3:** 创建 `properties/ApprovalSetting.vue`：
  - 审批人类型：el-select（指定用户/指定角色/部门负责人/发起人自选/表达式）
  - 审批人值：按类型切换选择器（用户选择器/角色选择器/表达式输入框）
  - 多人审批方式：el-radio-group（会签/或签）
  - 使用 el-form 布局
- [ ] **Step 4:** 创建 `properties/common/ConditionEditor.vue`：
  - 条件表达式：el-input（支持 Groovy/JavaScript 表达式）
  - 描述：el-input
- [ ] **Step 5:** 创建 `properties/StartEventProps.vue`、`EndEventProps.vue`、`GatewayProps.vue`
- [ ] **Step 6:** 创建 `properties/UserTaskProps.vue`（组合 BasicInfo + ApprovalSetting）

**Commit:** `feat: implement property panel components`

## Task 6: 前端 — 视觉定制与分类页面

- [ ] **Step 1:** 创建 `styles/designer-theme.css`：
  - 覆盖 bpmn-js CSS 变量（bjs-*）
  - 配色 #409EFF 主色系
  - 节点圆角 8px，选中阴影
  - Palette 和 Context Pad 图标样式
- [ ] **Step 2:** 创建 `views/category/CategoryPage.vue`：
  - el-tree 树形展示分类
  - 新增/编辑/删除对话框
- [ ] **Step 3:** 创建 `api/category.ts`：分类 CRUD 接口
- [ ] **Step 4:** 增强流程定义列表页：
  - 每行添加"设计"按钮，跳转到 /workflow/designer?id=xxx
  - 每行添加"复制"操作
  - 列表顶部添加分类筛选下拉框

**Commit:** `feat: add designer theme, category management, and list page enhancements`