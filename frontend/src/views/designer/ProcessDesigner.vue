<template>
  <div class="process-designer">
    <!-- 顶部工具栏 -->
    <designer-toolbar
      @save="handleSave"
      @deploy="handleDeploy"
      @export-xml="handleExportXml"
      @export-svg="handleExportSvg"
      @import-xml="handleImportXml"
      @undo="handleUndo"
      @redo="handleRedo"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @zoom-reset="handleZoomReset"
      @back="handleBack"
      @toggle-minimap="handleToggleMinimap"
    />

    <div class="designer-body">
      <!-- 左侧节点面板 -->
      <node-palette v-model:collapsed="paletteCollapsed" />

      <!-- 中间画布 -->
      <div
        class="canvas-container"
        ref="canvasContainerRef"
        @drop="handleDrop"
        @dragover.prevent="handleDragOver"
      >
        <div class="canvas-wrapper" ref="canvasWrapperRef"></div>
        <div class="canvas-loading" v-if="loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>加载中...</span>
        </div>
      </div>

      <!-- 右侧属性面板 -->
      <property-panel v-model:collapsed="propertyCollapsed" />
    </div>

    <!-- 导入 XML 对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入 BPMN XML" width="60%">
      <el-input
        v-model="importXmlContent"
        type="textarea"
        :rows="15"
        placeholder="粘贴 BPMN XML 内容..."
      />
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import DesignerToolbar from './components/toolbar/DesignerToolbar.vue'
import NodePalette from './components/NodePalette.vue'
import PropertyPanel from './properties/PropertyPanel.vue'
import { useDesignerStore } from '@/stores/designerStore'
import { initModeler, destroyModeler, getModeler } from './utils/bpmnModeler'
import { importXml, exportXml, exportSvg } from './utils/xmlParser'
import { processDesignApi } from '@/api/processDefinition'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-codes.css'  // context-pad / palette 图标
import 'diagram-js-minimap/assets/diagram-js-minimap.css'    // 鸟瞰图样式
import './styles/designer-theme.css'

const route = useRoute()
const router = useRouter()
const designerStore = useDesignerStore()

const canvasWrapperRef = ref<HTMLElement>()
const loading = ref(false)
const importDialogVisible = ref(false)
const importXmlContent = ref('')
const paletteCollapsed = ref(false)
const propertyCollapsed = ref(false)

onMounted(async () => {
  const draftId = route.query.id as string
  if (!draftId) {
    ElMessage.warning('缺少流程定义 ID')
    return
  }

  loading.value = true
  try {
    // 初始化 modeler
    await nextTick()
    if (canvasWrapperRef.value) {
      initModeler({ container: canvasWrapperRef.value })
    }

    // 加载设计器数据
    const res = await processDesignApi.loadEditor(draftId)
    const editorData = res.data

    designerStore.setDraft(editorData.id, editorData.name, editorData.key)
    designerStore.setBpmnXml(editorData.bpmnXml)
    designerStore.setNodeConfigs(editorData.nodeConfigs || {})
    designerStore.setDraftBasicInfo({
      categoryId: editorData.categoryId || null,
      description: '',
    })
    designerStore.setSavedSnapshot(editorData.bpmnXml, editorData.nodeConfigs || {})
    designerStore.markClean()

    // 导入 BPMN XML
    const modeler = getModeler()
    await importXml(modeler, editorData.bpmnXml)

    // 默认打开鸟瞰图
    const minimap: any = (modeler as any).get('minimap')
    if (minimap) {
      minimap.open()
    }

    // 监听选择事件
    setupEventListeners()
  } catch {
    // http 拦截器已弹出后端返回的具体错误消息
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  destroyModeler()
  designerStore.clearConfigs()
})

function setupEventListeners() {
  const modeler = getModeler()
  const eventBus = (modeler as any).get('eventBus')
  const canvas = (modeler as any).get('canvas')

  eventBus.on('selection.changed', (event: any) => {
    const newSelection = event.newSelection
    if (newSelection && newSelection.length > 0) {
      const element = newSelection[0]
      const type = element.type || 'unknown'
      const parts = type.split(':')
      const nodeType = parts.length > 1 ? parts[1] : type
      designerStore.selectNode(element.id, nodeType)
    } else {
      // 点击画布空白：显示流程属性
      designerStore.selectNode(null, 'Process')
    }
  })

  // 点击画布背景（根元素）时显示流程属性
  eventBus.on('element.click', (event: any) => {
    if (event.element && event.element === canvas.getRootElement()) {
      designerStore.selectNode(null, 'Process')
    }
  })

  eventBus.on('commandStack.changed', () => {
    designerStore.setBpmnXml('') // mark dirty
  })

  eventBus.on('shape.remove', (event: any) => {
    const element = event.element
    if (element && element.id) {
      designerStore.deleteNodeConfig(element.id)
    }
  })
}

/**
 * 校验导出的 BPMN XML 是否符合部署要求。
 * 返回错误消息，无错误返回 null。
 */
function validateBpmnXml(xml: string): string | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return 'BPMN XML 解析失败，请检查流程定义。'
  }

  const startEvents = doc.querySelectorAll('bpmn\\:startEvent, startEvent')
  const endEvents = doc.querySelectorAll('bpmn\\:endEvent, endEvent')
  const userTasks = doc.querySelectorAll('bpmn\\:userTask, userTask')

  // 1. 必须有开始事件
  if (startEvents.length === 0) {
    return '流程缺少开始事件，请添加一个开始事件。'
  }
  // 2. 开始事件只能有一个
  if (startEvents.length > 1) {
    return `流程存在 ${startEvents.length} 个开始事件，只允许一个。`
  }
  // 3. 必须有结束事件
  if (endEvents.length === 0) {
    return '流程缺少结束事件，请添加至少一个结束事件。'
  }

  // 4. 开始事件必须有出口连线
  const startEvent = startEvents[0]
  const startId = startEvent.getAttribute('id')
  const hasOutgoingFromStart = doc.querySelector(
    `bpmn\\:sequenceFlow[sourceRef="${startId}"], sequenceFlow[sourceRef="${startId}"]`
  )
  if (!hasOutgoingFromStart) {
    return '开始事件没有出口连线，请连接到下一个节点。'
  }

  // 5. 每个结束事件必须有入口连线
  for (let i = 0; i < endEvents.length; i++) {
    const endId = endEvents[i].getAttribute('id')
    const hasIncomingToEnd = doc.querySelector(
      `bpmn\\:sequenceFlow[targetRef="${endId}"], sequenceFlow[targetRef="${endId}"]`
    )
    if (!hasIncomingToEnd) {
      return `结束事件「${endEvents[i].getAttribute('name') || endId}」没有入口连线，请连接上游节点。`
    }
  }

  // 6. UserTask 必须配置审批人
  for (let i = 0; i < userTasks.length; i++) {
    const taskId = userTasks[i].getAttribute('id')
    const taskName = userTasks[i].getAttribute('name') || taskId
    if (taskId) {
      const configStr = designerStore.nodeConfigs[taskId]
      if (configStr) {
        try {
          const config = JSON.parse(configStr)
          const approval = config.approval
          if (!approval || !approval.type) {
            return `用户任务「${taskName}」未配置审批人，请设置审批类型。`
          }
          if (approval.type === 'user' && (!approval.userIds || approval.userIds.length === 0)) {
            return `用户任务「${taskName}」的审批类型为「指定用户」但未选择审批用户。`
          }
          if (approval.type === 'expression' && !approval.expression) {
            return `用户任务「${taskName}」的审批类型为「流程表达式」但未设置表达式。`
          }
        } catch {
          return `用户任务「${taskName}」的节点配置解析失败。`
        }
      } else {
        return `用户任务「${taskName}」未配置审批人，请设置审批类型。`
      }
    }
  }

  return null
}

async function handleSave() {
  if (!designerStore.draftId) return

  try {
    const modeler = getModeler()
    const xml = await exportXml(modeler)

    designerStore.setBpmnXml(xml)

    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: designerStore.draftCategoryId,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
    designerStore.setSavedSnapshot(xml, designerStore.nodeConfigs)
    designerStore.markClean()
    ElMessage.success('保存成功')
  } catch {
    // http 拦截器已弹出后端返回的具体错误消息
  }
}

async function handleDeploy() {
  if (!designerStore.draftId) return

  try {
    await ElMessageBox.confirm('确定要部署此流程吗？部署后将创建新的流程定义版本。', '确认部署', {
      type: 'warning'
    })

    // 先保存
    const modeler = getModeler()
    const xml = await exportXml(modeler)

    const error = validateBpmnXml(xml)
    if (error) {
      ElMessage.error(error)
      return
    }

    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: designerStore.draftCategoryId,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })

    // 部署
    await processDesignApi.deploy(designerStore.draftId)
    designerStore.setSavedSnapshot(xml, designerStore.nodeConfigs)
    designerStore.markClean()
    ElMessage.success('部署成功')
  } catch (err) {
    // ElMessageBox 取消时 reject 'cancel'，静默；其他错误由 http 拦截器弹消息
    if (err !== 'cancel') {
      // noop
    }
  }
}

async function handleExportXml() {
  try {
    const modeler = getModeler()
    const xml = await exportXml(modeler)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${designerStore.draftName || 'process'}.bpmn20.xml`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    ElMessage.error('导出失败: ' + (err?.message || err))
  }
}

async function handleExportSvg() {
  try {
    const modeler = getModeler()
    const svg = await exportSvg(modeler)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${designerStore.draftName || 'process'}.svg`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    ElMessage.error('导出失败: ' + (err?.message || err))
  }
}

function handleImportXml() {
  importXmlContent.value = ''
  importDialogVisible.value = true
}

async function confirmImport() {
  if (!importXmlContent.value.trim()) {
    ElMessage.warning('请输入 BPMN XML 内容')
    return
  }

  try {
    const modeler = getModeler()
    await importXml(modeler, importXmlContent.value)
    designerStore.setBpmnXml(importXmlContent.value)
    importDialogVisible.value = false
    ElMessage.success('导入成功')
  } catch (err: any) {
    ElMessage.error('导入失败: ' + (err?.message || err))
  }
}

function handleUndo() {
  const modeler = getModeler()
  const commandStack = (modeler as any).get('commandStack')
  commandStack.undo()
}

function handleRedo() {
  const modeler = getModeler()
  const commandStack = (modeler as any).get('commandStack')
  commandStack.redo()
}

function handleZoomIn() {
  const modeler = getModeler()
  const zoom = (modeler as any).get('zoomScroll')
  zoom.stepZoom(1)
}

function handleZoomOut() {
  const modeler = getModeler()
  const zoom = (modeler as any).get('zoomScroll')
  zoom.stepZoom(-1)
}

function handleZoomReset() {
  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  canvas.zoom('fit-viewport', 'auto')
}

function handleToggleMinimap(visible: boolean) {
  const modeler = getModeler()
  const minimap: any = (modeler as any).get('minimap')
  if (!minimap) return
  if (visible) {
    minimap.open()
  } else {
    minimap.close()
  }
}

function handleBack() {
  if (designerStore.isDirty) {
    ElMessageBox.confirm('有未保存的更改，确定要离开吗？', '提示', {
      type: 'warning'
    }).then(() => {
      router.push('/process/definition')
    }).catch(() => {})
  } else {
    router.push('/process/definition')
  }
}

function handleDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  const nodeType = event.dataTransfer?.getData('node-type')
  if (!nodeType) return

  const nodeRole = event.dataTransfer?.getData('node-role')

  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const elementFactory = (modeler as any).get('elementFactory')
  const modeling = (modeler as any).get('modeling')
  const elementRegistry = (modeler as any).get('elementRegistry')

  // 校验：无触发开始事件全局只能有一个
  if (nodeType === 'bpmn:StartEvent') {
    const existing = elementRegistry.find((el: any) => el.type === 'bpmn:StartEvent')
    if (existing) {
      ElMessage.warning('一个流程只能有一个开始事件')
      return
    }
  }

  // 校验：发起节点全局只能有一个
  if (nodeRole === 'initiator') {
    const existingInitiator = elementRegistry.find((el: any) => {
      const bo = el.businessObject
      if (!bo || !bo.$instanceOf || !bo.$instanceOf('bpmn:UserTask')) return false
      return bo.get && bo.get('wf:nodeRole') === 'initiator'
    })
    if (existingInitiator) {
      ElMessage.warning('一个流程只能有一个发起节点')
      return
    }
  }

  // 计算放置坐标
  const rect = canvasWrapperRef.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // 转换为画布坐标
  const viewbox = canvas.viewbox()
  const canvasX = x / viewbox.scale + viewbox.x
  const canvasY = y / viewbox.scale + viewbox.y

  // 创建元素 shape
  const shape = elementFactory.createShape({ type: nodeType })

  // 找到根元素（Process）作为父容器
  const rootElement = elementRegistry.find((el: any) => el.type === 'bpmn:Process') || canvas.getRootElement()

  // 直接在指定坐标创建并放置元素
  modeling.createShape(shape, { x: canvasX, y: canvasY }, rootElement)

  // 发起节点：设置 assignee 和 wf:nodeRole
  if (nodeRole === 'initiator') {
    modeling.updateProperties(shape, {
      'flowable:assignee': '${initiator}',
      'wf:nodeRole': 'initiator'
    })
  }
}
</script>

<style scoped>
.process-designer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #f5f7fa;
}

.designer-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #fff;
}

.canvas-wrapper {
  width: 100%;
  height: 100%;
}

.canvas-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 14px;
}
</style>
