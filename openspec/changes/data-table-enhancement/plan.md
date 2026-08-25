## Implementation Plan

### 阶段一：ViewDesigner 配置扩展（~2天）

**目标**: 扩展 QueryColumnsConfig/ActionsConfig/EventsConfig 配置组件

**任务**: T1 → T2 → T3 → T4 → T5 → T6（T1/T2 可并行，T3/T4/T5 可并行）

**步骤**:

1. `QueryColumnsConfig.vue` 的 el-table 新增两列：
   - formatter 列：el-select 下拉（无/currency/date/datetime/boolean/enum）
   - fixed 列：el-select 下拉（无/left/right）
2. `ActionsConfig.vue` 的按钮表格新增 visible 列：el-input 输入框，placeholder 提示 `$row.xxx` 语法
3. `EventsConfig.vue` 的 triggerOptions 新增：cell-click、selection-change、current-change
4. `EventsConfig.vue` 的 actionTypeOptions 新增：set-sort、set-page、clear-selection
5. `ViewDesigner.vue` 的类型定义扩展：ColumnViewConfig +formatter/fixed，ViewActionButton +visible

**验收标准**: ViewDesigner 中可配置 formatter/fixed/visible/新触发器/新动作

---

### 阶段二：PageRenderer 渲染扩展（~3天）

**目标**: PageRenderer 支持所有新增配置项的运行时渲染

**任务**: T7 → T8 → T9 → T10 → T11 → T12 → T13（T7 先行，T8/T9/T10/T11 可部分并行）

**步骤**:

1. 新建 `frontend/src/utils/formatters.ts`，导出格式化器映射函数
2. `PageRenderer.vue` 的 `CompiledColumn` 接口扩展 +formatter/fixed
3. el-table-column 模板扩展：`:fixed="col.fixed"`、`formatter` 格式化渲染
4. el-table 新增 `@selection-change`、`@cell-click` 事件监听
5. `dispatchAction` 新增 set-sort/set-page/clear-selection 分支
6. 行操作列渲染：根据 `visible` 表达式判断按钮是否显示（`$row` 变量替换求值）

**验收标准**: 配置新属性 → 预览时功能生效；现有视图无修改时行为不变

---

### 阶段三：集成测试（~1天）

**目标**: 端到端验证

**任务**: T14 → T15 → T16 → T17

**步骤**:

1. ViewDesigner 配置 formatter → 预览验证格式化生效
2. ViewDesigner 配置 fixed → 预览验证固定列生效
3. ViewDesigner 配置 visible → 预览验证按钮条件显示
4. ViewDesigner 配置新触发器/动作 → 预览验证事件联动
5. 现有视图无修改 → 预览验证向后兼容

**验收标准**: 所有新功能配置后生效；现有功能无回归

---

### 时间估算

| 阶段 | 工作量 |
|------|--------|
| 阶段一 | ~2天 |
| 阶段二 | ~3天 |
| 阶段三 | ~1天 |
| **总计** | **~6天** |

### 并行机会

- 阶段一 T1/T2 可并行（QueryColumnsConfig 的 formatter 和 fixed）
- 阶段一 T3/T4/T5 可并行（ActionsConfig 和 EventsConfig 互不依赖）
- 阶段二 T8/T9/T10/T11 可部分并行（列渲染、事件监听互不依赖）
