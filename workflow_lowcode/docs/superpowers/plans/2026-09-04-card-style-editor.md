# 卡片与字段样式编辑器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现卡片整体与字段级统一样式规则编辑器，并新增“蓝色科技 · 霓虹科技风格”预设。

**Architecture:** 使用统一的 `StyleRule` 数据结构承载无条件 CSS、条件表达式、命中 CSS 和 CSS 类名。整体编辑器与字段高级编辑器复用规则编辑交互；CSS 只显示摘要，点击后通过独立弹窗编辑。渲染层统一解析无条件规则和所有命中的条件规则，分别作用于卡片容器或当前字段。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、Element Plus、Vitest、Vue Test Utils、现有 `scriptSandbox` 条件求值能力。

## Global Constraints

- 不考虑历史数据兼容，直接使用新样式模型。
- 条件表达式由用户手写，表达式标签后必须提供 `?` 悬浮帮助。
- 规则不包含名称，条件规则不单独弹窗编辑。
- CSS 脚本在主界面显示摘要，点击摘要或编辑按钮后弹出 CSS 编辑窗体。
- CSS 编辑器只编辑不带选择器的 CSS 声明块。
- 卡片整体条件使用 `$row`；字段条件支持 `$value`、`$row` 和 `row`。
- 多条启用条件规则全部求值，后命中的同名 CSS 属性覆盖前面的属性，CSS 类名合并。
- 数据表格必须与卡片共享样式解析逻辑：表格整体规则作用于表格容器或行级目标，字段规则作用于 CELL 内容。
- 新增规则必须具备启用开关、条件表达式、命中 CSS、CSS 类名、删除操作。
- 所有实现遵循 TDD：先写失败测试，再写最小实现，再重构。
- 每个逻辑单元完成后运行相关 Vitest 和 `vue-tsc --noEmit`；不使用 `as any`、`@ts-ignore` 或空 catch。

---

### Task 1: 统一样式类型与规则解析工具

**Files:**
- Modify: `frontend/src/utils/fieldStyle.ts`
- Modify: `frontend/src/components/business/ListCards.types.ts`
- Test: `frontend/src/utils/__tests__/fieldStyle.test.ts`
- Test: `frontend/src/components/business/__tests__/ListCards.styles.test.ts`

**Interfaces:**
- Produces `StyleRule { enabled: boolean; when?: string; css: string; className?: string }`。
- Produces `resolveStyleRules(base: StyleRule | undefined, rules: StyleRule[] | undefined, row: Record<string, any>, value?: unknown): ResolvedStyle`。
- `CardStyle` 使用 `theme?: CardTheme`、`base?: StyleRule`、`rules?: StyleRule[]`。
- `FieldStyle` 使用 `base?: StyleRule`、`rules?: StyleRule[]`。

- [ ] **Step 1: Write failing tests**

覆盖以下行为：无条件规则始终生效；禁用规则跳过；条件规则使用 `$row`/`$value` 求值；所有命中规则按顺序合并；后规则覆盖同名 CSS；类名合并；错误表达式不会中断其他渲染。

```ts
it('无条件规则和所有命中规则按顺序合并', () => {
  const result = resolveStyleRules(
    { enabled: true, css: 'color: #333; padding: 8px;', className: 'base' },
    [
      { enabled: true, when: "$row.status === '异常'", css: 'color: red;', className: 'error' },
      { enabled: true, when: "$row.priority === '高'", css: 'color: orange; font-weight: 700;', className: 'urgent' },
    ],
    { status: '异常', priority: '高' },
  )
  expect(result.style).toMatchObject({ color: 'orange', padding: '8px', fontWeight: '700' })
  expect(result.className).toBe('base error urgent')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/fieldStyle.test.ts src/components/business/__tests__/ListCards.styles.test.ts`

Expected: FAIL because the new rule model and resolver do not exist.

- [ ] **Step 3: Implement minimal resolver and types**

将 CSS 解析复用现有 `parseCssString`；无条件 CSS 先写入结果；遍历启用规则，使用现有沙箱上下文求值，命中后合并 `parseCssString(rule.css)` 和类名；不再采用首个命中即停止。

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/utils/__tests__/fieldStyle.test.ts src/components/business/__tests__/ListCards.styles.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

Run `lsp_diagnostics` on `frontend/src/utils/fieldStyle.ts` and `frontend/src/components/business/ListCards.types.ts`；确认无新增错误。

### Task 2: 预设主题与卡片渲染接入

**Files:**
- Modify: `frontend/src/components/business/ListCards.themes.ts`
- Modify: `frontend/src/components/business/ListCards.styles.ts`
- Modify: `frontend/src/components/business/ListCards.vue`
- Test: `frontend/src/components/business/__tests__/ListCards.styles.test.ts`
- Test: `frontend/src/components/business/__tests__/ListCards.integration.test.ts`

**Interfaces:**
- `CardTheme` 增加 `techBlue`。
- `CARD_THEMES.techBlue` 为蓝色科技主题。
- `themeToCssScript(style: CardStyle): string` 生成基础 CSS 脚本。
- `ListCards` 使用 `style.base`、`style.rules`，并将规则结果作用于 `.card-item` 或字段元素。

- [ ] **Step 1: Write failing tests**

增加蓝色科技主题完整字段测试、脚本生成测试，以及卡片整体条件规则按行应用测试。

```ts
it('蓝色科技主题使用深蓝背景和亮蓝边框', () => {
  expect(CARD_THEMES.techBlue.backgroundColor).toBe('#0f2747')
  expect(CARD_THEMES.techBlue.borderColor).toBe('#1677ff')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/business/__tests__/ListCards.styles.test.ts src/components/business/__tests__/ListCards.integration.test.ts`

Expected: FAIL because `techBlue` and the new render path are absent.

- [ ] **Step 3: Implement theme and render path**

新增蓝色科技主题；将 `resolvedCardStyle` 改为解析 `base` 和 `rules`；卡片容器合并整体静态/条件 CSS；字段通过统一字段样式解析器应用字段级静态和条件规则；保持通用组件样式覆盖顺序明确。

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/components/business/__tests__/ListCards.styles.test.ts src/components/business/__tests__/ListCards.integration.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

运行 `lsp_diagnostics` 检查 `ListCards.vue`、`ListCards.styles.ts`、`ListCards.themes.ts`、`ListCards.types.ts`。

### Task 2A: 数据表格整体与 CELL 渲染接入

**Files:**
- Modify: `frontend/src/components/business/SearchTable.vue`
- Modify: `frontend/src/components/business/types.ts`
- Modify: `frontend/src/utils/tableColumnRenderer.ts`
- Modify: `frontend/src/views/page/PageRenderer.vue`
- Modify: `frontend/src/views/page/components/PageDataTable.vue`
- Test: `frontend/src/utils/__tests__/tableColumnRenderer.test.ts`
- Test: `frontend/src/views/page/__tests__/PageRenderer.test.ts`
- Test: `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`

**Interfaces:**
- `SearchTable` 接收表格整体样式规则和 class，并绑定到表格整体渲染目标；整体条件规则按当前行求值，不能只在组件挂载时求值一次。
- `CellStyleConfig` 使用 `base?: StyleRule` 与 `rules?: StyleRule[]`。
- `buildCellRender` 调用统一规则解析器，将最终 style/class 绑定到 CELL 内容包裹元素。
- `PageRenderer` 将页面表格整体样式传给 `SearchTable`，将每个字段的 `FieldStyle` 传给 `buildCellRender`。

- [ ] **Step 1: Write failing tests**

测试表格 CELL 的无条件 CSS/class、`$value` 条件 CSS/class、多条命中规则覆盖；测试表格整体样式按 `$row` 应用于正确的整体或行级目标。

```ts
it('buildCellRender 应将字段规则应用到 CELL 内容', () => {
  const render = buildCellRender({
    key: 'status',
    style: {
      base: { enabled: true, css: 'font-weight: 600;', className: 'status-cell' },
      rules: [{ enabled: true, when: "$value === '异常'", css: 'color: red;', className: 'status-error' }],
    },
  })
  const vnode = render({ status: '异常' })
  expect(vnode.props?.class).toBe('status-cell status-error')
  expect(vnode.props?.style).toMatchObject({ fontWeight: '600', color: 'red' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/tableColumnRenderer.test.ts src/views/page/__tests__/PageRenderer.test.ts src/views/page/components/__tests__/PageDataTable.test.ts`

Expected: FAIL because the current table renderer only accepts legacy `className/styleExpr` and the table component has no style-rule props。

- [ ] **Step 3: Implement shared table rendering**

在 `tableColumnRenderer.ts` 中通过 `resolveStyleRules` 生成 CELL 的最终 `style/class`；`SearchTable` 增加整体规则、整体 class 和按行样式绑定；`PageRenderer` 与 `PageDataTable` 透传对应 props。字段和整体样式必须复用同一解析器。

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/utils/__tests__/tableColumnRenderer.test.ts src/views/page/__tests__/PageRenderer.test.ts src/views/page/components/__tests__/PageDataTable.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

检查 `SearchTable.vue`、`PageRenderer.vue`、`PageDataTable.vue`、`tableColumnRenderer.ts` 和相关类型文件。

### Task 3: CSS 脚本弹窗与可复用规则编辑器

**Files:**
- Create: `frontend/src/views/page/components/StyleScriptDialog.vue`
- Create: `frontend/src/views/page/components/StyleRuleEditor.vue`
- Test: `frontend/src/views/page/components/__tests__/StyleScriptDialog.test.ts`
- Test: `frontend/src/views/page/components/__tests__/StyleRuleEditor.test.ts`

**Interfaces:**
- `StyleScriptDialog` props: `modelValue`, `title`, `scope`, `modelValue?: string`；emits `update:modelValue` 和 `confirm`。
- `StyleRuleEditor` props: `modelValue: StyleRule[]`、`scope: 'card' | 'field'`；emits `update:modelValue`。
- `StyleRuleEditor` 内部直接显示规则，不显示名称；CSS 摘要点击打开 `StyleScriptDialog`。

- [ ] **Step 1: Write failing component tests**

测试 CSS 摘要、编辑弹窗、条件表达式帮助、启用开关、删除/添加规则、CSS 类名输入和确认回写。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/page/components/__tests__/StyleScriptDialog.test.ts src/views/page/components/__tests__/StyleRuleEditor.test.ts`

Expected: FAIL because the components do not exist。

- [ ] **Step 3: Implement components**

CSS 弹窗使用 Element Plus `el-dialog`、`el-input type="textarea"`；规则编辑器使用 `el-tooltip` 包裹问号图标；CSS 摘要限制为前几行；规则变化通过复制数组和复制规则对象向上传递。

- [ ] **Step 4: Run component tests**

Run: `npx vitest run src/views/page/components/__tests__/StyleScriptDialog.test.ts src/views/page/components/__tests__/StyleRuleEditor.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

检查两个新增 Vue 文件，确保 props、emits 和模板类型无错误。

### Task 4: 卡片整体样式配置界面接入

**Files:**
- Modify: `frontend/src/views/page/components/CardStyleConfigDialog.vue`
- Modify: `frontend/src/views/page/components/__tests__/CardStyleConfigDialog.test.ts`

**Interfaces:**
- `CardStyleConfigDialog` 继续接收 `modelValue` 和 `cardStyle`，确认时输出新 `CardStyle`。
- 使用 `StyleRuleEditor` 编辑 `base` 与 `rules`。

- [ ] **Step 1: Write failing tests**

验证：预设下拉包含 6 个选项；选择蓝色科技后基础脚本被填充；规则无名称；条件表达式手写；CSS 摘要可打开弹窗；保存输出 `base`、`rules`、`theme`。

- [ ] **Step 2: Run focused test to verify failure**

Run: `npx vitest run src/views/page/components/__tests__/CardStyleConfigDialog.test.ts`

Expected: FAIL against the current旧的单 textarea/`baseTheme`实现。

- [ ] **Step 3: Replace dialog implementation**

移除旧的 `baseTheme`/单一 `css` 组织方式；预设主题生成 `base.css`；条件规则在主界面直接编辑；CSS 内容交给 `StyleScriptDialog`；空条件或空命中 CSS 在确认时显示校验消息。

- [ ] **Step 4: Run focused test**

Run: `npx vitest run src/views/page/components/__tests__/CardStyleConfigDialog.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

检查 `CardStyleConfigDialog.vue` 和测试文件。

### Task 5: 字段高级设置接入统一规则编辑器

**Files:**
- Modify: `frontend/src/views/page/components/ColumnAdvancedConfig.vue`
- Modify: `frontend/src/views/page/components/__tests__/ColumnAdvancedConfig.test.ts`
- Modify: `frontend/src/views/page/ViewDesigner.vue`

**Interfaces:**
- 字段配置使用 `style: FieldStyle`，其中包含 `base` 和 `rules`。
- 字段编辑器通过 `StyleRuleEditor scope="field"` 编辑规则。

- [ ] **Step 1: Write failing tests**

验证字段界面不再显示独立的 CSS 类名/条件样式/样式语法入口；显示统一规则编辑器；条件表达式帮助包含 `$value`；保存字段 `style.base` 和 `style.rules`。

- [ ] **Step 2: Run focused test to verify failure**

Run: `npx vitest run src/views/page/components/__tests__/ColumnAdvancedConfig.test.ts`

Expected: FAIL because current界面仍使用旧分散控件。

- [ ] **Step 3: Implement field editor integration**

删除旧 `className`、`styleExpr`、字符串 `style` 编辑控件；保留角色、标签、位置、对齐等非样式设置；将规则编辑器放入字段样式区域；保存时只写新 `FieldStyle` 结构。

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/views/page/components/__tests__/ColumnAdvancedConfig.test.ts`

Expected: PASS。

- [ ] **Step 5: Run diagnostics**

检查 `ColumnAdvancedConfig.vue`、`ViewDesigner.vue` 和测试文件。

### Task 6: 全量验证与浏览器验收

**Files:**
- No intended source changes; only verification artifacts if needed under ignored `docs/test-runs/`.

- [ ] **Step 1: Run full tests**

Run: `npx vitest run` in `frontend`。

Expected: all tests pass。

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`。

Expected: no errors caused by this feature; document any pre-existing unrelated errors。

- [ ] **Step 3: Browser verify overall editor**

登录 `admin/admin123`，打开卡片列表设计页，确认：按钮对齐；蓝色科技主题出现在下拉框；选择后基础 CSS 摘要更新；点击摘要弹出 CSS 编辑器；添加条件 `$row.status === '异常'` 并编辑 CSS；确认后异常行整卡样式变化。

- [ ] **Step 4: Browser verify field editor**

打开字段高级设置，确认无规则名称；条件表达式后有 `?` 提示；字段 CSS 摘要点击可弹窗编辑；使用 `$value` 条件后仅当前字段样式变化。

- [ ] **Step 5: Final diagnostics and status review**

再次运行改动文件诊断，检查 `git diff` 与 `git status`，确保没有无关文件。
