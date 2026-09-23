## 1. 后端 — 数据库与基础实体

- [ ] 1.1 创建 Flyway 迁移脚本 V4：wf_node_config 表
- [ ] 1.2 创建 Flyway 迁移脚本 V5：wf_category 表
- [ ] 1.3 创建 NodeConfig 实体类（JPA）
- [ ] 1.4 创建 Category 实体类（JPA）
- [ ] 1.5 创建 NodeConfigRepository
- [ ] 1.6 创建 CategoryRepository

## 2. 后端 — 设计器 API

- [ ] 2.1 创建 EditorDTO 类（包含 bpmnXml、nodeConfigs、forms）
- [ ] 2.2 创建 ProcessDesignService（saveDesign、loadEditor、copyProcess）
- [ ] 2.3 扩展 ProcessDefinitionController：GET /{id}/editor
- [ ] 2.4 扩展 ProcessDefinitionController：PUT /{id}/design
- [ ] 2.5 扩展 ProcessDefinitionController：POST /{id}/copy
- [ ] 2.6 扩展 ProcessDefinitionController：POST /import
- [ ] 2.7 创建 CategoryController：CRUD 接口
- [ ] 2.8 创建 CategoryService
- [ ] 2.9 扩展 ProcessDefinition 实体：关联 category 字段

## 3. 前端 — 依赖安装与基础配置

- [ ] 3.1 安装 bpmn-js、bpmn-js-properties-panel、diagram-js-minimap 依赖
- [ ] 3.2 创建 designerStore（Pinia）
- [ ] 3.3 创建 bpmnModeler.ts（bpmn-js Modeler 初始化）
- [ ] 3.4 创建 nodeConfigAdapter.ts（节点属性适配层）
- [ ] 3.5 创建 xmlParser.ts（BPMN XML 导入/导出工具）
- [ ] 3.6 添加路由 /workflow/designer（懒加载）

## 4. 前端 — 设计器页面布局

- [ ] 4.1 创建 ProcessDesigner.vue（三栏布局主容器）
- [ ] 4.2 创建 Palette.vue（左侧元素面板）
- [ ] 4.3 创建 DesignerCanvas.vue（bpmn-js 画布封装）
- [ ] 4.4 创建 PropertiesPanel.vue（右侧属性面板容器）
- [ ] 4.5 创建 DesignerToolbar.vue（顶部工具栏）
- [ ] 4.6 创建流程定义 API（processDefinition.ts）

## 5. 前端 — 属性面板

- [ ] 5.1 创建 properties/index.ts（节点类型→属性组件映射）
- [ ] 5.2 创建 BasicInfo.vue（名称、描述）
- [ ] 5.3 创建 ApprovalSetting.vue（审批人类型、值、多人审批方式）
- [ ] 5.4 创建 ConditionEditor.vue（连线条件表达式）
- [ ] 5.5 创建 StartEventProps.vue、EndEventProps.vue、GatewayProps.vue
- [ ] 5.6 创建 UserTaskProps.vue（组合 BasicInfo + ApprovalSetting）

## 6. 前端 — 视觉定制

- [ ] 6.1 创建设计器自定义 CSS 样式文件（配色、圆角、阴影）
- [ ] 6.2 自定义 Palette 图标样式

## 7. 分类管理页面

- [ ] 7.1 创建分类管理页面（CategoryPage.vue）
- [ ] 7.2 创建分类 API（category.ts）

## 8. 流程定义列表页增强

- [ ] 8.1 流程定义列表页添加"设计"按钮
- [ ] 8.2 流程定义列表页添加"复制"操作
- [ ] 8.3 流程定义列表页添加分类筛选