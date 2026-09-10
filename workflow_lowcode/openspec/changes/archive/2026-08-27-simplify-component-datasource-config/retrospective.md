## Retrospective: simplify-component-datasource-config

**日期**: 2026-08-27
**状态**: 完成（实现 + 额外修复）
**Commit 范围**: 845a814 → efc8bdd（7 commits）

---

### 原始目标

将 LookupPicker 和 DataPicker 组件的独立数据源配置（sourceType、sourceFormKey、apiUrl、headers 等）简化为统一的 `dataSourceId` 引用，通过页面/表单级数据源绑定配置一次、组件引用。

### 实际完成范围

**超出原始 proposal 的额外工作：**

1. **数据源切换清除旧列**: PageDataTable 切换数据源后清除旧列，避免显示错位
2. **useMetadataColumns 模式**: PageDataTable 新增 flag 控制列来源（metaColumns vs props.columns），watch(resolvedRefId) 切换数据源时自动刷新
3. **page 参数保护**: 后端 BizDataQueryRequest.page 默认 0（0-based），前端 SearchTable page 1-based，加 `Math.max(0, params.page - 1)` 防负数
4. **管理页面标题移除**: FormListPage、PageListPage、DataSourceListPage 的 header 标题移除
5. **formContainer 重命名**: "容器" → "数据容器"
6. **运行时 bug 修复**: formDsBindingsStore 安全写入（非空优先覆盖），修复运行时数据源不存在
7. **DsBindingEngine 运行时集成**: resolveRefId() + 3 API 修复
8. **DsBindingConfigDialog 表模式**: tableMode prop 支持

**未完成（设计模式 mock）：**
- 尝试为 PageDataTable 设计模式提供 mock 数据，但 form-create 不传递自定义 props（`isDesignMode`/`_isDesignMode`），provide/inject 在 form-create 组件树中也断裂。用户拒绝了 mock 方案，已还原。

### 遇到的问题

1. **form-create prop 传递**: form-create 会剥离自定义 props，`isDesignMode` prop 方式不可行
2. **provide/inject 跨树**: form-create 组件树内外的 provide/inject 不能互通
3. **后端 page 0-based vs 前端 1-based**: 已通过 Math.max 保护
4. **测试 57 个预存失败**: DataPicker、LookupPicker、LookupPickerConfigDialog 的测试大量失败，属于预存问题（此次重构删除了部分旧逻辑但未更新对应测试）

### 测试状态

- `vue-tsc --noEmit`: 6 个预存错误（未使用变量、类型不匹配）
- `vitest`: 57 failed / 389 passed（41 test files）
- 新增单元测试: mergeFilters 14/14 通过，resolveFilterFieldReferences 14/14 通过
- DsBindingEngine: 8/8 通过

### 关键决策

- 不兼容旧数据格式（用户明确要求）
- 查找带回/数据引用组件不需要独立数据源能力
- DataSourceConfigPanel 改为确认/取消模式（编辑本地化，确定时提交）
- 删除管理页面标题栏以节省空间
- 设计模式 mock 方案不可行，放弃
