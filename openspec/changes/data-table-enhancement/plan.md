## Implementation Plan

### 阶段一：基础属性增强（~2天）

**目标**: PageDataTable 支持排序、筛选、分页、行选择等基础属性

**任务**: T1 → T2 → T3 → T4（T1/T2 可并行）

**步骤**:

1. 在 `PageDataTable.vue` 的 `defineProps` 中新增表格级属性，全部设置向后兼容默认值
2. 扩展 `resolvedColumns` computed，解析列级新属性并透传给 el-table-column
3. 新建 `formatters.ts`，导出各格式化器函数
4. 在 el-table 上接入 `sortable`、`@sort-change`；接入 `filterable`；分页组件条件渲染；selection-mode 对应 el-table `selectable`

**验收标准**: 现有页面不设置新属性时行为不变；设置新属性后功能生效

---

### 阶段二：事件与动作总线（~1天）

**目标**: 新增事件发射 + 动作总线新操作

**任务**: T5 → T6 → T7 → T8（T5/T6 可并行）

**步骤**:

1. `PageDataTable.vue` 新增 emits 并在对应交互处触发
2. `PageRendererPage.vue` 的 `transformComponent` 为 page-table 注册新事件
3. `executeStep` 新增 set-sort/set-page/clear-selection 分支

**验收标准**: 在页面设计器配置动作链 → 预览时联动生效

---

### 阶段三：操作列配置（~2天）

**目标**: 操作列按钮完全可配置

**任务**: T9 → T10 → T11 → T12 → T13（T9 先行，T10/T11/T12 串行）

**步骤**:

1. 定义 TypeScript 接口
2. `PageDataTable.vue` 根据 `actionColumn.buttons` 动态渲染按钮
3. 实现 visible 表达式求值（`new Function` + row/ctx 上下文）
4. 实现 confirmMessage → ElMessageBox.confirm

**验收标准**: 配置 3 种不同类型按钮 → 预览中正确渲染、交互正常

---

### 阶段四：通用配置面板（~3天）

**目标**: 可复用的 TableConfigPanel 组件

**任务**: T14 → T15 → T16 → T17 → T18（T14/T17 先行，T15/T16 可并行）

**步骤**:

1. 定义 `table-config-types.ts`（ColumnConfig/ActionButtonConfig/SearchFieldConfig）
2. `TableConfigPanel.vue` 使用 el-tabs 组织三个标签页
3. `TableColumnConfig.vue`：可拖拽排序的列列表 + 右侧属性编辑表单
4. `TableActionConfig.vue`：按钮列表 + 按钮属性编辑表单（类型、图标、动作、visible、confirmMessage）

**验收标准**: 组件独立渲染 → v-model 双向绑定 → 事件正确发射

---

### 阶段五：设计器集成（~1天）

**目标**: PageDesigner 属性面板中可配置表格

**任务**: T19 → T20 → T21

**步骤**:

1. `setComponentRuleConfig('page-table', ...)` 注入"列配置"和"操作列配置"按钮
2. 点击按钮 → 打开弹窗 → 写回 activeRule.props

**验收标准**: 设计器中配置表格属性 → 保存 → 预览验证

---

### 阶段六：SearchTable 适配（~0.5天）

**目标**: SearchTable 复用配置面板

**任务**: T22 → T23

**步骤**:

1. SearchTable 内部引入 TableConfigPanel，作为代码级配置辅助
2. 保持现有 props 接口不变

**验收标准**: SearchTable 现有用法不受影响

---

### 阶段七：集成测试（~0.5天）

**目标**: 端到端验证

**任务**: T24 → T25 → T26

---

### 时间估算

| 阶段 | 工作量 |
|------|--------|
| 阶段一 | ~2天 |
| 阶段二 | ~1天 |
| 阶段三 | ~2天 |
| 阶段四 | ~3天 |
| 阶段五 | ~1天 |
| 阶段六 | ~0.5天 |
| 阶段七 | ~0.5天 |
| **总计** | **~10天** |

### 并行机会

- 阶段一 T1/T2 可并行
- 阶段二 T5/T6 可并行
- 阶段四 T15/T16 可并行
- 阶段一~三（前端组件）与阶段四（配置面板）可部分并行
