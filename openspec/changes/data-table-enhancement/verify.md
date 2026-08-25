## Verification Checklist

### 向后兼容性

- [ ] **V1**: 现有 PageDataTable 用法（不设置新属性）行为完全不变
- [ ] **V2**: 现有 SearchTable 用法完全不受影响
- [ ] **V3**: 现有页面 schema 无需修改即可正常渲染
- [ ] **V4**: 现有动作总线配置（set-filter/refresh/set-value）正常工作

### 属性配置

- [ ] **V5**: `sortable: true` → 表格显示排序图标，点击可排序
- [ ] **V6**: `filterable: true` → 表格支持列级筛选
- [ ] **V7**: `pagination: true` → 底部显示分页组件，翻页正常
- [ ] **V8**: `selectionMode: 'single'` → 单选框，只能选一行
- [ ] **V9**: `selectionMode: 'multiple'` → 复选框，可选多行
- [ ] **V10**: 列 `formatter: 'currency'` → 显示 ¥1,234.56 格式
- [ ] **V11**: 列 `fixed: 'left'` → 列固定在左侧

### 事件绑定

- [ ] **V12**: 点击单元格 → 发射 `cell-click` 事件，参数正确
- [ ] **V13**: 选择行 → 发射 `selection-change` 事件，参数正确
- [ ] **V14**: 点击列头排序 → 发射 `sort-change` 事件，参数正确
- [ ] **V15**: 切换当前行 → 发射 `current-change` 事件，参数正确
- [ ] **V16**: 动作总线 `set-sort` → 表格排序变化
- [ ] **V17**: 动作总线 `set-page` → 表格跳转到指定页
- [ ] **V18**: 动作总线 `clear-selection` → 清空选中状态

### 操作列

- [ ] **V19**: 配置编辑/删除/自定义按钮 → 操作列正确渲染
- [ ] **V20**: 按钮 `visible: '{row.status === 0}'` → 条件显示正确
- [ ] **V21**: 按钮 `confirmMessage` → 点击弹出确认框
- [ ] **V22**: 按钮 `action: 'custom'` → 触发动作总线事件
- [ ] **V23**: 未配置 actionColumn → 不显示操作列

### 配置面板

- [ ] **V24**: TableConfigPanel 列配置 → 增删改列 → 事件正确发射
- [ ] **V25**: TableConfigPanel 操作列配置 → 增删改按钮 → 事件正确发射
- [ ] **V26**: PageDesigner 弹窗集成 → 配置结果写回 activeRule.props
- [ ] **V27**: 保存 schema → 刷新 → 配置正确恢复

### 构建与测试

- [ ] **V28**: `npm run build` 无错误
- [ ] **V29**: 新增单元测试全部通过
- [ ] **V30**: 现有测试无回归失败
