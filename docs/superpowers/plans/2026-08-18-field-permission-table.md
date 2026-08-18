# 字段权限表格紧凑化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将节点级字段权限表格改为"紧凑两列 + 映射按钮 + 行内展开（手风琴）"，消除属性栏内横向滚动与行高臃肿。

**Architecture:** 保留 el-table 三列布局（字段名 / 权限 / 映射按钮），将数据来源配置区（source-cell）从常驻渲染改为 `v-if="expandedField === row.field"` 条件渲染在字段名单元格内；`expandedField` 为单值 ref 实现手风琴；映射按钮按已配置来源生成摘要文案。存储格式不变。

**Tech Stack:** Vue 3 `<script setup>`、Element Plus（el-table / el-select / el-button）、Vitest + @vue/test-utils、Pinia

## Global Constraints

- 存储格式零改动：`FormFieldDataMapping[]`（`{targetField, source, sourceField?}`），保存/回读必须兼容
- 流程级 `ProcessFormPropertyTab.vue` 不动（本身已紧凑，仅两列）
- 后端/API 零改动
- 数据来源配置逻辑完全复用现有实现：`onSourceChange` / `onNodeChange` / `loadInitiatorFields` / `loadTaskNodes` / `loadFields` / `saveConfig`（仅渲染时机从"常驻"改为"展开时"）
- 测试必须 TDD：先改测试确认 RED，再实现，再 GREEN
- 每任务独立可测、独立 commit
- 工作目录：`D:\aicode\workflow\.worktrees\form-data-mapping\frontend\`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/views/designer/properties/FormPropertyTab.vue` | 节点级字段权限表格：三列 + 展开/收起 + 摘要 | Modify |
| `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts` | 表格交互测试：默认收起 / 展开 / 手风琴 / 摘要 | Modify |

### Task 1: 改写测试为"先展开再配置"+ 新增交互断言

**Files:**
- Modify: `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts`

**Interfaces:**
- Consumes: `FormPropertyTab.vue` 现有 DOM 锚点 `.source-select` / `.source-field-select` / `.source-node-select` / `.variable-name-input`（在展开后出现）
- Produces: 新 DOM 锚点契约（Task 2 实现）——每行「映射」按钮 `.mapping-toggle-btn`；展开态 `.source-cell`；按钮摘要文案规则

- [ ] **Step 1: 改写 pickSource helper + 2 个既有用例（增加展开步骤）**

将 `pickSource(wrapper, rowText, optionText, selector)` 拆为两步：`expandRow(...)` 点击映射按钮展开，再 `pickSource(expandedRow, optionText, selector)`。改写后的 helper 与用例：

```ts
/** 点击指定字段行的「映射」按钮展开其来源配置区 */
async function expandRow(wrapper: any, rowText: string) {
  const row = wrapper.findAll('.el-table__row').find((r: any) => r.text().includes(rowText))
  expect(row).toBeTruthy()
  await row.find('.mapping-toggle-btn').trigger('click')
  await flushPromises()
  return row
}

/** 在已展开的字段行内选择来源配置选项 */
async function pickSource(expandedRow: any, optionText: string, selector = '.source-select .el-select__wrapper') {
  const sourceSelect = expandedRow.find(selector)
  expect(sourceSelect.exists()).toBe(true)
  await sourceSelect.trigger('click')
  await flushPromises()
  const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(
    (i) => (i.closest('.el-select-dropdown') as HTMLElement | null)?.style.display !== 'none'
  )
  const item = [...items].find((i) => i.textContent?.trim() === optionText)
  expect(item).toBeTruthy()
  ;(item as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}
```

既有用例 1（流程变量）改为：

```ts
it('配置字段数据来源为「流程变量」后 setNodeConfig 收到含 dataMappings 的节点配置', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()

  const row = await expandRow(wrapper, '金额')
  await pickSource(row, '流程变量')

  const input = row.find('.variable-name-input input')
  expect(input.exists()).toBe(true)
  await input.setValue('requestAmount')
  await flushPromises()

  const saved = useDesignerStore().getNodeConfig('UserTask_1')
  expect(saved?.form?.dataMappings).toContainEqual({
    targetField: 'amount',
    source: 'variable:requestAmount',
  })
})
```

既有用例 2（发起人表单）改为：

```ts
it('配置字段数据来源为「发起人表单」并选择源字段后写入 dataMappings', async () => {
  const store = setupNodeConfig()
  store.setBpmnXml(
    '<definitions xmlns:wf="http://example.com/wf"><process><userTask id="UserTask_init" wf:nodeRole="initiator" name="发起人填报"/></process></definitions>'
  )
  store.setNodeConfig('UserTask_init', { form: { formDefId: 'F0' } })
  const wrapper = await mountTab()

  const row = await expandRow(wrapper, '金额')
  await pickSource(row, '发起人表单')
  await pickSource(row, '姓名', '.source-field-select .el-select__wrapper')

  const saved = useDesignerStore().getNodeConfig('UserTask_1')
  expect(saved?.form?.dataMappings).toContainEqual({
    targetField: 'amount',
    source: 'form:initiator',
    sourceField: 'name',
  })
})
```

- [ ] **Step 2: 新增 5 个交互断言用例**

在 `describe('节点表单配置 — 字段数据来源映射')` 内追加：

```ts
it('默认收起：未点击映射按钮时不渲染 source-cell', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()
  expect(wrapper.findAll('.el-table__row').some((r: any) => r.find('.source-cell').exists())).toBe(false)
})

it('点击「映射」按钮后该行 source-cell 展开', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()
  const row = await expandRow(wrapper, '金额')
  expect(row.find('.source-cell').exists()).toBe(true)
})

it('手风琴：展开新行时自动收起之前的行', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()
  const rowAmount = await expandRow(wrapper, '金额')
  expect(rowAmount.find('.source-cell').exists()).toBe(true)

  const rowReason = await expandRow(wrapper, '事由')
  expect(rowReason.find('.source-cell').exists()).toBe(true)
  expect(rowAmount.find('.source-cell').exists()).toBe(false)
})

it('再次点击已展开行的「映射」按钮收起', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()
  const row = await expandRow(wrapper, '金额')
  expect(row.find('.source-cell').exists()).toBe(true)
  await row.find('.mapping-toggle-btn').trigger('click')
  await flushPromises()
  expect(row.find('.source-cell').exists()).toBe(false)
})

it('映射按钮显示来源摘要：发起人表单与流程变量', async () => {
  const store = setupNodeConfig()
  store.setBpmnXml(
    '<definitions xmlns:wf="http://example.com/wf"><process><userTask id="UserTask_init" wf:nodeRole="initiator" name="发起人填报"/></process></definitions>'
  )
  store.setNodeConfig('UserTask_init', { form: { formDefId: 'F0' } })
  store.setNodeConfig('UserTask_1', {
    form: {
      formDefId: 'F1',
      fieldPermissions: { amount: 'EDIT', reason: 'EDIT' },
      dataMappings: [
        { targetField: 'amount', source: 'form:initiator', sourceField: 'name' },
        { targetField: 'reason', source: 'variable:requestAmount' },
      ],
    },
  })
  const wrapper = await mountTab()

  const rowAmount = wrapper.findAll('.el-table__row').find((r: any) => r.text().includes('金额'))!
  expect(rowAmount.find('.mapping-toggle-btn').text()).toContain('发起人表单')

  const rowReason = wrapper.findAll('.el-table__row').find((r: any) => r.text().includes('事由'))!
  expect(rowReason.find('.mapping-toggle-btn').text()).toContain('变量')
})
```

- [ ] **Step 3: 运行测试确认 RED**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping\frontend
npx vitest run src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
```

Expected: 失败——既有 2 个用例失败（`.mapping-toggle-btn` 不存在）；新增 5 个用例失败（source-cell 常驻渲染 → "默认收起"断言失败；映射按钮不存在 → 其余失败）。

- [ ] **Step 4: Commit（仅测试改动，RED 阶段）**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping
git add frontend/src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
git commit -m "test: rewrite field mapping tests for collapsible source config (RED)"
```

### Task 2: 实现紧凑表格 + 行内展开 + 摘要

**Files:**
- Modify: `src/views/designer/properties/FormPropertyTab.vue`
- Verify: `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts`（Task 1 已改）

**Interfaces:**
- Consumes: Task 1 的 DOM 锚点契约（`.mapping-toggle-btn` / `.source-cell` / 摘要文案）
- Produces: `expandedField: Ref<string | null>`、`toggleExpand(field: string)`、`isMapped(field: string): boolean`、`mappingSummary(field: string): string`

- [ ] **Step 1: 修改模板 — 三列布局 + 条件渲染 source-cell**

将字段名列改为 template 单元格（容纳字段名 + 条件渲染的来源配置区）；新增「映射」操作列：

```vue
<el-table :data="fieldList" border size="small" style="width: 100%">
  <el-table-column prop="label" label="字段名" min-width="170">
    <template #default="{ row }">
      <div class="field-name-cell">
        <span class="field-label">{{ row.label }}</span>
        <div v-if="expandedField === row.field" class="source-cell" @click.stop>
          <!-- 原「数据来源」列内容原样搬入，结构不变 -->
          <el-select
            v-model="formConfig.dataMappings[row.field].source"
            size="small"
            style="width: 100%"
            class="source-select"
            :disabled="readOnly"
            @change="onSourceChange(row.field)"
          >
            <el-option label="无" value="" />
            <el-option label="发起人表单" value="initiator" />
            <el-option label="指定节点" value="node" />
            <el-option label="流程变量" value="variable" />
          </el-select>
          <el-select
            v-if="formConfig.dataMappings[row.field].source === 'initiator'"
            v-model="formConfig.dataMappings[row.field].sourceField"
            size="small"
            style="width: 100%"
            class="source-field-select"
            placeholder="选择源字段"
            :disabled="readOnly"
            @change="saveConfig"
          >
            <el-option v-for="f in initiatorFormFields" :key="f.field" :label="f.label" :value="f.field" />
          </el-select>
          <template v-else-if="formConfig.dataMappings[row.field].source === 'node'">
            <el-select
              v-model="formConfig.dataMappings[row.field].sourceNodeId"
              size="small"
              style="width: 100%"
              class="source-node-select"
              placeholder="选择源节点"
              :disabled="readOnly"
              @change="onNodeChange(row.field)"
            >
              <el-option v-for="n in formTaskNodes" :key="n.id" :label="n.label" :value="n.id" />
            </el-select>
            <el-select
              v-if="formConfig.dataMappings[row.field].sourceNodeId"
              v-model="formConfig.dataMappings[row.field].sourceField"
              size="small"
              style="width: 100%"
              class="source-field-select"
              placeholder="选择源字段"
              :disabled="readOnly"
              @change="saveConfig"
            >
              <el-option v-for="f in nodeFormFields" :key="f.field" :label="f.label" :value="f.field" />
            </el-select>
          </template>
          <el-input
            v-else-if="formConfig.dataMappings[row.field].source === 'variable'"
            v-model="formConfig.dataMappings[row.field].variableName"
            size="small"
            class="variable-name-input"
            placeholder="变量名"
            :disabled="readOnly"
            @change="saveConfig"
          />
        </div>
      </div>
    </template>
  </el-table-column>
  <el-table-column label="权限" width="100" align="center">
    <!-- 原有权限下拉，原样保留 -->
  </el-table-column>
  <el-table-column label="映射" width="110" align="center">
    <template #default="{ row }">
      <el-button
        class="mapping-toggle-btn"
        size="small"
        link
        :type="isMapped(row.field) ? 'primary' : 'default'"
        :disabled="readOnly"
        @click="toggleExpand(row.field)"
      >
        {{ mappingSummary(row.field) }}
      </el-button>
    </template>
  </el-table-column>
</el-table>
```

**注意**：原「数据来源」列（`el-table-column label="数据来源"` 及 `#default` 内 source-cell）整体删除——内容已搬入字段名单元格的条件块。

- [ ] **Step 2: 修改脚本 — 新增 expandedField + 摘要函数**

在 script 中新增：

```ts
/** 当前展开来源配置的字段（手风琴：单值） */
const expandedField = ref<string | null>(null)

function toggleExpand(field: string) {
  expandedField.value = expandedField.value === field ? null : field
}

/** 字段是否已配置数据来源（用于按钮高亮） */
function isMapped(field: string): boolean {
  return !!formConfig.dataMappings[field]?.source
}

/** 生成映射按钮摘要文案 */
function mappingSummary(field: string): string {
  const m = formConfig.dataMappings[field]
  if (!m?.source) return '映射'
  if (m.source === 'initiator') {
    const label = initiatorFormFields.value.find(f => f.field === m.sourceField)?.label || m.sourceField
    return `← 发起人表单.${label}`
  }
  if (m.source === 'node') {
    const nodeLabel = formTaskNodes.value.find(n => n.id === m.sourceNodeId)?.label || m.sourceNodeId
    const fieldLabel = nodeFormFields.value.find(f => f.field === m.sourceField)?.label || m.sourceField
    return `← ${nodeLabel}.${fieldLabel}`
  }
  if (m.source === 'variable') {
    return `← 变量.${m.variableName}`
  }
  return '映射'
}
```

同时在 `loadConfig()` 末尾追加发起人字段预加载（保证摘要能解析源字段 label）：

```ts
loadInitiatorFields()
```

（`loadInitiatorFields` 内部对无发起人节点提前 return，幂等安全。）

- [ ] **Step 3: 补充样式**

```css
.field-name-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.field-label {
  font-weight: 500;
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping\frontend
npx vitest run src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
```

Expected: 7 用例全部通过（2 既有改写 + 5 新增）。

- [ ] **Step 5: 全量回归**

```bash
npx vitest run src/views/designer
npx vue-tsc --noEmit
```

Expected: designer 套件全部通过（含 ProcessFormPropertyTab.test.ts 3 用例，共 22+）；vue-tsc 无错误。

- [ ] **Step 6: Commit**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping
git add frontend/src/views/designer/properties/FormPropertyTab.vue frontend/src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
git commit -m "feat: make field mapping config collapsible with accordion and summary"
```