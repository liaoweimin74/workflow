# 流程属性与审批人去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展流程设计器的流程属性面板，增加审批策略（含审批人去重）和流程编号配置，复用现有 `nodeConfigs` 存储机制，零后端改动。

**Architecture:** 流程级配置用固定 key `__PROCESS__` 存入 `designerStore.nodeConfigs`，随 `saveDesign` API 一起持久化到 `wf_node_config` 表。`ProcessProperty.vue` 重写为分区布局，读写 `nodeConfigs['__PROCESS__']`。`ProcessDesigner.vue` 的 `handleSave`/`handleDeploy` 中 `categoryId` 改为从该配置读取。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Element Plus + Vitest

## Global Constraints

- 前端框架: Vue 3 `<script setup lang="ts">`，Composition API
- UI 库: Element Plus，组件 size 用 `small`
- 状态管理: Pinia (`defineStore` 函数式)
- 测试: Vitest + `@vue/test-utils`，`mount` + `global.plugins: [ElementPlus]`
- 类型安全: 禁止 `as any` / `@ts-ignore`
- 提交信息: `feat:` / `fix:` 前缀，英文

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `frontend/src/stores/designerStore.ts` | 修改 | 新增 `ProcessConfigData` 接口、`PROCESS_CONFIG_KEY` 常量、`getProcessConfig`/`setProcessConfig` 方法 |
| `frontend/src/views/designer/properties/ProcessProperty.vue` | 重写 | 分区布局：基本信息 / 审批策略 / 流程编号 |
| `frontend/src/views/designer/ProcessDesigner.vue` | 修改 | `handleSave`/`handleDeploy` 中 `categoryId` 从 `__PROCESS__` 配置读取 |
| `frontend/src/stores/__tests__/designerStore.test.ts` | 新建 | 测试 `getProcessConfig`/`setProcessConfig` |

---

### Task 1: designerStore 新增流程配置类型与方法

**Files:**
- Modify: `frontend/src/stores/designerStore.ts`
- Test: `frontend/src/stores/__tests__/designerStore.test.ts`

**Interfaces:**
- Produces: `PROCESS_CONFIG_KEY` (const `string`), `ProcessConfigData` (interface), `getProcessConfig()` → `ProcessConfigData`, `setProcessConfig(config: ProcessConfigData)` → `void`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/stores/__tests__/designerStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDesignerStore, PROCESS_CONFIG_KEY, DEFAULT_PROCESS_CONFIG, type ProcessConfigData } from '../designerStore'

describe('designerStore — 流程配置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('getProcessConfig 返回默认值当未配置时', () => {
    const store = useDesignerStore()
    const config = store.getProcessConfig()
    expect(config).toEqual(DEFAULT_PROCESS_CONFIG)
  })

  it('setProcessConfig 写入后 getProcessConfig 读回相同值', () => {
    const store = useDesignerStore()
    const custom: ProcessConfigData = {
      ...DEFAULT_PROCESS_CONFIG,
      name: '请假流程',
      categoryId: 'cat-1',
      approvalPolicy: {
        ...DEFAULT_PROCESS_CONFIG.approvalPolicy,
        deduplication: {
          ...DEFAULT_PROCESS_CONFIG.approvalPolicy.deduplication,
          enabled: true,
          scope: 'GLOBAL',
          action: 'SKIP',
        },
      },
    }
    store.setProcessConfig(custom)
    expect(store.getProcessConfig()).toEqual(custom)
  })

  it('setProcessConfig 写入 nodeConfigs 的 __PROCESS__ key', () => {
    const store = useDesignerStore()
    store.setProcessConfig(DEFAULT_PROCESS_CONFIG)
    expect(store.nodeConfigs[PROCESS_CONFIG_KEY]).toBeDefined()
    expect(JSON.parse(store.nodeConfigs[PROCESS_CONFIG_KEY]).name).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: FAIL — `PROCESS_CONFIG_KEY` / `DEFAULT_PROCESS_CONFIG` / `getProcessConfig` not exported

- [ ] **Step 3: Add types and methods to designerStore.ts**

In `frontend/src/stores/designerStore.ts`, after the existing `NodeConfigData` interface (line ~33), add:

```typescript
// ========== 流程级配置 ==========
export const PROCESS_CONFIG_KEY = '__PROCESS__'

export interface ProcessConfigData {
  name: string
  key: string
  categoryId: string | null
  description: string
  approvalPolicy: {
    deduplication: {
      enabled: boolean
      scope: 'GLOBAL' | 'PHASE'
      action: 'AUTO_PASS' | 'SKIP' | 'ESCALATE'
    }
    allowRecall: boolean
    allowAddSigner: boolean
    allowDelegate: boolean
  }
  numberRule: {
    enabled: boolean
    pattern: string
  }
}

export const DEFAULT_PROCESS_CONFIG: ProcessConfigData = {
  name: '',
  key: '',
  categoryId: null,
  description: '',
  approvalPolicy: {
    deduplication: {
      enabled: false,
      scope: 'GLOBAL',
      action: 'AUTO_PASS',
    },
    allowRecall: true,
    allowAddSigner: true,
    allowDelegate: true,
  },
  numberRule: {
    enabled: false,
    pattern: '{{year}}-{{seq:4}}',
  },
}
```

Then inside the `defineStore('designer', () => { ... })` body, after `getNodeConfig` (around line 101), add:

```typescript
function getProcessConfig(): ProcessConfigData {
  const raw = nodeConfigs.value[PROCESS_CONFIG_KEY]
  if (!raw) return { ...DEFAULT_PROCESS_CONFIG }
  try {
    const parsed = JSON.parse(raw) as Partial<ProcessConfigData>
    return {
      ...DEFAULT_PROCESS_CONFIG,
      ...parsed,
      approvalPolicy: {
        ...DEFAULT_PROCESS_CONFIG.approvalPolicy,
        ...parsed.approvalPolicy,
        deduplication: {
          ...DEFAULT_PROCESS_CONFIG.approvalPolicy.deduplication,
          ...parsed.approvalPolicy?.deduplication,
        },
      },
      numberRule: {
        ...DEFAULT_PROCESS_CONFIG.numberRule,
        ...parsed.numberRule,
      },
    }
  } catch {
    return { ...DEFAULT_PROCESS_CONFIG }
  }
}

function setProcessConfig(config: ProcessConfigData) {
  nodeConfigs.value = {
    ...nodeConfigs.value,
    [PROCESS_CONFIG_KEY]: JSON.stringify(config),
  }
  isDirty.value = true
}
```

Then in the `return { ... }` statement at the end of the store, add:

```typescript
getProcessConfig,
setProcessConfig,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Run type check**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: No errors related to designerStore

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/designerStore.ts frontend/src/stores/__tests__/designerStore.test.ts
git commit -m "feat: add ProcessConfigData type and get/setProcessConfig to designerStore"
```

---

### Task 2: 重写 ProcessProperty.vue 为分区布局

**Files:**
- Modify: `frontend/src/views/designer/properties/ProcessProperty.vue`

**Interfaces:**
- Consumes: `getProcessConfig()`, `setProcessConfig()` from Task 1, `categoryApi.list()` from existing API, `getModeler()` from existing utils
- Produces: A Vue component that renders 3 sections (基本信息 / 审批策略 / 流程编号) and persists to `nodeConfigs['__PROCESS__']`

**Note:** 此任务无单元测试——组件依赖 bpmn-js modeler 和 canvas，无法在 vitest 中 mock。通过类型检查 + 手动验证。

- [ ] **Step 1: Rewrite ProcessProperty.vue**

Replace the entire content of `frontend/src/views/designer/properties/ProcessProperty.vue` with:

```vue
<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="流程名称">
      <el-input v-model="config.name" placeholder="请输入流程名称" @change="syncToStore" />
    </el-form-item>

    <el-form-item label="流程标识">
      <el-input v-model="config.key" placeholder="process_key" disabled />
    </el-form-item>

    <el-form-item label="流程分类">
      <el-tree-select
        v-model="config.categoryId"
        :data="categoryTree"
        :props="{ label: 'name', value: 'id', children: 'children' }"
        placeholder="请选择分类"
        clearable
        check-strictly
        style="width: 100%"
        @change="syncToStore"
      />
    </el-form-item>

    <el-form-item label="流程描述">
      <el-input
        v-model="config.description"
        type="textarea"
        :rows="3"
        placeholder="请输入流程描述"
        @change="syncToStore"
      />
    </el-form-item>

    <el-divider content-position="left">审批策略</el-divider>

    <el-form-item label="审批人去重">
      <el-switch v-model="config.approvalPolicy.deduplication.enabled" @change="syncToStore" />
    </el-form-item>

    <template v-if="config.approvalPolicy.deduplication.enabled">
      <el-form-item label="去重范围">
        <el-radio-group v-model="config.approvalPolicy.deduplication.scope" @change="syncToStore">
          <el-radio value="GLOBAL">全流程</el-radio>
          <el-radio value="PHASE">同一阶段</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="去重行为">
        <el-radio-group v-model="config.approvalPolicy.deduplication.action" @change="syncToStore">
          <el-radio value="AUTO_PASS">自动通过</el-radio>
          <el-radio value="SKIP">跳过节点</el-radio>
          <el-radio value="ESCALATE">转交上级</el-radio>
        </el-radio-group>
      </el-form-item>
    </template>

    <el-form-item label="允许撤回">
      <el-switch v-model="config.approvalPolicy.allowRecall" @change="syncToStore" />
    </el-form-item>

    <el-form-item label="允许加签">
      <el-switch v-model="config.approvalPolicy.allowAddSigner" @change="syncToStore" />
    </el-form-item>

    <el-form-item label="允许转办">
      <el-switch v-model="config.approvalPolicy.allowDelegate" @change="syncToStore" />
    </el-form-item>

    <el-divider content-position="left">流程编号</el-divider>

    <el-form-item label="自动编号">
      <el-switch v-model="config.numberRule.enabled" @change="syncToStore" />
    </el-form-item>

    <el-form-item v-if="config.numberRule.enabled" label="编号规则">
      <el-input
        v-model="config.numberRule.pattern"
        placeholder="{{year}}-{{seq:4}}"
        @change="syncToStore"
      />
      <div v-if="numberPreview" style="color: #999; font-size: 12px; margin-top: 4px">
        预览：{{ numberPreview }}
      </div>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue'
import { useDesignerStore, DEFAULT_PROCESS_CONFIG, type ProcessConfigData } from '@/stores/designerStore'
import { categoryApi, type Category } from '@/api/category'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

const config = reactive<ProcessConfigData>(JSON.parse(JSON.stringify(DEFAULT_PROCESS_CONFIG)))

const categoryTree = ref<any[]>([])

const numberPreview = computed(() => {
  if (!config.numberRule.enabled || !config.numberRule.pattern) return ''
  const year = new Date().getFullYear()
  return config.numberRule.pattern
    .replace('{{year}}', String(year))
    .replace('{{seq:4}}', '0001')
    .replace('{{seq}}', '1')
})

onMounted(async () => {
  // 加载分类树
  try {
    const res = await categoryApi.list()
    categoryTree.value = buildTree(res.data || [])
  } catch {
    // ignore
  }

  // 从 store 读取流程配置
  const stored = designerStore.getProcessConfig()
  Object.assign(config, stored)

  // 从 BPMN XML 读取流程名称和 key（覆盖 store 中的值）
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const rootElement = canvas.getRootElement()
  const bo = rootElement?.businessObject
  if (bo) {
    config.name = bo.name || ''
    config.key = bo.id || ''
  }

  syncToStore()
})

watch(config, () => {
  designerStore.setDraft(designerStore.draftId || '', config.name, config.key)
}, { deep: true })

function syncToStore() {
  designerStore.setProcessConfig({ ...config })
}

function buildTree(items: Category[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}
</script>
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: No errors related to ProcessProperty

- [ ] **Step 3: Manual verification**

Start dev server, open process designer, click canvas empty area, verify:
1. 属性面板显示 3 个分区
2. 基本信息区：流程名称可编辑，流程标识只读，流程分类为树形选择
3. 审批策略区：审批人去重开关关闭时，范围和行为字段隐藏
4. 开启去重后，范围和行为字段出现
5. 流程编号区：开关关闭时，编号规则隐藏
6. 修改任意字段后保存，重新加载设计器，配置仍然存在

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/designer/properties/ProcessProperty.vue
git commit -m "feat: rewrite ProcessProperty with approval policy and number rule sections"
```

---

### Task 3: 修复 handleSave/handleDeploy 中 categoryId 硬编码

**Files:**
- Modify: `frontend/src/views/designer/ProcessDesigner.vue:252-258` (handleSave)
- Modify: `frontend/src/views/designer/ProcessDesigner.vue:285-291` (handleDeploy)

**Interfaces:**
- Consumes: `getProcessConfig()` from Task 1, `PROCESS_CONFIG_KEY` from Task 1

- [ ] **Step 1: Fix handleSave categoryId**

In `frontend/src/views/designer/ProcessDesigner.vue`, find the `handleSave` function (around line 252). Replace:

```typescript
    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: null,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
```

with:

```typescript
    const processConfig = designerStore.getProcessConfig()
    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: processConfig.categoryId,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
```

- [ ] **Step 2: Fix handleDeploy categoryId**

In the same file, find the `handleDeploy` function (around line 285). Replace:

```typescript
    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: null,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
```

with:

```typescript
    const processConfig = designerStore.getProcessConfig()
    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: processConfig.categoryId,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
```

- [ ] **Step 3: Run type check**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: No errors related to ProcessDesigner

- [ ] **Step 4: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass, no regressions

- [ ] **Step 5: Manual verification**

1. 打开流程设计器，在流程属性中选择一个分类
2. 保存流程
3. 返回流程列表，确认列表中显示正确的分类
4. 重新打开设计器，确认分类仍为之前选择的值

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/designer/ProcessDesigner.vue
git commit -m "fix: read categoryId from process config instead of hardcoded null"
```

---

### Task 4: 加载编辑器时回填流程属性

**Files:**
- Modify: `frontend/src/views/designer/ProcessDesigner.vue:102-109`

**Problem:** 当 `loadEditor` 返回数据时，`nodeConfigs` 中可能包含 `__PROCESS__` key，但如果该流程是旧数据（没有 `__PROCESS__` 配置），`ProcessProperty.vue` 的 `onMounted` 会用 `DEFAULT_PROCESS_CONFIG`。然而 `categoryId` 等基本信息需要从 `editorData` 回填到 store，否则 `ProcessProperty` 加载时读不到。

- [ ] **Step 1: Add process config initialization in loadEditor**

In `frontend/src/views/designer/ProcessDesigner.vue`, find the `loadEditor` section (around line 103-109):

```typescript
    const res = await processDesignApi.loadEditor(draftId)
    const editorData = res.data

    designerStore.setDraft(editorData.id, editorData.name, editorData.key)
    designerStore.setBpmnXml(editorData.bpmnXml)
    designerStore.setNodeConfigs(editorData.nodeConfigs || {})
    designerStore.setSavedSnapshot(editorData.bpmnXml, editorData.nodeConfigs || {})
    designerStore.markClean()
```

After `designerStore.setNodeConfigs(editorData.nodeConfigs || {})`, add:

```typescript
    // 确保流程级配置存在，回填基本信息
    const processConfig = designerStore.getProcessConfig()
    processConfig.name = editorData.name
    processConfig.key = editorData.key
    processConfig.categoryId = editorData.categoryId || null
    designerStore.setProcessConfig(processConfig)
```

- [ ] **Step 2: Run type check**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Manual verification**

1. 打开一个已有流程的设计器
2. 点击画布空白处查看流程属性
3. 确认流程名称、标识、分类已正确回填
4. 确认审批策略和流程编号区域显示默认值

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/designer/ProcessDesigner.vue
git commit -m "feat: backfill process config from editor data on load"
```
