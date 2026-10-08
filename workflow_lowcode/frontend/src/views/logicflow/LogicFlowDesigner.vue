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
      <el-tooltip content="自动整理布局（自上而下分层排布）" placement="bottom">
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
            <FlowNode
              :id="nodeProps.id"
              :data="nodeProps.data"
              :selected="nodeProps.selected"
              :status="runStatusMap[nodeProps.id] ?? ''"
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
          tip="声明本流需要调用方传入的参数（保存在 DSL 中，仅作契约展示，引擎不强制校验）。也可不声明，运行测试时会自动扫描画布引用的变量给出建议"
        />
      </template>
      <div v-if="!inputVars.length" class="iv-empty">未声明入参</div>
      <div v-for="(v, i) in inputVars" :key="i" class="iv-row">
        <el-input v-model="v.name" placeholder="变量名" style="width: 160px" />
        <el-select v-model="v.type" style="width: 110px">
          <el-option label="string" value="string" />
          <el-option label="number" value="number" />
          <el-option label="boolean" value="boolean" />
          <el-option label="json" value="json" />
        </el-select>
        <el-switch v-model="v.required" active-text="必填" style="flex-shrink: 0" />
        <el-input v-model="v.desc" placeholder="说明（可选）" style="flex: 1" />
        <el-button size="small" text type="danger" @click="inputVars.splice(i, 1)">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
      <el-button size="small" text type="primary" @click="addInputVar">添加入参</el-button>
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
import { logicFlowApi } from '@/api/logicFlow'
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
import { collectAvailableVars } from './utils/flowVars'
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

/** 选中节点的可用上下文变量（入参 + 循环变量 + 上游 resultVar + formData），
 *  供属性面板变量选择器就近显示；依赖 store 真值，画布增删/改配置实时联动 */
const availableVars = computed(() =>
  collectAvailableVars(selectedNodeId.value, allNodes(), allEdges(), inputVars.value)
)

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
        nodes.value = graph.nodes
        edges.value = graph.edges
        inputVars.value = graph.inputVars || []
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : 'DSL 解析失败')
      }
    }
    savedDsl.value = detail.dsl || serializeDsl(allNodes(), allEdges(), inputVars.value)
    savedName.value = flowName.value
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

function removeNode(id: string) {
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
    nodes.value = graph.nodes
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

// ===== 自动整理布局：从 START 做 Kahn 分层（环上节点兜底），层级自上而下、同层横向铺开 =====
function handleAutoLayout() {
  if (!nodes.value.length) return
  const leftX = 80
  const colGapX = 230
  const topY = 60
  const layerGapY = 160

  const idSet = new Set(nodes.value.map((n) => n.id))
  const depth = new Map<string, number>()
  const indegree = new Map<string, number>()
  const out = new Map<string, string[]>()
  nodes.value.forEach((n) => {
    indegree.set(n.id, 0)
    out.set(n.id, [])
  })
  allEdges().forEach((e) => {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      out.get(e.source)!.push(e.target)
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
    }
  })

  // START（或入度 0 者）为第 0 层；拓扑序传播最长路径深度
  const queue = nodes.value
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
  const startId = nodes.value.find((n) => n.data.nodeType === 'START')?.id
  if (startId && (indegree.get(startId) ?? 0) > 0) queue.unshift(startId)
  queue.forEach((id) => {
    if (!depth.has(id)) depth.set(id, 0)
  })
  let maxDepth = 0
  while (queue.length) {
    const id = queue.shift()!
    const current = depth.get(id) ?? 0
    maxDepth = Math.max(maxDepth, current)
    for (const next of out.get(id) ?? []) {
      const candidate = current + 1
      if (candidate > (depth.get(next) ?? -1)) depth.set(next, candidate)
      const remaining = (indegree.get(next) ?? 1) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  // 环上残余节点：接到最深层后面
  nodes.value.forEach((n) => {
    if (!depth.has(n.id)) depth.set(n.id, ++maxDepth)
  })

  // 分层内按原 x 排序减少跳动；同层横向铺开，层级沿 Y 轴自上而下
  const byLayer = new Map<number, FlowNodeModel[]>()
  nodes.value.forEach((n) => {
    const layer = depth.get(n.id) ?? 0
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push(n)
  })
  ;[...byLayer.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([layer, list]) => {
      list.sort((a, b) => a.position.x - b.position.x)
      list.forEach((n, index) => {
        n.position = { x: leftX + index * colGapX, y: topY + layer * layerGapY }
      })
    })
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

function handleBack() {
  router.back()
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
</style>
