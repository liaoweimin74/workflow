# 字段权限卡片式重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将节点级字段权限配置从「紧凑表格 + 行内展开」改为「卡片列表」（每字段一张卡、卡头字段名+权限+映射按钮、卡体展开来源配置），消除横滚与行高问题。

**Architecture:** 用 `div.field-card` 卡片列表（`v-for` 遍历 `fieldList`）替换 `el-table`；卡头 flex 排列（字段名加粗居左、权限下拉与映射按钮居右）；卡体用 `v-if="expandedField === field.field"` 复用现有 `source-cell` 来源配置区；手风琴（单值 `expandedField`）逻辑不变。脚本层（`expandedField/toggleExpand/isMapped/mappingSummary` 及所有数据加载/保存函数）零新增，仅模板容器变化。

**Tech Stack:** Vue 3 `<script setup>`、Element Plus（el-select / el-button / el-input）、Vitest + @vue/test-utils、Pinia

## Global Constraints

- 存储格式零改动：`FormFieldDataMapping[]`（`{targetField, source, sourceField?}`），保存/回读必须兼容
- 流程级 `ProcessFormPropertyTab.vue` 不动（本身已紧凑）
- 后端/API 零改动
- 数据来源配置逻辑完全复用现有实现：`onSourceChange` / `onNodeChange` / `loadInitiatorFields` / `loadTaskNodes` / `loadFields` / `saveConfig`（仅渲染容器从 el-table 行改为卡片）
- 测试必须 TDD：先改测试确认 RED，再实现，再 GREEN
- 每任务独立可测、独立 commit
- 工作目录：`D:\aicode\workflow\.worktrees\form-data-mapping\frontend\`
- 手动实施（用户要求：不派发子代理）

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/views/designer/properties/FormPropertyTab.vue` | 节点级字段权限：卡片列表 + 展开/收起 + 摘要 | Modify |
| `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts` | 卡片交互测试：默认收起 / 展开 / 手风琴 / 摘要 | Modify |

### Task 1: 改写测试锚点 `.el-table__row` → `.field-card`（RED）

**Files:**
- Modify: `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts`

**Interfaces:**
- Consumes: `FormPropertyTab.vue` 现有 DOM 锚点 `.mapping-toggle-btn` / `.source-cell` / `.source-select` / `.source-field-select` / `.source-node-select` / `.variable-name-input`
- Produces: 新 DOM 锚点契约（Task 2 实现）——每字段一张卡 `.field-card`；卡内 `.field-label`（字段名）、权限下拉、`.mapping-toggle-btn`；展开态卡内 `.source-cell`

- [ ] **Step 1: 全局替换行定位锚点**

将测试文件中所有 `.el-table__row` 替换为 `.field-card`。涉及 3 处定位逻辑：

1. `expandRow(wrapper, rowText)` 内：`wrapper.findAll('.el-table__row')` → `wrapper.findAll('.field-card')`
2. 「默认收起」用例：`wrapper.findAll('.el-table__row').some((r: any) => r.find('.source-cell').exists())` → `wrapper.findAll('.field-card')...`
3. 「摘要文案」用例：两处 `wrapper.findAll('.el-table__row').find(...)` → `wrapper.findAll('.field-card').find(...)`

用替换后的 helper 与用例：

```ts
/** 点击指定字段卡片的「映射」按钮展开其来源配置区 */
async function expandRow(wrapper: any, rowText: string) {
  const card = wrapper.findAll('.field-card').find((r: any) => r.text().includes(rowText))
  expect(card).toBeTruthy()
  await card.find('.mapping-toggle-btn').trigger('click')
  await flushPromises()
  return card
}
```

「默认收起」用例：

```ts
it('默认收起：未点击映射按钮时不渲染 source-cell', async () => {
  setupNodeConfig()
  const wrapper = await mountTab()
  expect(wrapper.findAll('.field-card').some((c: any) => c.find('.source-cell').exists())).toBe(false)
})
```

「摘要文案」用例改为：

```ts
const rowAmount = wrapper.findAll('.field-card').find((c: any) => c.text().includes('金额'))!
expect(rowAmount.find('.mapping-toggle-btn').text()).toContain('发起人表单')

const rowReason = wrapper.findAll('.field-card').find((c: any) => c.text().includes('事由'))!
expect(rowReason.find('.mapping-toggle-btn').text()).toContain('变量')
```

其余用例（流程变量配置 / 发起人表单配置 / 点击展开 / 手风琴 / 再点收起）仅依赖 `expandRow` 与卡内锚点，无需额外改动。

- [ ] **Step 2: 运行测试确认 RED**

Run:
```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping\frontend
npx vitest run src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
```

Expected: 7 个用例失败（`.field-card` 不存在 → `find` 返回空 → trigger/text 报错；「默认收起」断言 `expected true to be false` 因表格行被断言为含 source-cell），2 个筛选用例通过。

- [ ] **Step 3: Commit（仅测试改动，RED 阶段）**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping
git add frontend/src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
git commit -m "test: migrate field mapping tests from table rows to cards (RED)"
```

### Task 2: 实现卡片列表（GREEN）

**Files:**
- Modify: `src/views/designer/properties/FormPropertyTab.vue`
- Verify: `src/views/designer/properties/__tests__/FormPropertyTabs.test.ts`（Task 1 已改）

**Interfaces:**
- Consumes: Task 1 的 DOM 锚点契约（`.field-card` / `.field-label` / `.mapping-toggle-btn` / `.source-cell`）
- Produces: 无新增对外接口——`expandedField: Ref<string | null>`、`toggleExpand(field)`、`isMapped(field)`、`mappingSummary(field)` 已在先前迭代存在，继续复用

- [ ] **Step 1: 修改模板 — el-table 替换为卡片列表**

将 `<el-table ...>` 整块（当前行 40-138）替换为：

```vue
<div class="field-card-list">
  <div v-for="field in fieldList" :key="field.field" class="field-card">
    <div class="field-card-header">
      <span class="field-label" :title="field.label">{{ field.label }}</span>
      <div class="field-card-actions">
        <el-select
          v-model="formConfig.fieldPermissions[field.field]"
          size="small"
          style="width: 110px"
          :disabled="readOnly"
          @change="saveConfig"
        >
          <el-option label="可编辑" value="EDIT" />
          <el-option label="只读" value="VIEW" />
          <el-option label="隐藏" value="HIDDEN" />
        </el-select>
        <el-button
          class="mapping-toggle-btn"
          size="small"
          link
          :type="isMapped(field.field) ? 'primary' : 'default'"
          :disabled="readOnly"
          @click="toggleExpand(field.field)"
        >
          {{ mappingSummary(field.field) }}
        </el-button>
      </div>
    </div>
    <div v-if="expandedField === field.field" class="source-cell" @click.stop>
      <el-select
        v-model="formConfig.dataMappings[field.field].source"
        size="small"
        style="width: 100%"
        class="source-select"
        :disabled="readOnly"
        @change="onSourceChange(field.field)"
      >
        <el-option label="无" value="" />
        <el-option label="发起人表单" value="initiator" />
        <el-option label="指定节点" value="node" />
        <el-option label="流程变量" value="variable" />
      </el-select>
      <el-select
        v-if="formConfig.dataMappings[field.field].source === 'initiator'"
        v-model="formConfig.dataMappings[field.field].sourceField"
        size="small"
        style="width: 100%"
        class="source-field-select"
        placeholder="选择源字段"
        :disabled="readOnly"
        @change="saveConfig"
      >
        <el-option v-for="f in initiatorFormFields" :key="f.field" :label="f.label" :value="f.field" />
      </el-select>
      <template v-else-if="formConfig.dataMappings[field.field].source === 'node'">
        <el-select
          v-model="formConfig.dataMappings[field.field].sourceNodeId"
          size="small"
          style="width: 100%"
          class="source-node-select"
          placeholder="选择源节点"
          :disabled="readOnly"
          @change="onNodeChange(field.field)"
        >
          <el-option v-for="n in formTaskNodes" :key="n.id" :label="n.label" :value="n.id" />
        </el-select>
        <el-select
          v-if="formConfig.dataMappings[field.field].sourceNodeId"
          v-model="formConfig.dataMappings[field.field].sourceField"
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
        v-else-if="formConfig.dataMappings[field.field].source === 'variable'"
        v-model="formConfig.dataMappings[field.field].variableName"
        size="small"
        class="variable-name-input"
        placeholder="变量名"
        :disabled="readOnly"
        @change="saveConfig"
      />
    </div>
  </div>
</div>
```

**注意**：`row.field` → `field.field`、`row.label` → `field.label`（el-table 作用域插槽变量 `row` 不存在了，卡片直接用 `v-for` 的 `field`）。

- [ ] **Step 2: 补充样式**

在 `<style scoped>` 中替换现有 `.field-name-cell` 相关样式为：

```css
.field-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-card {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 10px;
}

.field-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.source-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}
```

保留 `.form-property-tab { padding: 0 4px; }`。

- [ ] **Step 3: 脚本清理 — 删除 `.field-name-cell` 遗留引用检查**

脚本（`<script setup>`）无需改动——`expandedField/toggleExpand/isMapped/mappingSummary` 及数据函数均已存在。确认模板中不再引用 `row` 变量、不再残留 `.field-name-cell` 类名。

- [ ] **Step 4: 运行测试确认 GREEN**

Run:
```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping\frontend
npx vitest run src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
```

Expected: 9 用例全部通过（2 筛选 + 2 配置 + 5 卡片交互）。

- [ ] **Step 5: 全量回归**

Run:
```bash
npx vitest run src/views/designer
npx vue-tsc --noEmit
```

Expected: designer 套件全部通过（27 用例）；vue-tsc 无错误。

- [ ] **Step 6: Commit**

```bash
cd D:\aicode\workflow\.worktrees\form-data-mapping
git add frontend/src/views/designer/properties/FormPropertyTab.vue frontend/src/views/designer/properties/__tests__/FormPropertyTabs.test.ts
git commit -m "feat: render field permission config as card list with accordion"
```