# 内嵌子流程前端支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为流程设计器补齐内嵌子流程（Embedded SubProcess）前端支持：创建入口、折叠/展开、双击进出编辑模式、属性面板、删除级联清理、起止事件校验。

**Architecture:** 复用 bpmn-js 原生 SubProcess 渲染/折叠/拖入能力；自定义部分集中在四处：新建 `utils/subflowNavigation.ts` 纯函数（外部元素收集/聚焦计算）、扩展 `designerStore`（子流程导航栈 + 视图快照）、扩展节点入口与属性面板分发、在 `ProcessDesigner.vue` 接入双击进出与删除级联。后端零改动（Flowable 8 原生支持）。

**Tech Stack:** Vue 3 + TypeScript + Vite + Pinia + Element Plus + bpmn-js 18.x + diagram-js + Vitest + @vue/test-utils

**Spec:** `docs/superpowers/specs/2026-08-19-embedded-subprocess-designer-design.md`

## Global Constraints

- 纯前端改动，**禁止修改 `backend/` 任何文件**
- 不改动 `NodeConfigData` 的 schema（子流程属性复用现有 `basic` 字段；仅新增 designerStore 的导航栈状态，与序列化无关）
- 所有测试用 Vitest，运行命令：`npx vitest run <path>`（workdir 为 `frontend/`）
- 提交风格遵循仓库历史：测试先行单独提交（消息形如 `test: <desc> (RED)`），实现通过后提交（消息形如 `feat: <desc>`）
- 全量验证命令：`npm run build`（tsc + vite build）、`npm run test`（vitest run）
- 中文界面文案；bpmn-js/diagram-js 内部 API 允许使用 `any` 类型（仓库现有惯例 `eslint-disable @typescript-eslint/no-explicit-any`）
- 进入子流程的导航状态**不持久化**：保存/重载回主流程视图

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/views/designer/utils/subflowNavigation.ts` | 新建 | 纯函数：层级判断、外部元素收集、聚焦 viewbox 计算 |
| `frontend/src/views/designer/utils/__tests__/subflowNavigation.test.ts` | 新建 | 上述纯函数单测 |
| `frontend/src/views/designer/utils/bpmnValidation.ts` | 修改 | 新增 `validateSubProcessBoundaries(xml)` |
| `frontend/src/views/designer/utils/__tests__/bpmnValidation.test.ts` | 修改 | 追加子流程校验 describe 块 |
| `frontend/src/stores/designerStore.ts` | 修改 | 新增 `subflowStack` / `subflowSnapshots` 及 actions |
| `frontend/src/stores/__tests__/designerStore.test.ts` | 修改 | 追加导航栈 describe 块 |
| `frontend/src/views/designer/components/NodePalette.vue` | 修改 | 活动组追加"内嵌子流程"条目 |
| `frontend/src/views/designer/utils/customContextPad.ts` | 修改 | 追加 `append.sub-process` |
| `frontend/src/views/designer/properties/SubProcessProperty.vue` | 新建 | 子流程属性面板：id/名称/描述 |
| `frontend/src/views/designer/properties/__tests__/SubProcessProperty.test.ts` | 新建 | 属性面板渲染与读写单测 |
| `frontend/src/views/designer/properties/PropertyPanel.vue` | 修改 | 分发链加 SubProcess 分支 + 类型标签 |
| `frontend/src/views/designer/ProcessDesigner.vue` | 修改 | 双击进出、删除级联（elements.deleted）、校验接入、面包屑事件 |
| `frontend/src/views/designer/components/toolbar/DesignerToolbar.vue` | 修改 | 顶部面包屑（基于导航栈） |
| `frontend/src/views/designer/utils/bpmnValidation.ts` 调用点（ProcessDesigner.vue 内 validateBpmnXml） | 修改 | 并入子流程起止事件校验结果 |

---

### Task 1: subflowNavigation 纯函数

**Files:**
- Create: `frontend/src/views/designer/utils/subflowNavigation.ts`
- Test: `frontend/src/views/designer/utils/__tests__/subflowNavigation.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，仅依赖 diagram-js 的 `Element` 类型：`{ id, type, parent }`）
- Produces:
  - `isDescendantOf(el: Element | null | undefined, ancestor: Element): boolean`
  - `collectExternalElements(subprocess: Element, registry: { getAll(): Element[] }): Element[]`（返回需隐藏的外部元素，排除 subprocess 自身与全部 label 元素）
  - `computeFocusViewbox(bounds: { x: number; y: number; width: number; height: number }, margin?: number): Viewbox`，`Viewbox = { x, y, width, height }`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/views/designer/utils/__tests__/subflowNavigation.test.ts
import { describe, it, expect } from 'vitest'
import { isDescendantOf, collectExternalElements, computeFocusViewbox } from '../subflowNavigation'
import type { Element } from 'bpmn-js/lib/model/Types'

function el(id: string, parent?: Element): Element {
  return { id, type: 'shape', parent: parent as any } as any
}

describe('isDescendantOf', () => {
  it('跟随 parent 链命中祖先', () => {
    const root = el('root')
    const sub = el('sub', root)
    const inner = el('inner', sub)
    expect(isDescendantOf(inner, sub)).toBe(true)
    expect(isDescendantOf(inner, root)).toBe(true)
  })

  it('非后代返回 false, null/undefined 输入返回 false', () => {
    const root = el('root')
    const other = el('other', root)
    expect(isDescendantOf(other, el('sub2'))).toBe(false)
    expect(isDescendantOf(null, root)).toBe(false)
  })
})

describe('collectExternalElements', () => {
  const root = el('root')
  const sub = el('sub', root)
  const inside1 = el('in1', sub)
  const inside2 = el('in2', sub)
  const outside = el('out', root)
  const label = { id: 'label_1', type: 'label', parent: root, labelTarget: inside1 } as any
  const registry = { getAll: () => [root, sub, inside1, inside2, outside, label] }

  it('排除子流程自身与 label，隐藏其外全部元素', () => {
    const result = collectExternalElements(sub, registry)
    expect(result.map(e => e.id).sort()).toEqual(['out', 'root'])
  })
})

describe('computeFocusViewbox', () => {
  it('围绕 bounds 加边距', () => {
    expect(computeFocusViewbox({ x: 100, y: 80, width: 200, height: 150 })).toEqual({
      x: 60, y: 40, width: 280, height: 230,
    })
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/views/designer/utils/__tests__/subflowNavigation.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// frontend/src/views/designer/utils/subflowNavigation.ts
import type { Element } from 'bpmn-js/lib/model/Types'

export interface Viewbox { x: number; y: number; width: number; height: number }

/** 沿 parent 链判断 el 是否为 ancestor 的（真）后代 */
export function isDescendantOf(el: Element | null | undefined, ancestor: Element): boolean {
  let cur: Element | null | undefined = el
  while (cur) {
    if (cur === ancestor) return true
    cur = cur.parent as Element | undefined
  }
  return false
}

/** 收集进入子流程后需要隐藏的外部元素（不含子流程自身、不含 label） */
export function collectExternalElements(
  subprocess: Element,
  registry: { getAll(): Element[] }
): Element[] {
  return registry.getAll().filter((el) => {
    if (el.type === 'label') return false
    if (el === subprocess) return false
    return !isDescendantOf(el, subprocess)
  })
}

/** 计算聚焦子流程的 viewbox（bounds 取自 element.getBoundingBox()） */
export function computeFocusViewbox(
  bounds: { x: number; y: number; width: number; height: number },
  margin = 40
): Viewbox {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/views/designer/utils/__tests__/subflowNavigation.test.ts`
Expected: PASS（3 describe 全部通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/designer/utils/subflowNavigation.ts frontend/src/views/designer/utils/__tests__/subflowNavigation.test.ts
git commit -m "feat: add subflow navigation pure functions with tests"
```

---

### Task 2: 子流程起止事件校验

**Files:**
- Modify: `frontend/src/views/designer/utils/bpmnValidation.ts`（文件末尾追加函数）
- Modify: `frontend/src/views/designer/utils/__tests__/bpmnValidation.test.ts`（追加 describe 块）

**Interfaces:**
- Consumes: 无（独立 DOM 解析）
- Produces: `validateSubProcessBoundaries(xml: string): string[]` — 返回错误消息列表，通过为空数组。每个子流程的 startEvent/endEvent 判定基于**直接子元素**（`sp.children` + `localName`），避免嵌套子流程互相误判。

- [ ] **Step 1: 写失败测试（追加到 bpmnValidation.test.ts）**

```ts
import { validateSubProcessBoundaries } from '../bpmnValidation'

const NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"'

describe('validateSubProcessBoundaries', () => {
  it('子流程含开始与结束事件时通过', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_1" name="入职">
        <startEvent id="s" /><endEvent id="e" />
      </subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual([])
  })

  it('子流程缺开始事件时报错并带名称', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_1" name="入职"><endEvent id="e" /></subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual(['内嵌子流程「入职」缺少开始事件'])
  })

  it('子流程缺结束事件时（未命名用 id 兜底）', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="sub_9"><startEvent id="s" /></subProcess>
    </process></definitions>`
    expect(validateSubProcessBoundaries(xml)).toEqual(['内嵌子流程「sub_9」缺少结束事件'])
  })

  it('嵌套子流程不互相误判', () => {
    const xml = `<definitions ${NS}><process id="p">
      <subProcess id="outer">
        <startEvent id="s" />
        <subProcess id="inner">
          <startEvent id="si" /><endEvent id="ei" />
        </subProcess>
        <endEvent id="e" />
      </subProcess>
    </process></definitions>`
    // outer 的直属子元素含 s 与 e；inner 直属含 si 与 ei → 均通过
    expect(validateSubProcessBoundaries(xml)).toEqual([])
  })

  it('无子流程的流程通过', () => {
    expect(validateSubProcessBoundaries(`<definitions ${NS}><process id="p"><startEvent id="s" /></process></definitions>`)).toEqual([])
  })

  it('XML 解析失败返回空数组', () => {
    expect(validateSubProcessBoundaries('<broken')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/views/designer/utils/__tests__/bpmnValidation.test.ts`
Expected: FAIL（`validateSubProcessBoundaries` 未定义）

- [ ] **Step 3: 实现**

```ts
// 追加到 bpmnValidation.ts 末尾
/** 校验每个内嵌子流程内部是否包含开始与结束事件（基于直接子元素，兼容命名空间前缀）。
 *  返回错误消息列表，无错误返回空数组。 */
export function validateSubProcessBoundaries(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const errors: string[] = []
  const subProcesses = doc.querySelectorAll('bpmn\\:subProcess, subProcess')
  subProcesses.forEach((sp) => {
    const name = sp.getAttribute('name') || sp.getAttribute('id') || '未命名'
    const children = Array.from(sp.children)
    const hasStart = children.some((c) => c.localName === 'startEvent')
    const hasEnd = children.some((c) => c.localName === 'endEvent')
    if (!hasStart) errors.push(`内嵌子流程「${name}」缺少开始事件`)
    if (!hasEnd) errors.push(`内嵌子流程「${name}」缺少结束事件`)
  })
  return errors
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/views/designer/utils/__tests__/bpmnValidation.test.ts`
Expected: PASS（新旧用例全部通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/designer/utils/bpmnValidation.ts frontend/src/views/designer/utils/__tests__/bpmnValidation.test.ts
git commit -m "feat: validate embedded subprocess start/end event boundaries"
```

---

### Task 3: designerStore 子流程导航栈

**Files:**
- Modify: `frontend/src/stores/designerStore.ts`
- Modify: `frontend/src/stores/__tests__/designerStore.test.ts`（追加 describe 块）

**Interfaces:**
- Consumes: 无
- Produces（Task 6 依赖）:
  - state: `subflowStack: Ref<string[]>`（空数组 = 主流程视图）
  - `subflowSnapshots: Ref<SubflowViewSnapshot[]>`，`SubflowViewSnapshot = { viewbox: { x: number; y: number; width: number; height: number } | null; hiddenIds: string[] }`
  - `isInsideSubflow: ComputedRef<boolean>`
  - `subflowBreadcrumbs: ComputedRef<{ id: string; name: string }[]>`（名称取自 nodeConfigs 的 `basic.name`，缺失给空串由界面兜底）
  - `enterSubflow(nodeId: string): void`（push；重复入栈防御；清空节点选中）
  - `exitSubflow(): void`（pop）
  - `exitAllSubflows(): void`
  - `pushSubflowSnapshot(snap: SubflowViewSnapshot): void`
  - `popSubflowSnapshot(): SubflowViewSnapshot | undefined`
  - `clearConfigs()` 同时清空导航栈与快照

- [ ] **Step 1: 写失败测试（追加到 designerStore.test.ts）**

```ts
describe('designerStore — 子流程导航栈', () => {
  it('enterSubflow 入栈并清空节点选中；重复入栈被忽略', () => {
    const store = useDesignerStore()
    store.selectNode('UserTask_1', 'bpmn:UserTask')
    store.enterSubflow('SubProcess_1')
    store.enterSubflow('SubProcess_1') // 重复
    expect(store.subflowStack).toEqual(['SubProcess_1'])
    expect(store.selectedNodeId).toBeNull()
    expect(store.selectedNodeType).toBeNull()
    expect(store.isInsideSubflow).toBe(true)
  })

  it('exitSubflow 弹栈；exitAllSubflows 清空', () => {
    const store = useDesignerStore()
    store.enterSubflow('A')
    store.enterSubflow('B')
    store.exitSubflow()
    expect(store.subflowStack).toEqual(['A'])
    store.exitAllSubflows()
    expect(store.subflowStack).toEqual([])
    expect(store.isInsideSubflow).toBe(false)
  })

  it('subflowBreadcrumbs 从 nodeConfigs 取名称', () => {
    const store = useDesignerStore()
    store.setNodeConfig('SubProcess_1', { basic: { name: '入职处理' } })
    store.enterSubflow('SubProcess_1')
    expect(store.subflowBreadcrumbs).toEqual([{ id: 'SubProcess_1', name: '入职处理' }])
  })

  it('快照 push/pop 配对', () => {
    const store = useDesignerStore()
    const snap = { viewbox: { x: 0, y: 0, width: 100, height: 100 }, hiddenIds: ['root'] }
    store.pushSubflowSnapshot(snap)
    expect(store.popSubflowSnapshot()).toEqual(snap)
    expect(store.popSubflowSnapshot()).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: FAIL（新增 state/action 不存在）

- [ ] **Step 3: 实现（designerStore.ts 内追加）**

```ts
export interface SubflowViewSnapshot {
  viewbox: { x: number; y: number; width: number; height: number } | null
  hiddenIds: string[]
}

//（在 setup 内追加）
const subflowStack = ref<string[]>([])
const subflowSnapshots = ref<SubflowViewSnapshot[]>([])
const isInsideSubflow = computed(() => subflowStack.value.length > 0)

const subflowBreadcrumbs = computed(() =>
  subflowStack.value.map((id) => {
    const cfg = getNodeConfig(id)
    return { id, name: cfg?.basic?.name ?? '' }
  })
)

function enterSubflow(nodeId: string) {
  if (subflowStack.value[subflowStack.value.length - 1] === nodeId) return
  subflowStack.value = [...subflowStack.value, nodeId]
  selectedNodeId.value = null
  selectedNodeType.value = null
}
function exitSubflow() { subflowStack.value = subflowStack.value.slice(0, -1) }
function exitAllSubflows() { subflowStack.value = [] }
function pushSubflowSnapshot(snap: SubflowViewSnapshot) { subflowSnapshots.value.push(snap) }
function popSubflowSnapshot(): SubflowViewSnapshot | undefined {
  return subflowSnapshots.value.pop()
}
```

`clearConfigs()` 内追加：`subflowStack.value = []`、`subflowSnapshots.value = []`。

return 对象追加：`subflowStack, subflowSnapshots, isInsideSubflow, subflowBreadcrumbs, enterSubflow, exitSubflow, exitAllSubflows, pushSubflowSnapshot, popSubflowSnapshot`。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/stores/__tests__/designerStore.test.ts`
Expected: PASS（新旧用例全部通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/designerStore.ts frontend/src/stores/__tests__/designerStore.test.ts
git commit -m "feat: add subflow navigation stack with snapshots to designer store"
```

---

### Task 4: 节点入口（面板 + 右键菜单）

**Files:**
- Modify: `frontend/src/views/designer/components/NodePalette.vue`
- Modify: `frontend/src/views/designer/utils/customContextPad.ts`
- Test: `frontend/src/views/designer/components/__tests__/NodePalette.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces: 画布可创建 `bpmn:SubProcess`（拖入/追加）

- [ ] **Step 1: 写失败测试（新建 NodePalette.test.ts）**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodePalette from '../NodePalette.vue'

describe('NodePalette — 内嵌子流程入口', () => {
  it('活动组渲染「内嵌子流程」条目', () => {
    const wrapper = mount(NodePalette)
    expect(wrapper.text()).toContain('内嵌子流程')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/views/designer/components/__tests__/NodePalette.test.ts`
Expected: FAIL（文本不含"内嵌子流程"）

- [ ] **Step 3: 实现**

NodePalette.vue `nodeGroups` 活动组 items 末尾追加：

```ts
{ type: 'bpmn:SubProcess', label: '内嵌子流程', description: '子流程容器，双击进入编辑', iconClass: 'bpmn-icon-sub-process' }
```

customContextPad.ts 的非开始节点入口块（`append.end-event` 之后）追加：

```ts
entries['append.sub-process'] = appendAction(
  'bpmn:SubProcess',
  'bpmn-icon-sub-process',
  '追加内嵌子流程'
)
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/views/designer/components/__tests__/NodePalette.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/designer/components/NodePalette.vue frontend/src/views/designer/components/__tests__/NodePalette.test.ts frontend/src/views/designer/utils/customContextPad.ts
git commit -m "feat: add embedded subprocess palette and context pad entries"
```

---

### Task 5: SubProcess 属性面板

**Files:**
- Create: `frontend/src/views/designer/properties/SubProcessProperty.vue`
- Modify: `frontend/src/views/designer/properties/PropertyPanel.vue`
- Test: `frontend/src/views/designer/properties/__tests__/SubProcessProperty.test.ts`（新建）

**Interfaces:**
- Consumes: `designerStore.getNodeConfig(id)` 的 `basic` 字段；`getModeler()`（`../utils/bpmnModeler`）；modeler 的 `elementRegistry` / `modeling`
- Produces: 读写节点 `basic.name` / `basic.description`；名称修改同步到 BPMN 元素（`modeling.updateProperties(element, { name })`）

- [ ] **Step 1: 写失败测试（新建 SubProcessProperty.test.ts）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../utils/bpmnModeler', () => ({
  getModeler: () => ({
    get: (name: string) => {
      if (name === 'elementRegistry') return { get: (id: string) => (id === 'SubProcess_1' ? fakeEl : null) }
      if (name === 'modeling') return { updateProperties: vi.fn() }
      return null
    },
  }),
}))

const fakeEl = {
  id: 'SubProcess_1',
  businessObject: { name: '入职处理', get: () => undefined },
}

import SubProcessProperty from '../SubProcessProperty.vue'
import { useDesignerStore } from '@/stores/designerStore'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('SubProcessProperty', () => {
  it('回填已有 basic.name 与 description', async () => {
    const store = useDesignerStore()
    store.selectNode('SubProcess_1', 'bpmn:SubProcess')
    store.setNodeConfig('SubProcess_1', { basic: { name: '入职处理', description: '负责入职事务' } })
    const wrapper = mount(SubProcessProperty, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const nameInput = wrapper.findAll('input').map((i) => i.element.value)
    expect(nameInput).toContain('入职处理')
    expect(nameInput).toContain('负责入职事务')
  })

  it('修改名称后写入 nodeConfig basic.name', async () => {
    const store = useDesignerStore()
    store.selectNode('SubProcess_1', 'bpmn:SubProcess')
    store.setNodeConfig('SubProcess_1', { basic: { name: '旧名' } })
    const wrapper = mount(SubProcessProperty, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const nameInput = wrapper.findAll('input')[0]
    await nameInput.setValue('新名')
    await flushPromises()
    const saved = store.getNodeConfig('SubProcess_1')
    expect(saved?.basic?.name).toBe('新名')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/views/designer/properties/__tests__/SubProcessProperty.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

SubProcessProperty.vue（参照 CallActivityProperty.vue 的排版：el-form + divider + disabled 只读态）：

```vue
<template>
  <el-form label-width="90px" size="small" :disabled="readOnly">
    <el-divider content-position="left">基本信息</el-divider>
    <el-form-item label="节点ID"><el-input v-model="config.id" disabled /></el-form-item>
    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：入职处理" @change="updateBpmn" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="config.description" type="textarea" :rows="3" @change="saveConfig" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'

defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()
const config = reactive({ id: '', name: '', description: '' })

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return
  const bo = element.businessObject
  config.id = element.id
  config.name = bo.name || ''
  config.description = designerStore.getNodeConfig(element.id)?.basic?.description || ''
}

function updateBpmn() {
  const modeler = getModeler()
  const modeling = (modeler as any).get('modeling')
  const element = (modeler as any).get('elementRegistry').get(designerStore.selectedNodeId)
  if (element) modeling.updateProperties(element, { name: config.name })
  saveConfig()
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  designerStore.setNodeConfig(designerStore.selectedNodeId, {
    basic: { name: config.name, description: config.description },
  })
}

onMounted(loadConfig)
watch(() => designerStore.selectedNodeId, (n, o) => { if (n && n !== o) loadConfig() })
</script>
```

PropertyPanel.vue 修改：
- import 区追加 `import SubProcessProperty from './SubProcessProperty.vue'`
- 模板分发链在 `<call-activity-property>` 之后追加：
```vue
<sub-process-property
  v-else-if="selectedNodeType === 'SubProcess'"
  :read-only="readOnly"
/>
```
- `nodeTypeLabel` 追加 `SubProcess: '内嵌子流程'`

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/views/designer/properties/__tests__/SubProcessProperty.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/designer/properties/SubProcessProperty.vue frontend/src/views/designer/properties/__tests__/SubProcessProperty.test.ts frontend/src/views/designer/properties/PropertyPanel.vue
git commit -m "feat: add subprocess property panel and wire into property panel"
```

---

### Task 6: 双击进出编辑模式 + 删除级联

**Files:**
- Modify: `frontend/src/views/designer/ProcessDesigner.vue`
- Modify: `frontend/src/views/designer/components/toolbar/DesignerToolbar.vue`

**Interfaces:**
- Consumes: Task 1 的 `collectExternalElements` / `computeFocusViewbox` / `isDescendantOf`；Task 3 的导航栈与快照；Task 5 的名称配置
- Produces: 进入/返回/删除级联的完整交互（无新导出；修改 initModeler 后的事件注册块与保存/部署校验调用）

**实现指引（ProcessDesigner.vue，在现有 eventBus 注册区的 `shape.remove` 监听处改造）：**

1. **删除级联：用 `elements.deleted` 替换 `shape.remove`**（bpmn-js 删除子流程时内部元素同批进入 `deleted` 列表）：

```ts
eventBus.on('elements.deleted', (event: any) => {
  const deleted: any[] = event.elements || []
  deleted.forEach((el: any) => { if (el.id) designerStore.deleteNodeConfig(el.id) })
  // 若栈顶子流程被删，自动退出该层级（恢复视图快照）
  const top = designerStore.subflowStack[designerStore.subflowStack.length - 1]
  if (top && deleted.some((el: any) => el.id === top)) {
    exitToSubflowLevel(designerStore.subflowStack.length - 1)
  }
})
```

2. **双击进入**（注册在 eventBus 上）：

```ts
eventBus.on('element.dblclick', (event: any) => {
  const el = event.element
  const bo = el && el.businessObject
  if (!bo || !bo.$instanceOf || !bo.$instanceOf('bpmn:SubProcess')) return
  event.preventDefault()
  enterSubprocessView(el)
})
```

3. **进入**：

```ts
function enterSubprocessView(el: any) {
  const modeler = getModeler()
  const canvas = modeler.get('canvas')
  const elementRegistry = modeler.get('elementRegistry')
  const modeling = modeler.get('modeling')

  if (el.collapsed) modeling.toggleCollapse(el)
  // 快照：当前整体 viewbox + 外部元素 id 列表
  const viewbox = canvas.viewbox()
  const hidden = collectExternalElements(el, elementRegistry)
  designerStore.pushSubflowSnapshot({
    viewbox: viewbox.scale ? { x: viewbox.x, y: viewbox.y, width: viewbox.width, height: viewbox.height } : null,
    hiddenIds: hidden.map((e: any) => e.id),
  })
  // 隐藏外部元素 graphics
  hidden.forEach((e: any) => { const g = canvas.getGraphics(e); if (g) g.style.display = 'none' })
  // 聚焦子流程内部
  const bounds = el.getBoundingBox()
  canvas.viewbox(computeFocusViewbox(bounds))
  designerStore.enterSubflow(el.id)
}
```

4. **返回指定层级**（面包屑点击调用；`level` 为栈下标，恢复到该层级：弹出到 level 后由该层快照恢复）：

```ts
function exitToSubflowLevel(level: number) {
  const modeler = getModeler()
  const canvas = modeler.get('canvas')
  const elementRegistry = modeler.get('elementRegistry')
  // 弹出至目标层，逐个恢复快照（仅最后恢复的生效，前面的快照叠加取最终态）
  while (designerStore.subflowStack.length > level) {
    const snap = designerStore.popSubflowSnapshot()
    const hidden = snap?.hiddenIds || []
    hidden.forEach((id) => {
      const e = elementRegistry.get(id)
      const g = e && canvas.getGraphics(e)
      if (g) g.style.display = ''
    })
    designerStore.exitSubflow()
  }
  const snap = designerStore.popSubflowSnapshot()
  if (snap?.viewbox) canvas.viewbox(snap.viewbox)
}
```

> 说明：快照栈与导航栈同深度同序。进入 N 层时各层快照的 viewbox 是"进入该层前的视图"，因此**只在退出到最外层时恢复最外层快照**（上方实现通过先弹掉嵌套层快照、最后 pop 外层快照实现；若 level 非最外层，恢复的是 level 层的视图）。

5. **工具栏事件**：ProcessDesigner 监听 DesignerToolbar 的新 emit（`@exit-subflow="exitToSubflowLevel(0)"`，可在模板上直接写；面包屑项点击 emit `@exit-to-level="exitToSubflowLevel"`）。

6. **保存/部署校验**：`validateBpmnXml` 内并入子流程校验：

```ts
const subErrors = validateSubProcessBoundaries(xml)
if (subErrors.length) return subErrors.join('；')
```

DesignerToolbar.vue 修改：
- 模板 center 区在 dirty tag 之后追加：

```vue
<el-breadcrumb v-if="subflowBreadcrumbs.length" separator="/" style="margin-left: 12px">
  <el-breadcrumb-item
    v-for="(crumb, i) in subflowBreadcrumbs"
    :key="crumb.id"
    @click="$emit('exit-to-level', i)"
  >{{ crumb.name || '未命名子流程' }}</el-breadcrumb-item>
</el-breadcrumb>
```

- script 追加 `const subflowBreadcrumbs = computed(() => designerStore.subflowBreadcrumbs)`
- emits 追加 `(e: 'exit-to-level', level: number): void`

**测试策略：** 本任务为 bpmn-js 深度集成，核心可测逻辑（层级判断/收集/聚焦计算/栈与快照/删除批次清理）已在 Task 1–3 单测覆盖；本任务以手动验证清单为准（见 Task 7）。

- [ ] **Step 1: 实现上述修改（本任务无新单测，逻辑已由前置任务测试覆盖）**

- [ ] **Step 2: 类型检查**

Run: `npx vue-tsc --noEmit`
Expected: 无新增类型错误（bpmn-js/diagram-js 内部 API 按仓库惯例以 `any` 访问）

- [ ] **Step 3: 手动验证进入/返回/删除（浏览器）**

验证项：
1. 从面板拖入子流程 → 拖入 startEvent/UserTask/endEvent → 连线 → 折叠/展开按钮生效
2. 双击展开态子流程 → 外部元素隐藏、视图聚焦；再次双击内部子流程 → 二级聚焦
3. 面包屑显示 `流程名 › 子流程名`；点击逐级返回，视图完整恢复（无残留隐藏）
4. 删除子流程 → 内部节点 config 被清理（浏览器 Network 查看 saveDesign 请求的 nodeConfigs 不含幽灵条目，或后端 DB `node_config` 表无孤儿行）
5. 保存 → 重载 → 子流程完整恢复（回到主流程视图）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/designer/ProcessDesigner.vue frontend/src/views/designer/components/toolbar/DesignerToolbar.vue
git commit -m "feat: enable dblclick drill-in/out editing for embedded subprocess"
```

---

### Task 7: 校验接入与端到端验证

**Files:**
- Modify: 无新文件（接入在 Task 6 已含；本任务为验证）

**Interfaces:**
- Consumes: 所有前置任务

- [ ] **Step 1: 空子流程部署被拦截**

部署一个子流程内无 startEvent 的流程 → 校验返回"缺少开始事件"，部署按钮不发起请求（或后端未被调用）。

- [ ] **Step 2: 子流程内含会签节点的部署（验证 MultiInstanceBpmnRewriter）**

1. 子流程内放含会签（multiMode=countersign）的 UserTask，保存并部署 → 部署成功、新版本生效
2. 运行 `npx vitest run src/stores src/views/designer` 覆盖前后端相关单测无回归
3. backend 测试全量无回归：`mvn test`（workdir 为 `backend/`）——仅确认无回归，不改后端

- [ ] **Step 3: 只读模式**

`/designer?procDefId=xxx&readonly=1` 打开含子流程的已部署版本 → 双击子流程聚焦查看；无编辑按钮；返回正常。

- [ ] **Step 4: 全量构建与测试**

Run: `npm run build` 与 `npm run test`（workdir 为 `frontend/`）
Expected: build 通过、全部测试通过

- [ ] **Step 5: 提交（如验证中发现需要修的问题，先修再提交；无修复则跳过）**

---

## Self-Review

**1. Spec 覆盖对照：**
- 创建入口（spec §4）→ Task 4 ✓
- 折叠/展开（spec §5.4 原生）→ Task 4/6 手动验证 ✓
- 双击进出 + 面包屑（spec §5）→ Task 6 ✓（栈/快照 Task 3，纯函数 Task 1）
- 属性面板（spec §4）→ Task 5 ✓
- 删除级联（spec §6）→ Task 6（elements.deleted，覆盖内部节点批次清理）✓
- 校验（spec §7）→ Task 2 + Task 6 接入 ✓
- 只读模式、保存重载、部署验证（spec §9.2/§10）→ Task 6.3/7 ✓

**2. 占位符检查：** 无 TBD/TODO；每个测试与实现步骤均含实际代码。Task 6 无新单测有明确理由（可测逻辑前置于 Task 1–3），风险由 Task 7 手动清单兜底。

**3. 类型一致性检查：**
- `subflowStack` / `pushSubflowSnapshot` / `popSubflowSnapshot` / `subflowBreadcrumbs` 在 Task 3 定义、Task 6 消费，签名一致 ✓
- `collectExternalElements` / `computeFocusViewbox` 在 Task 1 定义、Task 6 消费，签名一致 ✓
- `validateSubProcessBoundaries(xml): string[]` 在 Task 2 定义、Task 6 调用 ✓
- 快照恢复顺序：Task 6 的退出实现与 Task 3 快照栈"同深度同序"约定一致 ✓