<template>
  <div class="logic-flow-designer">
    <!-- ===== 顶部工具条 ===== -->
    <div class="designer-toolbar">
      <el-button class="toolbar-btn" :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />

      <el-tooltip :content="`标识：${flowKey}`" placement="bottom" effect="dark" :show-after="120">
        <span class="flow-key">{{ flowKey }}</span>
      </el-tooltip>
      <el-tag :type="statusTagType" size="small" effect="light">{{ statusLabel }}</el-tag>
      <el-tag v-if="flowVersion > 0" size="small" type="info" effect="plain">v{{ flowVersion }}</el-tag>

      <el-input
        v-model="flowName"
        class="name-input"
        maxlength="128"
        placeholder="请输入流程名称"
      >
        <template #suffix>
          <span v-if="dirty" class="dirty-dot" title="有未保存的变更"></span>
        </template>
      </el-input>

      <div class="toolbar-spacer" />

      <el-tooltip content="撤销（Ctrl+Z）" placement="bottom">
        <el-button
          class="toolbar-btn"
          :icon="RefreshLeft"
          :disabled="!canUndo"
          @click="undo"
        />
      </el-tooltip>
      <el-tooltip content="重做（Ctrl+Shift+Z）" placement="bottom">
        <el-button
          class="toolbar-btn"
          :icon="RefreshRight"
          :disabled="!canRedo"
          @click="redo"
        />
      </el-tooltip>
      <el-tooltip content="自动整理布局（自上而下分层 · 节点垂直居中对齐 · 循环体纵向居中排列 · 嵌套批处理从左到右展开）" placement="bottom">
        <el-button class="toolbar-btn" :icon="Sort" @click="handleAutoLayout">整理布局</el-button>
      </el-tooltip>
      <el-tooltip content="声明本流的输入参数（运行测试时按声明渲染表单）" placement="bottom">
        <el-button class="toolbar-btn" :icon="Tickets" @click="inputVarsDialogVisible = true">
          输入参数
          <el-badge v-if="inputVars.length" :value="inputVars.length" class="iv-badge" />
        </el-button>
      </el-tooltip>
      <el-divider direction="vertical" />

      <el-button :icon="Finished" :loading="saving" @click="handleSave()">保存</el-button>
      <el-button :icon="Promotion" :loading="publishing" @click="handlePublish">发布</el-button>
      <el-button type="primary" :icon="VideoPlay" :loading="saving" @click="handleRunTest">运行测试</el-button>
    </div>

    <!-- ===== 三栏主体：左调色板（悬浮）/ 中画布 / 右属性面板（悬浮） ===== -->
    <div class="designer-body">
      <node-palette v-model:collapsed="paletteCollapsed" @add="addNodeAtCenter" />

      <div class="canvas-container">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="logic-flow-canvas"
          :delete-key-code="['Delete', 'Backspace']"
          :auto-connect="false"
          :default-edge-options="defaultEdgeOptions"
          :snap-to-grid="true"
          :snap-grid="[10, 10]"
          :min-zoom="0.2"
          :max-zoom="2"
          @connect="onConnect"
          @node-click="onNodeClick"
          @node-double-click="onNodeDoubleClick"
          @pane-click="onPaneClick"
          @edge-double-click="onEdgeDoubleClick"
          @node-drag-stop="onNodeDragStop"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @dragover.prevent
          @drop="handleDrop"
        >
          <template #node-logic="nodeProps">
            <!-- START 角标隐藏（data 推导；引擎层另有 node.deletable=false 双保险） -->
            <FlowNode
              :id="nodeProps.id"
              :data="nodeProps.data"
              :selected="nodeProps.selected"
              :status="runStatusMap[nodeProps.id] ?? ''"
              :deletable="nodeProps.data?.nodeType !== 'START'"
              @delete="removeNode"
            />
          </template>

          <!-- BATCH 空循环自环：右侧 U 形自定义边（dsl.createLoopEdge 自环时 type='loop'） -->
          <template #edge-loop="loopEdgeProps">
            <LoopEdge v-bind="loopEdgeProps" />
          </template>

          <Background :gap="18" :size="1.6" />
          <MiniMap position="bottom-right" pannable zoomable :node-color="miniMapNodeColor" />
          <Controls position="bottom-left" />
        </VueFlow>

        <!-- 空画布引导 -->
        <div v-if="!loading && nodes.length === 0" class="canvas-empty-hint">
          <el-icon class="empty-icon"><MagicStick /></el-icon>
          <div class="empty-title">从左侧拖入「开始」节点开始编排</div>
          <div class="empty-desc">拖拽/点击添加 · 节点拖到连线（含循环虚线）自动接入 · 按住 Shift 拖动解绑 · 双击链上节点移出 · Delete 删除</div>
        </div>
      </div>

      <property-panel
        v-model:collapsed="panelCollapsed"
        :node="selectedNode"
        :loop-body-count="selectedLoopBodyCount"
        :variables="availableVars"
        @remove="removeNode"
      />
    </div>

    <!-- 运行测试（与列表页共用） -->
    <RunTestDialog
      v-model="runDialogVisible"
      :flow-id="flowId"
      :flow-name="flowName"
      @traces="onRunTraces"
    />

    <!-- 输入参数声明编辑 -->
    <el-dialog
      v-model="inputVarsDialogVisible"
      width="720px"
      :close-on-click-modal="false"
      append-to-body
    >
      <template #header>
        <FieldLabel
          label="输入参数声明"
          tip="声明本流需要调用方传入的参数（保存在 DSL 中，仅作契约展示，引擎不强制校验）。也可不声明，运行测试时会自动扫描画布引用的变量给出建议；行尾上传图标为结构单一入口：可粘贴 JSON 实例导入字段结构，formData 参数还可从绑定表单一键导入，已导入后同一入口可查看结构树/清除。节点选择变量时即可展开选到具体字段"
        />
      </template>
      <div v-if="!inputVars.length" class="iv-empty">未声明入参</div>
      <div v-for="(v, i) in inputVars" :key="i" class="iv-row-wrap">
        <div class="iv-row" :class="{ 'is-json': v.type === 'json' }">
          <el-input v-model="v.name" placeholder="变量名" style="width: 160px" />
          <el-select v-model="v.type" style="width: 110px">
            <el-option label="string" value="string" />
            <el-option label="number" value="number" />
            <el-option label="boolean" value="boolean" />
            <el-option label="json" value="json" />
          </el-select>
          <el-switch v-model="v.required" active-text="必填" style="flex-shrink: 0" />
          <el-input v-model="v.desc" placeholder="说明（可选）" style="flex: 1" />
          <el-button size="small" text type="danger" class="iv-del-btn" title="删除参数" @click="inputVars.splice(i, 1)">
            <el-icon><Delete /></el-icon>
          </el-button>
          <!-- 结构单一入口（menu 模式）：查看树 / JSON 实例导入 / 绑定表单导入 / 清除，替代两图标并列防拥挤；
               已导入时图标变绿 + 字段数徽标 → 变量选择器可展开选到字段 -->
          <JsonInstanceImport
            v-if="v.type === 'json' || v.name.trim() === 'formData'"
            mode="menu"
            :is-form-data="v.name.trim() === 'formData'"
            :structure="v.structure"
            @import="(fields) => (v.structure = fields)"
            @import-form="importFormStructure(v)"
            @clear="v.structure = undefined"
          />
        </div>
      </div>
      <el-button size="small" text type="primary" @click="addInputVar">添加入参</el-button>
      <!-- 从触发点事件导入参数：与表单逻辑流绑定联动（绑定下拉按参数完全匹配过滤）。
           单个分组可折叠下拉：按表单类型分组展示全部触发点（分组标题加粗、可折叠），免先选类型再选事件的两步级联 -->
      <div class="iv-import">
        <div class="iv-import-head">
          <span class="iv-import-title">从触发点导入</span>
          <span class="iv-import-tip">选择触发点事件一键导入，入参声明与事件参数完全一致后，表单绑定弹窗的下拉才会显示本流</span>
        </div>
        <div class="iv-import-row">
          <TriggerGroupSelect
            v-model="importTrigger"
            :groups="importTriggerGroups"
            width="264px"
            placeholder="选择触发点事件（按表单类型分组）"
            filterable
          />
          <el-button size="small" type="primary" plain :disabled="!importTrigger" @click="importTriggerParams">
            导入参数
          </el-button>
          <span v-if="importTriggerSpec.length" class="iv-import-count">{{ importTriggerSpec.length }} 项</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="inputVarsDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Delete,
  Finished,
  MagicStick,
  Promotion,
  RefreshLeft,
  RefreshRight,
  Sort,
  Tickets,
  VideoPlay,
} from '@element-plus/icons-vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import type { Connection, EdgeChange, EdgeMouseEvent, NodeChange, NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import NodePalette from './components/NodePalette.vue'
import FlowNode from './components/FlowNode.vue'
import LoopEdge from './components/LoopEdge.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import RunTestDialog from './components/RunTestDialog.vue'
import FieldLabel from './components/FieldLabel.vue'
import TriggerGroupSelect from '@/components/TriggerGroupSelect.vue'
import type { TriggerGroupSelectGroup } from '@/components/TriggerGroupSelect.vue'
import JsonInstanceImport from './components/JsonInstanceImport.vue'
import { logicFlowApi } from '@/api/logicFlow'
import { FORM_LOGIC_TRIGGERS, triggerParamSpec } from '@/api/formLogicBinding'
import {
  BATCH_BODY_TYPES,
  LOOP_HANDLE_END,
  LOOP_HANDLE_START,
  createLoopEdge,
  createNodeId,
  defaultConfig,
  defaultNodeName,
  isDslEqual,
  isLoopEdge,
  parseDsl,
  serializeDsl,
} from './utils/dsl'
import type { FlowEdge, FlowNode as FlowNodeModel, InputVarDef, LogicNodeType } from './utils/dsl'
import {
  collectAvailableVars,
  formFieldGroupsToFieldNodes,
  type FormFieldGroupLike,
} from './utils/flowVars'
import { statFields } from './utils/jsonStructure'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import './styles/logicflow-theme.css'

defineOptions({ name: 'LogicFlowDesigner' })

const route = useRoute()
const router = useRouter()

const flowId = String(route.params.id ?? '')

// ===== vue-flow 控制句柄（useVueFlow 在渲染 <VueFlow> 的组件中调用即接管实例） =====
// storeEdges/storeNodes：store 实时真值（v-model 数组同步滞后于删除，自愈必须读 store）
const {
  screenToFlowCoordinate,
  addNodes,
  addEdges,
  removeNodes,
  removeEdges,
  fitView,
  edges: storeEdges,
  nodes: storeNodes,
} = useVueFlow()

/** store 实时真值（FlowEdge 子集形态）：编程式 addEdges/removeEdges 后
 * v-model 数组滞后不回写（healBatchLoops 同源问题），
 * 链判定/吸附/拆装一律读 store，禁读 v-model 副本 */
function allNodes(): FlowNodeModel[] {
  return (storeNodes.value ?? []) as unknown as FlowNodeModel[]
}

function allEdges(): FlowEdge[] {
  return (storeEdges.value ?? []) as unknown as FlowEdge[]
}

// ===== 画布数据 =====
const nodes = ref<FlowNodeModel[]>([])
const edges = ref<FlowEdge[]>([])
const loading = ref(false)

/** 新连线默认样式：折线 + 箭头（可拖拽端点重连） */
const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  updatable: true,
}

// ===== 入参声明（保存在 DSL 顶层 inputVars） =====
const inputVars = ref<InputVarDef[]>([])
const inputVarsDialogVisible = ref(false)

function addInputVar() {
  inputVars.value.push({ name: '', type: 'string', required: false, desc: undefined })
}

/** formData 入参一键导入绑定表单字段结构（formFieldGroups 由设计器设计期发现加载） */
function importFormStructure(v: InputVarDef): void {
  const fields = formFieldGroupsToFieldNodes(formFieldGroups.value)
  if (!fields.length) {
    ElMessage.warning('未获取到绑定表单的字段结构：请先在「表单逻辑」为本流绑定表单后重试')
    return
  }
  v.structure = fields
  ElMessage.success(`已导入表单结构：${statFields(fields).total} 个字段`)
}

// ===== 从触发点事件导入参数（与表单逻辑流绑定联动） =====
const importTrigger = ref('')

/** 触发点按表单类型分组（业务表单 / 工作流表单），单个下拉直达，免两步级联选择；extra 展示参数数量 */
const FORM_TYPE_LABELS: Record<string, string> = {
  BUSINESS: '业务表单',
  WORKFLOW: '工作流表单',
}
const importTriggerGroups = computed<TriggerGroupSelectGroup[]>(() => {
  const groups: TriggerGroupSelectGroup[] = []
  for (const t of FORM_LOGIC_TRIGGERS) {
    let g = groups.find((x) => x.key === t.formType)
    if (!g) {
      g = { key: t.formType, label: FORM_TYPE_LABELS[t.formType] ?? t.formType, triggers: [] }
      groups.push(g)
    }
    g.triggers.push({
      value: t.value,
      label: t.label,
      extra: `${triggerParamSpec(t.value)?.length ?? 0} 项参数`,
    })
  }
  return groups
})
const importTriggerSpec = computed(() =>
  importTrigger.value ? triggerParamSpec(importTrigger.value) || [] : [],
)

async function importTriggerParams() {
  const spec = triggerParamSpec(importTrigger.value)
  if (!spec?.length) {
    ElMessage.warning('该触发点暂无参数规格')
    return
  }
  const label = FORM_LOGIC_TRIGGERS.find((t) => t.value === importTrigger.value)?.label ?? importTrigger.value
  if (inputVars.value.length) {
    try {
      await ElMessageBox.confirm(
        `导入「${label}」的 ${spec.length} 项参数将覆盖当前已声明的 ${inputVars.value.length} 项入参，确定继续吗？`,
        '覆盖确认',
        { type: 'warning' },
      )
    } catch {
      return
    }
  }
  inputVars.value = spec.map((p) => ({ name: p.name, type: p.type, required: p.required, desc: p.desc }))
  ElMessage.success(`已导入「${label}」参数 ${spec.length} 项`)
}

// ===== 流程元信息 =====
const flowKey = ref('')
const flowName = ref('')
const flowDescription = ref('')
const flowStatus = ref<'DRAFT' | 'PUBLISHED'>('DRAFT')
const flowVersion = ref(0)

// ===== 保存快照与脏检测 =====
const savedDsl = ref('')
const savedName = ref('')
const saving = ref(false)
const publishing = ref(false)

const dirty = computed(() => {
  if (flowName.value !== savedName.value) return true
  if (!savedDsl.value) return false
  return !isDslEqual(serializeDsl(allNodes(), allEdges(), inputVars.value), savedDsl.value)
})

// 说明：拖动/增删节点/边时 vue-flow 会把 store 快照回写到 v-model 数组（新引用），
// dirty computed 依赖 nodes/edges 两个 ref，会随之重新求值。

const statusTagType = computed(() => (flowStatus.value === 'PUBLISHED' ? 'success' : 'info'))
const statusLabel = computed(() => (flowStatus.value === 'PUBLISHED' ? '已发布' : '草稿'))

// ===== 选中节点 =====
const selectedNodeId = ref<string | null>(null)
const selectedNode = computed<FlowNodeModel | null>(
  () => nodes.value.find((n) => n.id === selectedNodeId.value) ?? null
)

/** 选中批处理节点的循环体步数（画布实时链长，属性面板提示用） */
const selectedLoopBodyCount = computed(() => {
  const id = selectedNodeId.value
  if (!id) return 0
  const batch = allNodes().find((n) => n.id === id)
  if (!batch || batch.data.nodeType !== 'BATCH') return 0
  const loopEdges = allEdges().filter(isLoopEdge)
  const start = loopEdges.find((e) => e.source === id && e.sourceHandle === LOOP_HANDLE_START)
  if (!start) return 0
  const visited = new Set([id])
  let cur: string | undefined = start.target
  let count = 0
  let guard = 0
  while (cur && !visited.has(cur) && guard++ < 100) {
    visited.add(cur)
    const node = allNodes().find((n) => n.id === cur)
    if (node && (BATCH_BODY_TYPES as string[]).includes(node.data.nodeType)) count++
    const next = loopEdges.find((e) => e.source === cur)
    if (!next) break
    cur = next.target
  }
  return count
})

/** 选中节点的可用上下文变量（入参 + 循环变量 + 上游 results 产出 + formData），
 *  供属性面板变量选择器就近显示；依赖 store 真值，画布增删/改配置实时联动 */
const availableVars = computed(() =>
  collectAvailableVars(selectedNodeId.value, allNodes(), allEdges(), inputVars.value, formFieldGroups.value)
)

// ===== 设计期表单字段发现（formData 字段树，供变量选择器树形展开） =====
const formFieldGroups = ref<FormFieldGroupLike[]>([])

/** 拉取绑定表单字段结构；失败/无绑定静默回退（form 组退化为单条 formData 提示） */
async function loadFormFields() {
  if (!flowId) return
  try {
    const res = await logicFlowApi.formFields(flowId)
    formFieldGroups.value = Array.isArray(res.data) ? res.data : []
  } catch {
    formFieldGroups.value = []
  }
}

// ===== 面板折叠 =====
const paletteCollapsed = ref(false)
const panelCollapsed = ref(false)

// ===== 运行测试弹窗 =====
const runDialogVisible = ref(false)

onMounted(async () => {
  if (!flowId) {
    ElMessage.warning('缺少逻辑流 ID')
    return
  }
  loading.value = true
  try {
    const res = await logicFlowApi.get(flowId)
    const detail = res.data
    flowKey.value = detail.flowKey || ''
    flowName.value = detail.name || ''
    flowDescription.value = detail.description || ''
    flowStatus.value = detail.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    flowVersion.value = Number(detail.version) || 0

    if (detail.dsl) {
      try {
        const graph = parseDsl(detail.dsl)
        nodes.value = withNodeGuards(graph.nodes)
        edges.value = graph.edges
        inputVars.value = graph.inputVars || []
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : 'DSL 解析失败')
      }
    }
    savedDsl.value = detail.dsl || serializeDsl(allNodes(), allEdges(), inputVars.value)
    savedName.value = flowName.value
    // 设计期表单字段发现（不阻塞主流程渲染）
    loadFormFields()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
    // 初始视野：适配画布但限制最大缩放 100%，避免少节点时被放大导致节点显大
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 120)
  }
})

// ===== 节点增删 =====

/** 新增节点（统一入口）：START 全局唯一；BATCH 自动创建闭合循环连线。成功返回节点 */
function addNode(type: LogicNodeType, position: { x: number; y: number }): FlowNodeModel | null {
  if (type === 'START' && allNodes().some((n) => n.data.nodeType === 'START')) {
    ElMessage.warning('一个逻辑流只能有一个开始节点')
    return null
  }
  const node: FlowNodeModel = {
    id: createNodeId(type, allNodes().map((n) => n.id)),
    type: 'logic',
    position,
    // START 是流程锚点：禁删（Delete 键交互删除被 vue-flow 跳过，角标随 deletable 隐藏）
    deletable: type === 'START' ? false : undefined,
    data: {
      nodeType: type,
      name: defaultNodeName(type),
      config: defaultConfig(type),
      errorAction: type === 'HTTP' || type === 'BEAN' || type === 'SCRIPT' ? 'FAIL_FLOW' : undefined,
    },
  }
  addNodes([node])
  if (type === 'BATCH') {
    addEdges([createLoopEdge(node.id, node.id, LOOP_HANDLE_START, LOOP_HANDLE_END)])
  }
  selectedNodeId.value = node.id
  return node
}

/** 调色板点击：落在视口中心偏移处 */
function addNodeAtCenter(type: LogicNodeType) {
  const container = document.querySelector('.logic-flow-designer .canvas-container')
  const rect = container?.getBoundingClientRect()
  const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
  const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
  const position = screenToFlowCoordinate({ x: cx, y: cy })
  position.x += (Math.random() - 0.5) * 60 - 80
  position.y += (Math.random() - 0.5) * 60 - 20
  const node = addNode(type, position)
  if (node) trySnapNode(node)
}

/** 调色板拖放：落点即节点中心附近 */
function handleDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('logic-node-type')
  if (!raw) return
  const type = raw.toUpperCase() as LogicNodeType
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  position.x -= 80
  position.y -= 20
  const node = addNode(type, position)
  if (node) trySnapNode(node)
}

/** START 为流程锚点禁删：装载 DSL 后统一打标（角标隐藏 + Delete 键豁免 + removeNode 兑底） */
function withNodeGuards(list: FlowNodeModel[]): FlowNodeModel[] {
  for (const n of list) {
    if (n?.data?.nodeType === 'START') n.deletable = false
  }
  return list
}

function removeNode(id: string) {
  const target = allNodes().find((n) => n.id === id)
  if (target?.data.nodeType === 'START') {
    ElMessage.warning('开始节点是流程入口，不可删除')
    return
  }
  removeNodes([id])
  if (selectedNodeId.value === id) selectedNodeId.value = null
}

// ===== 连线：CONDITION 出边按 sourceHandle 写入 branch；循环连接点禁止手动连线 =====
function onConnect(connection: Connection) {
  const { source, target, sourceHandle, targetHandle } = connection
  if (!source || !target) return
  if (source === target) {
    ElMessage.warning('不能连接到自身')
    return
  }
  if (
    sourceHandle === LOOP_HANDLE_START ||
    sourceHandle === LOOP_HANDLE_END ||
    targetHandle === LOOP_HANDLE_START ||
    targetHandle === LOOP_HANDLE_END
  ) {
    ElMessage.warning('循环体请把动作节点拖到循环虚线上自动接入，不支持手动连线')
    return
  }
  const branch = sourceHandle === 'true' || sourceHandle === 'false' ? sourceHandle : undefined
  addEdges([
    {
      source,
      target,
      sourceHandle: sourceHandle ?? undefined,
      targetHandle: targetHandle ?? undefined,
      data: branch ? { branch } : undefined,
    },
  ])
}

function onNodeClick({ node }: NodeMouseEvent) {
  selectedNodeId.value = node.id
}

/** 双击链上节点 = 显式解绑：主流中段缝合直连；循环体节点移出循环（自愈缝合） */
function onNodeDoubleClick({ node }: NodeMouseEvent) {
  const n = allNodes().find((x) => x.id === node.id)
  if (n) detachWithMessage(n)
}

function onPaneClick() {
  selectedNodeId.value = null
}

/** 连线单击：仅选中（vue-flow 原生高亮），双击才删除——避免误删；循环连线不可删 */
function onEdgeDoubleClick({ edge }: EdgeMouseEvent) {
  if (isLoopEdge(edge as FlowEdge)) {
    ElMessage.warning('循环连线不可删除：删除循环体节点即可将其移出循环')
    return
  }
  removeEdges([edge])
  ElMessage.success('已删除连线（单击连线仅选中）')
}

// ===== 节点拖到连线自动吸附接入（普通连线 / 批处理循环虚线） =====

/** 吸附判定距离（画布坐标 px）：主流实线 */
const SNAP_THRESHOLD = 32

/** 循环虚线独立吸附阈值：与 U 形外凸宽度（offset 56）对齐，视觉上「碰到虚线即吸」更跟手 */
const LOOP_SNAP_THRESHOLD = 56

/** vue-flow 未回填 dimensions 时的节点近似尺寸兜底 */
const NODE_FALLBACK_SIZE = { w: 160, h: 54 }

function nodeSize(node: FlowNodeModel): { w: number; h: number } {
  const dims = (node as unknown as { dimensions?: { width?: number; height?: number } })
    ?.dimensions
  return {
    w: Number(dims?.width) || NODE_FALLBACK_SIZE.w,
    h: Number(dims?.height) || NODE_FALLBACK_SIZE.h,
  }
}

function nodeCenter(node: FlowNodeModel): { x: number; y: number } {
  const size = nodeSize(node)
  return { x: node.position.x + size.w / 2, y: node.position.y + size.h / 2 }
}

/** 两节点间正交折线近似（中位水平线），与 smoothstep 走向一致 */
function approxPointsBetween(
  source: FlowNodeModel,
  target: FlowNodeModel
): { x: number; y: number }[] {
  const sc = nodeCenter(source)
  const tc = nodeCenter(target)
  const midY = (sc.y + tc.y) / 2
  return [sc, { x: sc.x, y: midY }, { x: tc.x, y: midY }, tc]
}

/** 自环 U 形近似：节点右侧外凸（与 LoopEdge.vue 渲染 offset 56 同侧同距） */
function selfLoopApproxPoints(batch: FlowNodeModel): { x: number; y: number }[] {
  const size = nodeSize(batch)
  const x = batch.position.x + size.w
  const y1 = batch.position.y + size.h * 0.3
  const y2 = batch.position.y + size.h * 0.74
  const bulge = 56
  return [
    { x, y: y1 },
    { x: x + bulge, y: y1 },
    { x: x + bulge, y: y2 },
    { x, y: y2 },
  ]
}

/** 边路径近似：源/目标节点中心的正交折线（中位水平线），与 smoothstep 走向一致 */
function edgeApproxPoints(edge: FlowEdge): { x: number; y: number }[] | null {
  const source = allNodes().find((n) => n.id === edge.source)
  const target = allNodes().find((n) => n.id === edge.target)
  if (!source || !target) return null
  // 循环直连边（batch→batch 自环）：右侧 U 形近似（loop_start 30% → 外凸 → loop_end 74%）
  if (isLoopEdge(edge) && edge.source === edge.target) {
    return selfLoopApproxPoints(source)
  }
  return approxPointsBetween(source, target)
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distToPolyline(p: { x: number; y: number }, pts: { x: number; y: number }[]): number {
  let min = Infinity
  for (let i = 1; i < pts.length; i++) {
    min = Math.min(min, distToSegment(p, pts[i - 1], pts[i]))
  }
  return min
}

/** 节点是否已挂在某条循环体链上（循环体节点同时只能属于一条循环链）。
 * 按 nodeId 所在端分别判定：batch→链首 段的 sourceHandle 恰为 loop_start、
 * 链尾→batch 段的 targetHandle 恰为 loop_end（合法链段），故不能要求
 * 一条边两端同时为普通口 —— 旧写法会把单节点循环链的成员误判为未挂链，
 * 导致其拖出失效、且可被重复吸附（bug：循环拖出 E2E 暴露） */
function nodeOnLoopChain(nodeId: string): boolean {
  return allEdges().some(
    (e) =>
      isLoopEdge(e) &&
      ((e.source === nodeId && e.sourceHandle !== LOOP_HANDLE_START) ||
        (e.target === nodeId && e.targetHandle !== LOOP_HANDLE_END))
  )
}

interface SnapCandidate {
  edge: FlowEdge
  isLoop: boolean
  dist: number
}

/** 某条循环边所属的批处理（链源头）：链首段/尾段按 handle 直判，中段沿入链上溯 */
function loopChainOwner(edge: FlowEdge): string | null {
  const loopEdges = allEdges().filter(isLoopEdge)
  if (edge.sourceHandle === LOOP_HANDLE_START) return edge.source
  if (edge.targetHandle === LOOP_HANDLE_END) return edge.target
  let cur = edge.source
  for (let i = 0; i < 100; i++) {
    const up = loopEdges.find((e) => e.target === cur)
    if (!up) return null
    if (up.sourceHandle === LOOP_HANDLE_START) return up.source
    cur = up.source
  }
  return null
}

/** 批处理的循环体后代（含直接与嵌套子孙 batch）：沿 loop 链递归收集，防环用 */
function batchDescendants(batchId: string, visited = new Set<string>()): string[] {
  const out: string[] = []
  if (visited.has(batchId)) return out
  visited.add(batchId)
  const loopEdges = allEdges().filter(isLoopEdge)
  const start = loopEdges.find(
    (e) => e.source === batchId && e.sourceHandle === LOOP_HANDLE_START
  )
  if (!start) return out
  const seen = new Set<string>([batchId])
  let cur: string | undefined = start.target
  let guard = 0
  while (cur && !seen.has(cur) && guard++ < 100) {
    seen.add(cur)
    const node = allNodes().find((n) => n.id === cur)
    if (node?.data?.nodeType === 'BATCH') {
      out.push(cur)
      out.push(...batchDescendants(cur, visited))
    }
    const next = loopEdges.find((e) => e.source === cur)
    if (!next) break
    cur = next.target
  }
  return out
}

/** 嵌套/类型不可入提示节流（画布坐标拖动中每 4s 至多一次） */
let loopHintLastAt = 0
let loopHintText = ''

/** 找被拖节点附近的边（最近且距离达标）；不满足类型/归属约束的边跳过 */
function findSnapEdge(node: FlowNodeModel): SnapCandidate | null {
  const nodeType = node.data?.nodeType
  if (!nodeType || nodeType === 'START') return null
  const center = nodeCenter(node)
  let best: SnapCandidate | null = null
  let loopHintNearby = false
  loopHintText = ''
  for (const edge of allEdges()) {
    if (edge.source === node.id || edge.target === node.id) continue
    const isLoop = isLoopEdge(edge)
    if (isLoop) {
      // 循环体仅收业务执行六型（START/END/CONDITION 不可入；BATCH=嵌套，须防环）
      if (!(BATCH_BODY_TYPES as string[]).includes(nodeType)) {
        if (distToPolyline(center, edgeApproxPoints(edge) ?? []) <= LOOP_SNAP_THRESHOLD) {
          loopHintNearby = true
          loopHintText = '该节点不可加入循环体（仅 HTTP/Bean/脚本/数据更新/子流程/批处理）'
        }
        continue
      }
      if (nodeOnLoopChain(node.id)) continue
      // 嵌套批处理防环：BATCH 不能入自身/自身后代的循环体链（否则运行时无限递归）
      if (nodeType === 'BATCH') {
        const owner = loopChainOwner(edge)
        if (owner && (owner === node.id || batchDescendants(node.id).includes(owner))) {
          loopHintNearby = true
          loopHintText = owner === node.id ? '批处理不能嵌套自身' : '批处理不能嵌套形成循环引用'
          continue
        }
      }
    } else if (nodeOnLoopChain(node.id)) {
      // 已在循环链上的节点不可再接入主流（序列化时会被剔出顶层导致悬空边）
      continue
    }
    const pts = edgeApproxPoints(edge)
    if (!pts) continue
    const dist = distToPolyline(center, pts)
    const threshold = isLoop ? LOOP_SNAP_THRESHOLD : SNAP_THRESHOLD
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { edge, isLoop, dist }
    }
  }
  if (!best && loopHintNearby) {
    // 拖到虚线附近但不可入/成环：节流提示（无候选吸附时才弹，避免拖动中刷屏）
    const now = Date.now()
    if (now - loopHintLastAt > 4000) {
      loopHintLastAt = now
      ElMessage.warning(loopHintText)
    }
  }
  return best
}

/** 吸附接入：原边拆成两段穿过该节点（循环边拆出的两段仍是循环边）。
 * 顺序：先加新边再删旧边 —— vue-flow removeEdges 会跳过 deletable:false 的边，
 * 且删旧边触发的自愈（nextTick）必须在链完整后执行才能正确判 complete。
 * 已在链上的节点接入新线前先断开旧链（拖换位置/换链一步到位）。 */
function snapInsertNode(node: FlowNodeModel, candidate: SnapCandidate): void {
  detachNodeFromChains(node)
  const edge = candidate.edge
  const isLoop = candidate.isLoop
  const data = isLoop ? { loop: true } : edge.data ? { ...edge.data } : undefined
  const segBase = isLoop
    ? { type: 'smoothstep', markerEnd: 'arrowclosed', class: 'lf-edge-loop' }
    : { type: 'smoothstep', markerEnd: 'arrowclosed' }
  addEdges([
    {
      source: edge.source,
      target: node.id,
      sourceHandle: edge.sourceHandle,
      targetHandle: 'in',
      data,
      ...segBase,
    },
    {
      source: node.id,
      target: edge.target,
      sourceHandle: 'out',
      targetHandle: edge.targetHandle,
      data: isLoop ? { loop: true } : undefined,
      ...segBase,
    },
  ])
  removeEdges([edge])
  ElMessage.success(isLoop ? '已加入循环体（按链序逐项执行）' : '已自动接入连线')
}

/** 吸附统一入口：新节点落位 / 画布内拖动结束共用 */
function trySnapNode(node: FlowNodeModel) {
  const candidate = findSnapEdge(node)
  if (candidate) snapInsertNode(node, candidate)
}

// ===== 节点解绑：按住 Shift 拖动 / 双击链上节点 → 断开并缝合原链 =====

interface ChainEdges {
  ins: FlowEdge[]
  outs: FlowEdge[]
}

/** 节点的非循环连边 */
function mainEdgesOf(nodeId: string): ChainEdges {
  const ins: FlowEdge[] = []
  const outs: FlowEdge[] = []
  for (const e of allEdges()) {
    if (isLoopEdge(e)) continue
    if (e.target === nodeId) ins.push(e)
    if (e.source === nodeId) outs.push(e)
  }
  return { ins, outs }
}

/** 节点在循环链上的连边（排除 batch 自身的 loop_start/loop_end 自环端） */
function loopEdgesOf(nodeId: string): ChainEdges {
  const ins: FlowEdge[] = []
  const outs: FlowEdge[] = []
  for (const e of allEdges()) {
    if (!isLoopEdge(e)) continue
    if (e.target === nodeId && e.targetHandle !== LOOP_HANDLE_END) ins.push(e)
    if (e.source === nodeId && e.sourceHandle !== LOOP_HANDLE_START) outs.push(e)
  }
  return { ins, outs }
}

/** 主流链中段判定：恰一进一出（START 无入/END 无出/分支出边>1 天然排除） */
function isMainChainInternal(nodeId: string): boolean {
  const { ins, outs } = mainEdgesOf(nodeId)
  return ins.length === 1 && outs.length === 1
}

/** 主流缝合直连：删 N 的两断边并补 src→tgt（保留 CONDITION 分支 sourceHandle） */
function stitchMainChain(node: FlowNodeModel): void {
  const { ins, outs } = mainEdgesOf(node.id)
  const inE = ins[0]
  const outE = outs[0]
  const branch =
    inE.sourceHandle === 'true' || inE.sourceHandle === 'false' ? inE.sourceHandle : undefined
  addEdges([
    {
      source: inE.source,
      target: outE.target,
      sourceHandle: inE.sourceHandle ?? undefined,
      targetHandle: outE.targetHandle ?? undefined,
      data: branch ? { branch } : undefined,
    },
  ])
  removeEdges([inE, outE])
}

/**
 * 断开节点与既有链的连接（接入新线前置 / 双击移出共用）：
 * - 主流中段：缝合前后直连；
 * - 循环链：删全部循环连边，链自愈（nextTick healBatchLoops）缝合。
 * 返回是否发生了断开。
 */
function detachNodeFromChains(node: FlowNodeModel): boolean {
  if (isMainChainInternal(node.id)) {
    stitchMainChain(node)
    return true
  }
  if (nodeOnLoopChain(node.id)) {
    const { ins, outs } = loopEdgesOf(node.id)
    if (ins.length || outs.length) {
      removeEdges([...ins, ...outs])
      return true
    }
  }
  return false
}

/** 解绑统一入口（Shift 拖动 / 双击链上节点共用）：解绑成功则弹消息 */
function detachWithMessage(node: FlowNodeModel): void {
  // 先判链归属再断开（断开后边已删，isMainChainInternal 恒为 false）
  const wasMain = isMainChainInternal(node.id)
  if (detachNodeFromChains(node)) {
    ElMessage.success(wasMain ? '已从连线解绑，前后节点已重新连接' : '已移出循环体，循环链已重新缝合')
  }
}

function onNodeDragStop({ event, node }: { event: { shiftKey?: boolean }; node: FlowNodeModel }) {
  if (!node?.id) return
  // 需求②：按住 Shift 移动节点即解绑连线（不按 shift 时不再做距离自动断开，避免误触）
  if (event?.shiftKey) {
    detachWithMessage(node)
    return
  }
  const candidate = findSnapEdge(node)
  if (candidate) {
    snapInsertNode(node, candidate)
  }
}

// ===== 循环链自愈：删除循环体节点/循环边后自动缝合前后链段 =====

function onNodesChange(changes: NodeChange[]) {
  if (changes.some((c) => c.type === 'remove')) {
    nextTick(() => healBatchLoops())
  }
}

function onEdgesChange(changes: EdgeChange[]) {
  if (changes.some((c) => c.type === 'remove')) {
    nextTick(() => healBatchLoops())
  }
}

/** 对画布上每个 BATCH 检查循环链完整性并缝合断口（读 store 实时边集，非 v-model 滞后副本） */
function healBatchLoops() {
  for (const batch of storeNodes.value) {
    if (batch.data?.nodeType === 'BATCH') healOneBatch(batch.id)
  }
}

function healOneBatch(batchId: string) {
  // store 边为 vue-flow 内部 Edge 类型，按本设计器 FlowEdge 形状读取（字段子集兼容）
  const loopEdges = (storeEdges.value as unknown as FlowEdge[]).filter(isLoopEdge)
  const directExists = loopEdges.some(
    (e) =>
      e.source === batchId &&
      e.sourceHandle === LOOP_HANDLE_START &&
      e.target === batchId &&
      e.targetHandle === LOOP_HANDLE_END
  )

  // 正向：loop_start 出发沿链，until 回到 loop_end（完整）或无出边（断口在 tail 之后）。
  // 嵌套批处理：后续跳只走链段边（sourceHandle='out'），跳过链上子 BATCH
  // 自己的自环（sourceHandle=loop_start）——否则子自环被误当链路下一跳，
  // 走环保护 break 导致误判断链而重复补链（bug：嵌套 E2E 暴露）。
  let tail = batchId
  let forwardComplete = false
  {
    const visited = new Set([batchId])
    let cur = loopEdges.find((e) => e.source === batchId && e.sourceHandle === LOOP_HANDLE_START)
    let guard = 0
    while (cur && guard++ < 100) {
      if (cur.target === batchId && cur.targetHandle === LOOP_HANDLE_END) {
        forwardComplete = true
        break
      }
      if (visited.has(cur.target)) break
      visited.add(cur.target)
      tail = cur.target
      cur = loopEdges.find(
        (e) => e.source === cur!.target && e.sourceHandle !== LOOP_HANDLE_START
      )
    }
  }
  if (forwardComplete) return

  // 反向：loop_end 回溯链段头部（后续跳只走链段边 targetHandle='in'，同上跳过子 BATCH 自环）
  let head = batchId
  {
    const visited = new Set([batchId])
    let cur = loopEdges.find((e) => e.target === batchId && e.targetHandle === LOOP_HANDLE_END)
    let guard = 0
    while (cur && guard++ < 100) {
      if (visited.has(cur.source)) break
      visited.add(cur.source)
      head = cur.source
      cur = loopEdges.find(
        (e) =>
          e.target === cur!.source && e.source !== batchId && e.targetHandle !== LOOP_HANDLE_END
      )
    }
  }

  const patch: FlowEdge[] = []
  if (tail === batchId && head === batchId) {
    // 链完全为空：确保 loop_start→loop_end 直连存在
    if (!directExists) {
      patch.push(createLoopEdge(batchId, batchId, LOOP_HANDLE_START, LOOP_HANDLE_END))
    }
  } else if (tail !== batchId && head !== batchId) {
    if (tail === head) {
      // 仅剩单个中段节点：两端各接一条
      patch.push(createLoopEdge(batchId, tail, LOOP_HANDLE_START, 'in'))
      patch.push(createLoopEdge(tail, batchId, 'out', LOOP_HANDLE_END))
    } else {
      patch.push(createLoopEdge(tail, head, 'out', 'in'))
    }
  } else if (tail !== batchId) {
    // 正向链存在但 loop_end 断开
    patch.push(createLoopEdge(tail, batchId, 'out', LOOP_HANDLE_END))
  } else {
    // loop_start 无出链但 loop_end 有前驱段
    patch.push(createLoopEdge(batchId, head, LOOP_HANDLE_START, 'in'))
  }
  if (patch.length) addEdges(patch)
}

/** MiniMap 节点色：按类型映射（SVG fill 不支持 CSS 变量，用固定色值） */
const MINIMAP_COLORS: Record<string, string> = {
  HTTP: '#22c9d6',
  BEAN: '#3a9e5f',
  SCRIPT: '#e0821f',
  CONDITION: '#e6a23c',
  BATCH: '#a855f7',
  SUBFLOW: '#14b8a6',
  DATA_UPDATE: '#0e7490',
  START: '#8d96a3',
  END: '#8d96a3',
}

function miniMapNodeColor(node: { data?: { nodeType?: string } }): string {
  return MINIMAP_COLORS[node?.data?.nodeType ?? ''] ?? 'rgba(127, 142, 135, 0.5)'
}

// ===== 撤销 / 重做（快照 = 序列化 DSL，防抖聚合同批变更） =====
const historyStack = ref<string[]>([])
const historyIndex = ref(-1)
const applyingHistory = ref(false)
let historyTimer: ReturnType<typeof setTimeout> | null = null

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)

watch(
  () => serializeDsl(allNodes(), allEdges(), inputVars.value),
  (dsl) => {
    if (applyingHistory.value) return
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => pushHistory(dsl), 350)
  }
)

function pushHistory(dsl: string) {
  // 丢弃撤销后的前进分支，追加快照（上限 100 防内存膨胀）
  historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  historyStack.value.push(dsl)
  if (historyStack.value.length > 100) historyStack.value.shift()
  historyIndex.value = historyStack.value.length - 1
}

function applySnapshot(dsl: string) {
  applyingHistory.value = true
  try {
    const graph = parseDsl(dsl)
    nodes.value = withNodeGuards(graph.nodes)
    edges.value = graph.edges
    selectedNodeId.value = null
  } catch {
    // 快照损坏不应发生（均为本组件序列化产物），忽略
  } finally {
    setTimeout(() => {
      applyingHistory.value = false
    }, 0)
  }
}

function undo() {
  if (!canUndo.value) return
  historyIndex.value -= 1
  applySnapshot(historyStack.value[historyIndex.value])
}

function redo() {
  if (!canRedo.value) return
  historyIndex.value += 1
  applySnapshot(historyStack.value[historyIndex.value])
}

function onKeydown(event: KeyboardEvent) {
  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
  const isRedo =
    ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') ||
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y')
  if (isUndo) {
    event.preventDefault()
    undo()
  } else if (isRedo) {
    event.preventDefault()
    redo()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ===== 自动整理布局（v4）：主流边 Kahn 分层（自上而下、同层横向铺开，间距按节点
// 实际尺寸自适应），同层主流节点共享「层中线」垂直居中对齐。BATCH 循环体链不参与
// 主流分层：v4 按链序在宿主 BATCH 右侧纵向排列——循环链成员连线走底部 out → 顶部
// in 手柄，纵向排布时链边为竖直直线（v3 横向成行迫使链边走 S 形弯）；列首锚定
// loop_start 线（卡高 30%）下方，链走完自末节点回 loop_end（74% 线），闭环呈
// 「右出 → 纵向下行 → 右回」顺时针回路；列内节点共享「列中轴」水平居中对齐。
// 嵌套 BATCH 的循环列以宿主为锚继续右移下探，嵌套层次从外到内自左向右展开
// （子列左缘避开宿主卡、宿主列最宽成员与前序嵌套兄弟子树，纵向并行的列互不
// 重叠）；同层横向铺开时为 BATCH 的整棵循环子树让位，循环列不压右侧兄弟卡片。
// 修复：循环链边（loop_start→链→loop_end→BATCH）构成图环，旧版把环上节点全部堆到
// 兜底层导致「加入批处理节点后整理布局混乱」；层高按居中后的块底缘精确累计。 =====

/** loop_start 手柄纵锚（卡高比例，与 FlowNode.vue 右侧手柄 top:30% 对齐） */
const LOOP_START_ANCHOR = 0.3
/** 循环列与宿主 BATCH 右缘的间距（与自环 U 形外凸 offset 56 视觉对齐） */
const BODY_COL_GAP_X = 56
/** 循环列内相邻成员的纵向间距（竖直连线段呼吸感，与主流层距同量级） */
const BODY_COL_GAP_Y = 56
/** 列首成员顶缘位于 loop_start 线（卡高 30%）下方的落差：入边经 smoothstep 20px
 * 手柄偏移平滑落入顶部 in 口，避免与 loop_start 线等高产生回折 */
const BODY_COL_ANCHOR_DROP = 24
/** 嵌套子循环列左缘相对宿主列最宽成员右缘的让位余量（防纵向并行的列间重叠） */
const BODY_COL_NEST_MARGIN = 24

/** 收集某 BATCH 的循环体链（画布节点 id 序列，保序）：loop_start 出边沿链行走至
 * 回环 loop_end，visited 防环。嵌套 BATCH 是链中普通一员（照常收进、布局时递归
 * 展开其子列），链经其 'out' 口继续——旧版在嵌套 BATCH 处截断，会使其后的外层
 * 链成员（嵌套BATCH→尾节点→loop_end）失去归属、混入主流分层被甩到顶层 */
function collectBodyChain(batchId: string): string[] {
  const chain: string[] = []
  const loopEdges = allEdges().filter(isLoopEdge)
  const startEdge = loopEdges.find(
    (e) => e.source === batchId && e.sourceHandle === LOOP_HANDLE_START
  )
  if (!startEdge) return chain
  const nodesById = new Map(allNodes().map((n) => [n.id, n]))
  const seen = new Set<string>([batchId])
  let cur = startEdge.target
  let guard = 0
  while (cur && !seen.has(cur) && guard++ < 100) {
    seen.add(cur)
    const node = nodesById.get(cur)
    if (!node) break
    chain.push(cur)
    const next = loopEdges.find(
      (e) => e.source === cur && e.sourceHandle !== LOOP_HANDLE_START
    )
    if (!next) break
    cur = next.target
  }
  return chain
}

function handleAutoLayout() {
  if (!nodes.value.length) return
  const leftX = 80
  const colGapX = 56
  const topY = 60
  const layerGapY = 64

  const nodesById = new Map(allNodes().map((n) => [n.id, n]))

  // 1) 循环体归属：无条件收集每个 BATCH 的 body 链（嵌套 BATCH 亦然——若因遍历
  //    顺序被宿主链先行占名而跳过收集，placeChain 递归将找不到其链，其成员会滞留
  //    原位不参与布局）；成员从主流分层名单剔除（成员只有 loop 边，主流入度恒 0，
  //    混进分层会把它们误当第 0 层起点）
  const bodyOwner = new Map<string, string>()
  const bodyChains = new Map<string, string[]>()
  for (const n of allNodes()) {
    if (n.data.nodeType !== 'BATCH') continue
    const chain = collectBodyChain(n.id)
    if (!chain.length) continue
    bodyChains.set(n.id, chain)
    chain.forEach((id) => bodyOwner.set(id, n.id))
  }

  // 2) 主流边（排除循环链边）Kahn 分层：START（或入度 0 者）为第 0 层，拓扑序传播最长路径深度
  const mainIds = allNodes().filter((n) => !bodyOwner.has(n.id)).map((n) => n.id)
  const idSet = new Set(mainIds)
  const depth = new Map<string, number>()
  const indegree = new Map<string, number>()
  const out = new Map<string, string[]>()
  mainIds.forEach((id) => {
    indegree.set(id, 0)
    out.set(id, [])
  })
  allEdges().forEach((e) => {
    if (isLoopEdge(e)) return
    if (idSet.has(e.source) && idSet.has(e.target)) {
      out.get(e.source)!.push(e.target)
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
    }
  })
  const queue = mainIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const startId = allNodes().find((n) => n.data.nodeType === 'START')?.id
  if (startId && idSet.has(startId) && (indegree.get(startId) ?? 0) > 0) queue.unshift(startId)
  queue.forEach((id) => {
    if (!depth.has(id)) depth.set(id, 0)
  })
  let maxDepth = 0
  while (queue.length) {
    const id = queue.shift()!
    const current = depth.get(id) ?? 0
    maxDepth = Math.max(maxDepth, current)
    for (const next of out.get(id) ?? []) {
      if (current + 1 > (depth.get(next) ?? -1)) depth.set(next, current + 1)
      const remaining = (indegree.get(next) ?? 1) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  // 主流环上残余节点：接到最深层后面
  mainIds.forEach((id) => {
    if (!depth.has(id)) depth.set(id, ++maxDepth)
  })

  // 3) 子树纵向块高：普通节点=自身卡高；BATCH=卡片顶缘到 max(卡底, 循环列最深
  //    底缘)——列首锚 = 卡高 30% + 落差 24，成员自上而下逐个累计，嵌套 BATCH 成员
  //    的块底缘 = 其卡片顶纵距 + 子块块高。供层内块底缘与层高精确累计用
  const blockH = new Map<string, number>()
  function blockHeight(id: string, stack: Set<string> = new Set()): number {
    if (blockH.has(id)) return blockH.get(id)!
    const self = nodeSize(nodesById.get(id)!).h
    if (stack.has(id)) return self
    stack.add(id)
    let h = self
    const chain = bodyChains.get(id)
    if (chain?.length) {
      const colTop = self * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
      let offset = 0
      let deepest = 0
      for (const cid of chain) {
        const cn = nodesById.get(cid)
        const cardH = cn ? nodeSize(cn).h : 0
        deepest = Math.max(
          deepest,
          offset + (cn?.data.nodeType === 'BATCH' ? blockHeight(cid, stack) : cardH)
        )
        offset += cardH + BODY_COL_GAP_Y
      }
      h = Math.max(self, colTop + deepest)
    }
    stack.delete(id)
    blockH.set(id, h)
    return h
  }
  mainIds.forEach((id) => blockHeight(id))

  // 3b) 循环子树横向跨度（自列左缘 = 宿主卡右缘+56 起算）：自身列宽 与 各嵌套 BATCH
  //     子列（左缘含让位与兄弟列级联）及其子树跨度最右值取大。与 placeChain 的
  //     nestLeft 公式严格同构，供同层横向铺开时为循环子树让位，防止循环列压到
  //     同层右侧兄弟卡片
  const colW = new Map<string, number>()
  function colSubtreeW(id: string, stack: Set<string> = new Set()): number {
    if (colW.has(id)) return colW.get(id)!
    const chain = bodyChains.get(id)
    if (!chain?.length) return 0
    if (stack.has(id)) return 0
    stack.add(id)
    const colMaxW = Math.max(...chain.map((cid) => nodeSize(nodesById.get(cid)!).w))
    let extent = colMaxW
    let prevRight = -Infinity
    for (const cid of chain) {
      const cn = nodesById.get(cid)
      if (!cn || cn.data.nodeType !== 'BATCH') continue
      const nestLeftRel = Math.max(
        (colMaxW + nodeSize(cn).w) / 2 + BODY_COL_GAP_X,
        colMaxW + BODY_COL_NEST_MARGIN,
        prevRight + BODY_COL_GAP_X
      )
      prevRight = nestLeftRel + colSubtreeW(cid, stack)
      extent = Math.max(extent, prevRight)
    }
    stack.delete(id)
    colW.set(id, extent)
    return extent
  }
  mainIds.forEach((id) => colSubtreeW(id))

  // 4) 分层布局：层内主流节点卡片共享「层中线」垂直居中（中线 = 层顶 + 最高卡高/2，
  //    高低卡片对齐同一水平视线）；层高按「中线 - 卡高/2 + 块高」最大值累计
  //    （BATCH 的循环列块底缘计入，保证下层不被循环列侵入）；同层按累计宽度横向铺开
  const byLayer = new Map<number, FlowNodeModel[]>()
  mainIds.forEach((id) => {
    const layer = depth.get(id) ?? 0
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push(nodesById.get(id)!)
  })
  const layerCenter = new Map<number, number>()
  let cursorY = topY
  const layers = [...byLayer.entries()].sort(([a], [b]) => a - b)
  layers.forEach(([layer, list]) => {
    const maxCardH = Math.max(...list.map((n) => nodeSize(n).h))
    const center = cursorY + maxCardH / 2
    layerCenter.set(layer, center)
    let bandBottom = center + maxCardH / 2
    list.forEach((n) => {
      bandBottom = Math.max(bandBottom, center - nodeSize(n).h / 2 + blockHeight(n.id))
    })
    cursorY = bandBottom + layerGapY
  })
  layers.forEach(([layer, list]) => {
    const center = layerCenter.get(layer)!
    list.sort((a, b) => a.position.x - b.position.x)
    let cursorX = leftX
    list.forEach((n) => {
      const size = nodeSize(n)
      n.position = { x: Math.round(cursorX), y: Math.round(center - size.h / 2) }
      // 循环子树横向让位：BATCH 的循环列悬于卡右侧，同层后续节点须为其整棵
      // 循环子树（含嵌套列级联）让出横向空间，防止列卡重叠
      const subtreeW = colSubtreeW(n.id)
      cursorX += size.w + (subtreeW > 0 ? BODY_COL_GAP_X + subtreeW + colGapX : colGapX)
    })
  })

  // 5) 循环列落位：列悬于宿主 BATCH 右侧、按链序自上而下（连线自右侧 loop_start
  //    手柄出 → 列内竖直直线下行 → 末节点回 loop_end，顺时针闭环）；列内节点共享
  //    「列中轴」水平居中（x = 中轴 - 卡宽/2，in/out 手柄居中故链边为竖直直线），
  //    列首顶缘锚定 loop_start 线（卡高 30%）下方 BODY_COL_ANCHOR_DROP。嵌套 BATCH
  //    的循环列以宿主为锚继续右移下探：子列左缘 ≥ max(宿主卡右缘+56, 宿主列最宽
  //    成员右缘+24, 前序嵌套兄弟子树右缘+56)，嵌套层次从外到内自左向右展开且列间
  //    互不重叠；minLeftX 由宿主列逐层下传，placed 防交叉嵌套环。
  //    注：布局后坐标不再匹配 DSL 默认位公式，将按绝对坐标持久化（拖动位置同路径）
  const placed = new Set<string>()
  /** 落位某 BATCH 的循环列，返回整棵循环子树的最右缘（含嵌套列级联，供兄弟列让位） */
  function placeChain(batchId: string, minLeftX: number): number {
    if (placed.has(batchId)) return minLeftX
    placed.add(batchId)
    const chain = bodyChains.get(batchId)
    const batch = nodesById.get(batchId)
    if (!chain?.length || !batch) return minLeftX
    const bSize = nodeSize(batch)
    const colMaxW = Math.max(...chain.map((cid) => nodeSize(nodesById.get(cid)!).w))
    const axisX = minLeftX + colMaxW / 2
    let cursorY = batch.position.y + bSize.h * LOOP_START_ANCHOR + BODY_COL_ANCHOR_DROP
    let subtreeRight = axisX + colMaxW / 2
    let prevNestRight = -Infinity
    chain.forEach((cid) => {
      const cn = nodesById.get(cid)
      if (!cn) return
      const size = nodeSize(cn)
      cn.position = {
        x: Math.round(axisX - size.w / 2),
        y: Math.round(cursorY),
      }
      cursorY += size.h + BODY_COL_GAP_Y
      if (cn.data.nodeType === 'BATCH') {
        // 子列左缘 = max(子 BATCH 卡右缘+56, 宿主列最宽成员右缘+24, 前一嵌套
        // 兄弟子树右缘+56)：让出宿主卡与宿主列全部成员，且兄弟嵌套列纵向并行
        // 时依次向右级联，互不重叠
        const nestLeft = Math.max(
          cn.position.x + size.w + BODY_COL_GAP_X,
          axisX + colMaxW / 2 + BODY_COL_NEST_MARGIN,
          prevNestRight + BODY_COL_GAP_X
        )
        prevNestRight = placeChain(cid, nestLeft)
        subtreeRight = Math.max(subtreeRight, prevNestRight)
      }
    })
    return subtreeRight
  }
  for (const batchId of bodyChains.keys()) {
    if (bodyOwner.has(batchId)) continue
    const batch = nodesById.get(batchId)
    if (!batch) continue
    placeChain(batchId, batch.position.x + nodeSize(batch).w + BODY_COL_GAP_X)
  }

  setTimeout(() => fitView({ padding: 0.15, maxZoom: 1, duration: 300 }), 50)
}

// ===== 运行状态徽标：轨迹 nodeId → 状态（批处理内层 id 如 b#0 跳过） =====
const runStatusMap = ref<Record<string, string>>({})

function onRunTraces(traces: { nodeId: string; status: string }[] | undefined) {
  const map: Record<string, string> = {}
  for (const trace of traces ?? []) {
    if (trace.nodeId && !trace.nodeId.includes('#')) map[trace.nodeId] = trace.status
  }
  runStatusMap.value = map
}

// ===== 保存 / 发布 / 运行 =====

/** 静默保存标记：运行测试前的连带保存不重复弹 toast */
let savingQuiet = false

async function handleSave(): Promise<boolean> {
  // 防呆守卫：画布无「开始」节点视为异常状态（如 HMR 热替换/加载失败导致画布被清空），
  // 禁止保存以免把空画布写库覆盖已有流程内容（真实事故：2026-10-09 var_picker_test 节点被空存清空）
  if (!allNodes().some((n) => n.data.nodeType === 'START')) {
    ElMessage.warning('画布为空：缺少「开始」节点，已阻止保存（避免覆盖已有流程内容）。请刷新页面重新加载流程')
    return false
  }
  saving.value = true
  try {
    const dsl = serializeDsl(allNodes(), allEdges(), inputVars.value)
    await logicFlowApi.update(flowId, {
      name: flowName.value.trim() || defaultFlowName(),
      description: flowDescription.value,
      dsl,
    })
    savedDsl.value = dsl
    savedName.value = flowName.value.trim() || defaultFlowName()
    if (!savingQuiet) ElMessage.success('保存成功')
    return true
  } catch {
    return false
  } finally {
    saving.value = false
  }
}

function defaultFlowName(): string {
  return flowKey.value || '未命名逻辑流'
}

async function handlePublish() {
  try {
    await ElMessageBox.confirm(
      '发布前会先保存当前画布，并校验 DSL（可达性 / 条件分支 / 配置完整性）。确定发布吗？',
      '确认发布',
      { type: 'warning', confirmButtonText: '保存并发布', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    if (!(await handleSave())) return
    await logicFlowApi.publish(flowId)
    // 刷新状态与版本号
    const res = await logicFlowApi.get(flowId)
    flowStatus.value = res.data.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    flowVersion.value = Number(res.data.version) || flowVersion.value + 1
    ElMessage.success(`发布成功（v${flowVersion.value}）`)
  } catch {
    // 校验失败等错误由 http 拦截器弹出
  } finally {
    publishing.value = false
  }
}

async function handleRunTest() {
  // 契约：run 以「当前已存 DSL」执行 —— 脏画布先静默保存
  savingQuiet = dirty.value
  try {
    if (dirty.value) {
      const ok = await handleSave()
      if (!ok) return
    }
  } finally {
    savingQuiet = false
  }
  runDialogVisible.value = true
}

// ===== 离开守卫：未保存变更确认 =====
onBeforeRouteLeave(async (_to, _from) => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('当前有未保存的变更，离开将丢失。确定离开吗？', '未保存提示', {
      type: 'warning',
      confirmButtonText: '放弃变更并离开',
      cancelButtonText: '留在本页',
    })
    return true
  } catch {
    return false
  }
})

/** 返回守卫状态：确认框/导航进行中防重复触发（双击返回会连跳两个历史条目，落地页错乱） */
const leaving = ref(false)

function handleBack() {
  if (leaving.value) return
  leaving.value = true
  // 确定性回列表：不依赖 history 栈（直链进入/刷新后 back 会跳出应用或落在错误页）
  router
    .push('/logic-flow')
    .catch(() => {}) // 留在本页（未保存确认取消）时 push 被中止，吞掉导航失败
    .finally(() => {
      leaving.value = false
    })
}

// ===== HMR 守卫：本页持有整张画布的内存状态（nodes/edges/入参声明），流程数据仅在
// onMounted 拉取一次；开发期 vite HMR 重载本组件会重置 setup 状态但不会重跑 onMounted，
// 导致画布被清空、「开始」节点消失（真实事故：2026-10-09 画布被 HMR 清空，var_picker_test
// 节点被空存覆盖）。故在本模块被 HMR 替换时强制整页刷新：页面重载后画布从 API 完整重建，
// 开发期并发编辑不再产生「空画布」中间态（仅影响 dev，生产构建无 HMR）。
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.location.reload()
  })
}
</script>

<style scoped>
.logic-flow-designer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--el-bg-color-page, #f4f5f3);
}

/* ===== 工具条 ===== */
.designer-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  z-index: 30;
}

.toolbar-btn {
  flex-shrink: 0;
}

.flow-key {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-input {
  width: 240px;
}

.name-input :deep(.el-input__inner) {
  font-weight: 600;
}

.dirty-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-danger);
}

.toolbar-spacer {
  flex: 1;
}

/* ===== 主体 ===== */
.designer-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* ===== 空画布引导 ===== */
.canvas-empty-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 36px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--el-bg-color) 88%, transparent);
  border: 1px dashed var(--el-border-color);
  pointer-events: none;
  text-align: center;
}

.empty-icon {
  font-size: 30px;
  color: var(--el-color-primary);
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.empty-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ===== 入参声明弹窗 ===== */
.iv-badge {
  margin-left: 4px;
  vertical-align: middle;
}
.iv-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 10px 0;
  border: 1px dashed var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 8px;
}
.iv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
/* json 入参结构导入（图标按钮在行内删除之后） */
.iv-row-wrap {
  margin-bottom: 8px;
}
.iv-row-wrap .iv-row {
  margin-bottom: 0;
}
/* 删除按钮常驻可见（用户反馈：不要 hover 才显示） */
.iv-del-btn {
  opacity: 1;
}
/* 从触发点导入区块：与表单逻辑流绑定联动 */
.iv-import {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.iv-import-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.iv-import-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.iv-import-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.iv-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.iv-import-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
