<template>
  <div class="logic-flow-designer">
    <!-- ===== 顶部工具条 ===== -->
    <div class="designer-toolbar">
      <el-button class="toolbar-btn" :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />

      <span class="flow-key" :title="`标识：${flowKey}`">{{ flowKey }}</span>
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
          :snap-to-grid="true"
          :snap-grid="[10, 10]"
          :min-zoom="0.2"
          :max-zoom="2"
          fit-view-on-init
          @connect="onConnect"
          @node-click="onNodeClick"
          @pane-click="selectedNodeId = null"
          @edge-click="onEdgeClick"
          @edge-double-click="onEdgeClick"
          @dragover.prevent
          @drop="handleDrop"
        >
          <template #node-logic="nodeProps">
            <FlowNode
              :id="nodeProps.id"
              :data="nodeProps.data"
              :selected="nodeProps.selected"
              @delete="removeNode"
            />
          </template>

          <Background :gap="18" :size="1.6" />
          <MiniMap position="bottom-right" pannable zoomable :node-color="miniMapNodeColor" />
          <Controls position="bottom-left" />
        </VueFlow>

        <!-- 空画布引导 -->
        <div v-if="!loading && nodes.length === 0" class="canvas-empty-hint">
          <el-icon class="empty-icon"><MagicStick /></el-icon>
          <div class="empty-title">从左侧拖入「开始」节点开始编排</div>
          <div class="empty-desc">支持拖拽或点击添加 · 拖动节点下方连接点连线 · 选中后按 Delete 删除</div>
        </div>
      </div>

      <property-panel
        v-model:collapsed="panelCollapsed"
        :node="selectedNode"
        @remove="removeNode"
      />
    </div>

    <!-- 运行测试（与列表页共用） -->
    <RunTestDialog v-model="runDialogVisible" :flow-id="flowId" :flow-name="flowName" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Finished, MagicStick, Promotion, VideoPlay } from '@element-plus/icons-vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Connection, EdgeMouseEvent, NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import NodePalette from './components/NodePalette.vue'
import FlowNode from './components/FlowNode.vue'
import PropertyPanel from './components/PropertyPanel.vue'
import RunTestDialog from './components/RunTestDialog.vue'
import { logicFlowApi } from '@/api/logicFlow'
import {
  createNodeId,
  defaultConfig,
  defaultNodeName,
  isDslEqual,
  parseDsl,
  serializeDsl,
} from './utils/dsl'
import type { FlowEdge, FlowNode as FlowNodeModel, LogicNodeType } from './utils/dsl'
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
const { screenToFlowCoordinate, addNodes, addEdges, removeNodes, removeEdges } = useVueFlow()

// ===== 画布数据 =====
const nodes = ref<FlowNodeModel[]>([])
const edges = ref<FlowEdge[]>([])
const loading = ref(false)

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
  return !isDslEqual(serializeDsl(nodes.value, edges.value), savedDsl.value)
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
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : 'DSL 解析失败')
      }
    }
    savedDsl.value = detail.dsl || serializeDsl(nodes.value, edges.value)
    savedName.value = flowName.value
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
  }
})

// ===== 节点增删 =====

/** 新增节点（统一入口）：START 全局唯一 */
function addNode(type: LogicNodeType, position: { x: number; y: number }): boolean {
  if (type === 'START' && nodes.value.some((n) => n.data.nodeType === 'START')) {
    ElMessage.warning('一个逻辑流只能有一个开始节点')
    return false
  }
  const node: FlowNodeModel = {
    id: createNodeId(type, nodes.value.map((n) => n.id)),
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
  selectedNodeId.value = node.id
  return true
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
  addNode(type, position)
}

/** 调色板拖放：落点即节点中心附近 */
function handleDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('logic-node-type')
  if (!raw) return
  const type = raw.toUpperCase() as LogicNodeType
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  position.x -= 80
  position.y -= 20
  addNode(type, position)
}

function removeNode(id: string) {
  removeNodes([id])
  if (selectedNodeId.value === id) selectedNodeId.value = null
}

// ===== 连线：CONDITION 出边按 sourceHandle 写入 branch =====
function onConnect(connection: Connection) {
  const { source, target, sourceHandle, targetHandle } = connection
  if (!source || !target) return
  if (source === target) {
    ElMessage.warning('不能连接到自身')
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

function onEdgeClick({ edge }: EdgeMouseEvent) {
  removeEdges([edge])
  ElMessage.success('已删除连线')
}

/** MiniMap 节点色：按类型取中性半透明，明暗两态均可读 */
function miniMapNodeColor(): string {
  return 'rgba(127, 142, 135, 0.5)'
}

// ===== 保存 / 发布 / 运行 =====

/** 静默保存标记：运行测试前的连带保存不重复弹 toast */
let savingQuiet = false

async function handleSave(): Promise<boolean> {
  saving.value = true
  try {
    const dsl = serializeDsl(nodes.value, edges.value)
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
</style>
