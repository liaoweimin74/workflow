## Task List

### 阶段一：基础属性增强

- [ ] **T1**: `PageDataTable.vue` 新增表格级 props（sortable/filterable/pagination/pageSize/selectionMode/height/maxHeight）
- [ ] **T2**: `PageDataTable.vue` 扩展 `resolvedColumns` computed，支持列级 props（sortable/filterable/fixed/formatter/align/showOverflowTooltip）
- [ ] **T3**: 新增 `frontend/src/utils/formatters.ts`，实现内置格式化器（currency/date/datetime/boolean/enum）
- [ ] **T4**: 在 el-table 中接入排序/筛选/分页/行选择功能

### 阶段二：事件与动作总线

- [ ] **T5**: `PageDataTable.vue` 新增 emits：cell-click/selection-change/sort-change/current-change
- [ ] **T6**: `PageRendererPage.vue` 的 `transformComponent` 注册新事件到动作总线
- [ ] **T7**: `PageRendererPage.vue` 的 `executeStep` 扩展 set-sort/set-page/clear-selection 操作
- [ ] **T8**: 为新增事件和动作编写测试

### 阶段三：操作列配置

- [ ] **T9**: 设计 `actionColumn` props 类型定义（`ActionColumnConfig` / `ActionButtonConfig` 接口）
- [ ] **T10**: `PageDataTable.vue` 实现动态操作列渲染（根据 buttons 配置渲染，支持内置动作和自定义动作）
- [ ] **T11**: 实现按钮条件显示逻辑（visible 表达式求值）
- [ ] **T12**: 实现确认弹窗逻辑（confirmMessage）
- [ ] **T13**: 为操作列编写测试

### 阶段四：通用配置面板

- [ ] **T14**: 新建 `frontend/src/components/business/TableConfigPanel.vue` 主组件（Tabs 布局）
- [ ] **T15**: 新建 `frontend/src/components/business/TableColumnConfig.vue` 列配置子组件（列列表 + 列属性编辑表单）
- [ ] **T16**: 新建 `frontend/src/components/business/TableActionConfig.vue` 操作列配置子组件（按钮列表 + 按钮属性编辑表单）
- [ ] **T17**: 新建类型定义 `frontend/src/components/business/table-config-types.ts`
- [ ] **T18**: 为配置面板组件编写测试

### 阶段五：设计器集成

- [ ] **T19**: `PageDesigner.vue` 的 `registerPageComponents` 中为 page-table 注册"列配置"和"操作列配置"按钮入口
- [ ] **T20**: `PageDesigner.vue` 新增配置弹窗，集成 TableConfigPanel
- [ ] **T21**: `PageDesigner.vue` 保存时序列化 actionColumn 到 schema

### 阶段六：SearchTable 适配

- [ ] **T22**: `SearchTable.vue` 引入 TableConfigPanel，提供代码级配置入口
- [ ] **T23**: 保持 SearchTable 现有 props 接口不变，向后兼容

### 阶段七：集成测试

- [ ] **T24**: 页面设计器中配置表格属性 → 预览验证功能生效
- [ ] **T25**: 操作列按钮配置 → 自定义动作 → 动作总线联动验证
- [ ] **T26**: SearchTable 代码配置 → TableConfigPanel 验证
