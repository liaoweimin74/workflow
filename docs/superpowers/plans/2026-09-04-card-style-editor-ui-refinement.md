# 卡片与字段样式编辑器 UI 修正实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正卡片样式配置与字段高级设置的布局和交互，使预设唯一、条件样式紧凑表格化，并让样式脚本支持直接编辑与弹窗编辑。

**Architecture:** 新增可复用的 `StyleScriptInput`，在页面内提供 textarea 与右侧编辑图标，点击后复用已有脚本弹窗。新增 `StyleRuleTable`，以表格行承载启用、手写条件、脚本编辑框、class 和删除操作；卡片整体和字段高级设置复用该表格。保持当前 `StyleRule` 数据结构和卡片/表格/CELL 渲染逻辑不变。

**Tech Stack:** Vue 3、TypeScript、Element Plus、Vitest、Vue Test Utils。

## Global Constraints

- 蓝色科技预设只出现一次，主题值使用 `techBlue`。
- 规则不显示名称。
- 条件表达式直接在表格单元格输入，表达式标签后提供 `?` 悬浮帮助。
- CSS 脚本既可在页面内直接输入，也可点击右侧编辑图标打开弹窗。
- 字段高级设置移除动态内容、列样式、字段样式、单元格点击事件四个分组标题及分割线。
- 字段“始终生效样式”改为“样式脚本”，基础 class 必须有独立 label。
- label 与 input 上下排列；使用 24 栅格；样式脚本、基础 class、条件表格和点击动作独占整行。
- 同一语义组的短字段可并排，不同语义组不得强行并排。
- 不改变整体样式、字段样式、表格整体和表格 CELL 的渲染语义。
- 遵循 TDD，禁止 `as any`、`@ts-ignore`、`@ts-expect-error` 和空 catch。

---

### Task 1: 可复用样式脚本输入框

**Files:**
- Create: `frontend/src/views/page/components/StyleScriptInput.vue`
- Modify: `frontend/src/views/page/components/StyleScriptDialog.vue`
- Test: `frontend/src/views/page/components/__tests__/StyleScriptInput.test.ts`

**Interfaces:**
- Props: `modelValue: string`、`title: string`、`scope: string`、`label?: string`。
- Emits: `update:modelValue`。
- 页面内展示 textarea；右侧编辑图标打开 `StyleScriptDialog`；直接输入和弹窗确认都更新同一个 `modelValue`。

- [ ] **Step 1: Write failing tests**

测试页面内可见 label 和 textarea，直接输入触发 `update:modelValue`，存在编辑图标，点击图标打开弹窗，弹窗确认内容回写。

- [ ] **Step 2: Run focused test**

Run: `npx vitest run src/views/page/components/__tests__/StyleScriptInput.test.ts`

Expected: FAIL because `StyleScriptInput.vue` 不存在。

- [ ] **Step 3: Implement component**

使用 `el-input type="textarea"` 和 `el-button link`/编辑图标；页面摘要框保持可输入；将 `StyleScriptDialog` 的 `script` prop 与输入值绑定。

- [ ] **Step 4: Run focused test and diagnostics**

Run: `npx vitest run src/views/page/components/__tests__/StyleScriptInput.test.ts`，并检查新增组件类型诊断。

Expected: PASS，无新增类型错误。

### Task 2: 条件样式表格组件

**Files:**
- Create: `frontend/src/views/page/components/StyleRuleTable.vue`
- Test: `frontend/src/views/page/components/__tests__/StyleRuleTable.test.ts`

**Interfaces:**
- Props: `modelValue: StyleRule[]`、`scope: 'card' | 'field'`。
- Emits: `update:modelValue`。
- 表格列：启用、条件表达式、命中样式脚本、CSS Class、操作。

- [ ] **Step 1: Write failing tests**

验证表格没有规则名称列；条件输入可编辑；脚本输入框带编辑图标；CSS class 支持空格文本；可添加和删除规则；卡片帮助包含 `$row`，字段帮助包含 `$value`。

- [ ] **Step 2: Run focused test**

Run: `npx vitest run src/views/page/components/__tests__/StyleRuleTable.test.ts`

Expected: FAIL because组件不存在。

- [ ] **Step 3: Implement table**

使用 `el-table` 和 `StyleScriptInput`；添加按钮创建 `{ enabled: true, when: '', css: '', className: '' }`；所有更新复制数组和规则对象；使用 `el-tooltip` 包裹 `QuestionFilled`。

- [ ] **Step 4: Run focused test and diagnostics**

Expected: 表格组件测试通过，类型检查无新增错误。

### Task 3: 卡片整体配置重构

**Files:**
- Modify: `frontend/src/views/page/components/CardStyleConfigDialog.vue`
- Modify: `frontend/src/views/page/components/__tests__/CardStyleConfigDialog.test.ts`

**Interfaces:**
- `CardStyleConfigDialog` 继续接收 `modelValue`、`cardStyle`，确认输出 `CardStyle`。
- 使用 `StyleScriptInput` 编辑 `base.css` 和 `base.className`。
- 使用 `StyleRuleTable` 编辑 `rules`。

- [ ] **Step 1: Write failing tests**

测试主题选项只有一个 `techBlue`；页面显示“样式脚本”和“基础 class”；条件样式为表格列；脚本直接输入/图标弹窗编辑；确认保存 base/rules/theme。

- [ ] **Step 2: Run focused test**

Run: `npx vitest run src/views/page/components/__tests__/CardStyleConfigDialog.test.ts`

Expected: FAIL against当前的单一脚本输入和规则编辑器结构。

- [ ] **Step 3: Implement dialog layout**

使用顶部 label；预制样式、样式脚本、基础 class、条件表格均独占整行；删除重复主题选项；移除旧内嵌规则卡片；校验条件为空或 CSS 为空时不保存并提示。

- [ ] **Step 4: Run focused test and diagnostics**

Expected: 卡片配置测试通过，组件无新增类型错误。

### Task 4: 字段高级设置重构

**Files:**
- Modify: `frontend/src/views/page/components/ColumnAdvancedConfig.vue`
- Modify: `frontend/src/views/page/components/__tests__/QueryColumnsConfig.test.ts`
- Create or Modify: `frontend/src/views/page/components/__tests__/ColumnAdvancedConfig.test.ts`

**Interfaces:**
- 字段样式使用 `FieldStyle { base?: StyleRule; rules?: StyleRule[] }`。
- `ColumnAdvancedConfig` 在基础页签中使用 `StyleScriptInput` 和 `StyleRuleTable scope="field"`。

- [ ] **Step 1: Write failing tests**

验证指定分组标题和分割线不存在；“样式脚本”和“基础 class”有独立 label；条件样式以表格显示；角色/值类型、对齐/显示标签等同组字段并排；样式脚本、条件表格和点击动作整行。

- [ ] **Step 2: Run focused test**

Run: `npx vitest run src/views/page/components/__tests__/QueryColumnsConfig.test.ts src/views/page/components/__tests__/ColumnAdvancedConfig.test.ts`

Expected: FAIL against当前分散布局。

- [ ] **Step 3: Implement aligned layout**

移除四个 `el-divider` 和对应标题；将字段样式区域放在基础设置页签；使用统一 24 栅格和顶部 label；字段基础 class 通过单独 label 显示；CSS 内容使用 `StyleScriptInput`；条件样式使用 `StyleRuleTable`。

- [ ] **Step 4: Run focused tests and diagnostics**

Expected: 字段高级设置测试通过，相关 Vue 文件无新增类型错误。

### Task 5: 表格整体与 CELL UI/渲染回归

**Files:**
- Modify: `frontend/src/components/business/SearchTable.vue`
- Modify: `frontend/src/views/page/PageRenderer.vue`
- Modify: `frontend/src/views/page/components/PageDataTable.vue`
- Modify: `frontend/src/utils/tableColumnRenderer.ts`
- Test: `frontend/src/utils/__tests__/tableColumnRenderer.test.ts`
- Test: `frontend/src/views/page/__tests__/PageRenderer.test.ts`
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`

- [ ] **Step 1: Add regression tests**

确认表格整体样式规则仍按 `$row` 应用到整体/行目标，字段 CELL 仍按 `$value` 应用 CSS 和多个 class；确认字段高级设置保存后的结构被 PageRenderer 透传。

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run src/utils/__tests__/tableColumnRenderer.test.ts src/views/page/__tests__/PageRenderer.test.ts src/views/page/components/__tests__/PageDataTable.test.ts`

- [ ] **Step 3: Fix only regressions caused by UI/model changes**

更新类型和绑定，使表格与卡片共用同一 `StyleRule` 解析器；不恢复已删除的旧样式入口。

- [ ] **Step 4: Run focused tests and diagnostics**

Expected: 表格相关测试通过，无新增类型错误。

### Task 6: 全量验证与浏览器验收

**Files:**
- No intended source changes。

- [ ] **Step 1: Run full tests**

Run: `npx vitest run` in `frontend`。

Expected: all test files and tests pass。

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`。

Expected: no errors caused by this feature；单独记录既有项目错误。

- [ ] **Step 3: Browser verify card dialog**

确认蓝色科技只有一个；样式脚本可直接输入且右侧编辑图标打开弹窗；条件样式是紧凑表格；基础 class 有 label 且多个 class 可输入。

- [ ] **Step 4: Browser verify field dialog**

确认分组标题/分割线已去除；字段样式脚本 label 为“样式脚本”；基础 class 有 label；条件样式表格、条件帮助和脚本弹窗均可用；整体控件对齐。

- [ ] **Step 5: Final diff and diagnostics review**

检查 `git diff --check`、改动文件诊断和 `git status`，确保只包含本次 UI 修正及测试。
