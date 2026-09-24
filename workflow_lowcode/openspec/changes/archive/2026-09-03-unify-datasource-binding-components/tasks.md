# Tasks: unified-datasource-binding

## 1. 前端：统一数据源绑定组件

### 1.1 组件设计
- [x] 1.1.1 将既有 `DataSourceBindingTab.vue` 重命名为 `UniDataSourceBinding.vue`
- [x] 1.1.2 保持并导出 `UniDataSourceValue`、`UniDataSourceFilterRow` 接口，保留既有 props/emits 契约

### 1.2 集成 DsBindingConfigDialog

- [x] 1.2.1 分析 `DsBindingConfigDialog.vue` 当前数据源页签结构（完成，见 brainstorm）
- [x] 1.2.2 通过桥接逻辑将统一组件输出转换为 `DsBindingConfigDialog` 既有保存结构
- [x] 1.2.3 实现 `DsBindingConfigDialog.vue` 中的数据源页签引用新组件
- [x] 1.2.4 保留 `fixedValue` 向后兼容，并支持统一组件输出的 `value`/`field`
- [x] 1.2.5 运行既有表格、卡片、容器配置测试并验证配置保存契约

### 1.3 集成 DataPickerConfigDialog

- [x] 1.3.1 分析 `DataPickerConfigDialog.vue` 当前数据源页签结构
- [x] 1.3.2 实现 `DataPickerConfigDialog.vue` 中的数据源页签引用新组件
- [x] 1.3.3 保留数据源变更后的列定义加载和 DataPicker 专属字段清理
- [x] 1.3.4 运行 `DataPickerConfigDialog.test.ts`

### 1.4 集成 LookupPickerConfigDialog

- [x] 1.4.1 分析 `LookupPickerConfigDialog.vue` 当前数据源页签结构
- [x] 1.4.2 实现 `LookupPickerConfigDialog.vue` 中的数据源页签引用新组件，同时保留 FORM/API 兼容逻辑
- [x] 1.4.3 运行 `LookupPickerConfigDialog.test.ts`

### 1.5 运行时组件适配

- [x] 1.5.1 核验 `PageDataTable.vue` 已兼容 `fixedValue` 与 `value`，无需改动
- [x] 1.5.2 核验 `PageDataCards.vue` 继续消费既有 `dataSourceId` 配置，无需改动
- [x] 1.5.3 核验 `PageDataTree.vue` 继续消费既有数据源 props，无需改动
- [x] 1.5.4 核验 `DataPicker.vue`、`LookupPicker.vue` 继续消费既有运行时配置，无需改动

### 1.6 向后兼容

- [x] 1.6.1 通过 `UniDataSourceBinding` 读取 `value`/`fixedValue` 两种历史条件字段
- [x] 1.6.2 确认无需更新已有数据，保存输出继续保留既有配置语义
- [x] 1.6.3 三个配置弹窗均保留旧配置回填逻辑

## 2. 后端：配置结构标准化

（如果需要后端适配，待后续确认）

### 2.1 配置迁移脚本
- [x] 2.1.1 确认不需要后端 filter 迁移，前端桥接层兼容既有结构
- [x] 2.1.2 不执行数据迁移（无数据库结构或持久化格式变更）

## 3. 验证

- [x] 3.1 运行所有单元测试：745/745 通过
- [x] 3.2 运行前端生产构建：`npm run build` 通过
- [~] 3.3 浏览器手工验证：待启动设计器与后端服务后执行；自动化配置弹窗测试已覆盖回填和保存契约
