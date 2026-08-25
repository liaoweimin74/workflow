## Verification Checklist

### 向后兼容性

- [ ] **V1**: 现有 ViewDesigner 视图 schema（无 formatter/fixed/visible）→ 预览行为不变
- [ ] **V2**: 现有 PageRenderer 视图渲染（无新配置项）→ 功能正常
- [ ] **V3**: 现有动作链配置（set-filter/refresh/open-detail/script）→ 正常工作

### QueryColumnsConfig 扩展

- [ ] **V4**: formatter 下拉选择 `currency` → 预览表格列显示 ¥1,234.56 格式
- [ ] **V5**: formatter 下拉选择 `date` → 预览表格列显示日期格式
- [ ] **V6**: formatter 下拉选择 `boolean` → 预览表格列显示 是/否
- [ ] **V7**: fixed 下拉选择 `left` → 预览表格列固定在左侧
- [ ] **V8**: fixed 下拉选择 `right` → 预览表格列固定在右侧
- [ ] **V9**: 保存视图 → 刷新 → formatter/fixed 配置正确恢复

### ActionsConfig 扩展

- [ ] **V10**: 按钮 visible 输入 `$row.status === 'PENDING'` → 符合条件的行显示该按钮
- [ ] **V11**: 按钮 visible 输入 `$row.status === 'PENDING'` → 不符合条件的行隐藏该按钮
- [ ] **V12**: 按钮未配置 visible → 所有行都显示该按钮
- [ ] **V13**: 保存视图 → 刷新 → visible 配置正确恢复

### EventsConfig 扩展

- [ ] **V14**: 触发器选择 `cell-click` → 点击单元格触发事件链
- [ ] **V15**: 触发器选择 `selection-change` → 选择行触发事件链
- [ ] **V16**: 触发器选择 `current-change` → 切换当前行触发事件链
- [ ] **V17**: 动作选择 `set-sort` → 配置 field/order 参数 → 事件触发时表格排序变化
- [ ] **V18**: 动作选择 `set-page` → 配置 page 参数 → 事件触发时表格跳转到指定页
- [ ] **V19**: 动作选择 `clear-selection` → 事件触发时清空行选择

### PageRenderer 渲染

- [ ] **V20**: 列配置 formatter → PageRenderer 渲染时格式化显示值
- [ ] **V21**: 列配置 fixed → PageRenderer 渲染时固定列位置
- [ ] **V22**: 表格 cell-click 事件 → 触发对应事件链
- [ ] **V23**: 表格 selection-change 事件 → 触发对应事件链
- [ ] **V24**: set-sort 动作 → el-table 排序状态变化
- [ ] **V25**: set-page 动作 → el-pagination 跳转到指定页
- [ ] **V26**: clear-selection 动作 → 清空所有行选中状态

### 构建与测试

- [ ] **V27**: `npm run build` 无错误
- [ ] **V28**: 新增单元测试全部通过
- [ ] **V29**: 现有测试无回归失败
