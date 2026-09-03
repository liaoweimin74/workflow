# Tasks: unified-datasource-binding

## 1. 前端：统一数据源绑定组件

### 1.1 组件设计
- [ ] 1.1.1 设计 `UnifiedDatasourceBinding.vue` 组件结构，参考 `DataSourceBindingTab.vue`
- [ ] 1.1.2 定义 TypeScript 接口：`DataSourceBindingProps`、`DataSourceBindingEmits`

### 1.2 集成 DsBindingConfigDialog

- [ ] 1.2.1 分析 `DsBindingConfigDialog.vue` 当前数据源页签结构（完成，见 brainstorm）
- [ ] 1.2.2 设计数据适配器，将 `DataSourceBindingTab.vue` 输出转换为 `DsBindingConfigDialog` 所需结构
- [ ] 1.2.3 实现 `DsBindingConfigDialog.vue` 中的数据源页签引用新组件
- [ ] 1.2.4 更新筛选行结构：统一 `value`/`field` 字段命名
- [ ] 1.2.5 编写单元测试：数据源变更、筛选添加/删除、表单字段引用

### 1.3 集成 DataPickerConfigDialog

- [ ] 1.3.1 分析 `DataPickerConfigDialog.vue` 当前数据源页签结构
- [ ] 1.3.2 实现 `DataPickerConfigDialog.vue` 中的数据源页签引用新组件
- [ ] 1.3.3 处理数据源变更后的列定义加载
- [ ] 1.3.4 编写单元测试

### 1.4 集成 LookupPickerConfigDialog

- [ ] 1.4.1 分析 `LookupPickerConfigDialog.vue` 当前数据源页签结构
- [ ] 1.4.2 实现 `LookupPickerConfigDialog.vue` 中的数据源页签引用新组件
- [ ] 1.4.3 编写单元测试

### 1.5 运行时组件适配

- [ ] 1.5.1 更新 `PageDataTable.vue`：使用统一配置结构读取数据源和筛选
- [ ] 1.5.2 更新 `PageDataCards.vue`：同上
- [ ] 1.5.3 更新 `PageDataTree.vue`：同上
- [ ] 1.5.4 更新 `DataPicker.vue`、`LookupPicker.vue`：同上

### 1.6 向后兼容

- [ ] 1.6.1 编写配置转换函数：旧配置 → 新配置
- [ ] 1.6.2 更新已有数据：后端迁移脚本
- [ ] 1.6.3 前端读取适配：兼容旧配置结构

## 2. 后端：配置结构标准化

（如果需要后端适配，待后续确认）

### 2.1 配置迁移脚本
- [ ] 2.1.1 编写迁移脚本：统一 filter 字段命名
- [ ] 2..2.2 执行数据迁移

## 3. 验证

- [ ] 3.1 运行所有单元测试
- [ ] 3.2 端到端测试：配置弹窗打开、数据源选择、筛选配置、保存应用
- [ ] 3.3 浏览器验证：四个配置入口的“数据源”页签正常工作