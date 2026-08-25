## Task List

### 阶段一：ViewDesigner 配置扩展

- [ ] **T1**: `QueryColumnsConfig.vue` 新增 `formatter` 列（下拉选择：currency/date/datetime/boolean/enum/无），支持列值格式化配置
- [ ] **T2**: `QueryColumnsConfig.vue` 新增 `fixed` 列（下拉选择：无/left/right），支持固定列配置
- [ ] **T3**: `ActionsConfig.vue` 按钮表格新增 `visible` 列（输入框，提示 `$row.xxx` 语法），支持按钮条件显示配置
- [ ] **T4**: `EventsConfig.vue` triggerOptions 扩展新增：cell-click（单元格点击）、selection-change（行选择变化）、current-change（当前行变化）
- [ ] **T5**: `EventsConfig.vue` actionTypeOptions 扩展新增：set-sort（设置排序）、set-page（设置分页）、clear-selection（清空选择）
- [ ] **T6**: `ViewDesigner.vue` 的 ColumnViewConfig 类型定义扩展（+formatter/fixed），ViewActionButton 类型扩展（+visible）

### 阶段二：PageRenderer 渲染扩展

- [ ] **T7**: 新增 `frontend/src/utils/formatters.ts`，实现内置格式化器映射（currency/date/datetime/boolean/enum）
- [ ] **T8**: `PageRenderer.vue` 的 `tableColumns` computed 扩展：解析 `fixed` 属性透传给 el-table-column
- [ ] **T9**: `PageRenderer.vue` 表格模板扩展：el-table-column 支持 `:fixed` 属性、`formatter` 格式化渲染
- [ ] **T10**: `PageRenderer.vue` 新增行选择支持：el-table 增加 `@selection-change`、配置 `selectable`
- [ ] **T11**: `PageRenderer.vue` 新增 `cell-click` 事件监听：el-table 增加 `@cell-click`，触发 triggerEvents
- [ ] **T12**: `PageRenderer.vue` 的 `dispatchAction` 扩展：新增 set-sort（设置 el-table 排序）、set-page（跳转分页）、clear-selection（清空选择）动作
- [ ] **T13**: `PageRenderer.vue` 的行操作列渲染扩展：根据按钮 `visible` 表达式判断是否渲染（`$row` 变量替换求值）

### 阶段三：集成测试

- [ ] **T14**: ViewDesigner 中配置 formatter/fixed → 预览验证列格式化和固定列生效
- [ ] **T15**: ViewDesigner 中配置 visible → 预览验证按钮条件显示正确
- [ ] **T16**: ViewDesigner 中配置新触发器/动作 → 预览验证事件联动正常
- [ ] **T17**: 现有视图 schema 无修改 → 预览验证向后兼容
