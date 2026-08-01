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
    />

    <div class="designer-body">
      <!-- 左侧节点面板 -->
      <node-palette />

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
      <property-panel />
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
import './styles/designer-theme.css'

const route = useRoute()
const router = useRouter()
const designerStore = useDesignerStore()

const canvasWrapperRef = ref<HTMLElement>()
const loading = ref(false)
const importDialogVisible = ref(false)
const importXmlContent = ref('')

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

    designerStore.setDraft(editorData.id, editorData.name)
    designerStore.setBpmnXml(editorData.bpmnXml)
    designerStore.setNodeConfigs(editorData.nodeConfigs || {})
    designerStore.markClean()

    // 导入 BPMN XML
    const modeler = getModeler()
    await importXml(modeler, editorData.bpmnXml)

    // 监听选择事件
    setupEventListeners()
  } catch (err: any) {
    ElMessage.error('加载流程定义失败: ' + (err?.message || err))
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

  eventBus.on('selection.changed', (event: any) => {
    const newSelection = event.newSelection
    if (newSelection && newSelection.length > 0) {
      const element = newSelection[0]
      const type = element.type || 'unknown'
      const parts = type.split(':')
      const nodeType = parts.length > 1 ? parts[1] : type
      designerStore.selectNode(element.id, nodeType)
    } else {
      designerStore.selectNode(null, null)
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

async function handleSave() {
  if (!designerStore.draftId) return

  try {
    const modeler = getModeler()
    const xml = await exportXml(modeler)
    designerStore.setBpmnXml(xml)

    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: '',
      categoryId: null,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })
    designerStore.markClean()
    ElMessage.success('保存成功')
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err?.message || err))
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
    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: '',
      categoryId: null,
      bpmnXml: xml,
      nodeConfigs: designerStore.nodeConfigs
    })

    // 部署
    await processDesignApi.deploy(designerStore.draftId)
    designerStore.markClean()
    ElMessage.success('部署成功')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('部署失败: ' + (err?.message || err))
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

function handleBack() {
  if (designerStore.isDirty) {
    ElMessageBox.confirm('有未保存的更改，确定要离开吗？', '提示', {
      type: 'warning'
    }).then(() => {
      router.back()
    }).catch(() => {})
  } else {
    router.back()
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

  const modeler = getModeler()
  const canvas = (modeler as any).get('canvas')
  const elementFactory = (modeler as any).get('elementFactory')
  const create = (modeler as any).get('create')
  const mouseEvent = (modeler as any).get('mouse')

  // 计算放置坐标
  const rect = canvasWrapperRef.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // 转换为画布坐标
  const viewbox = canvas.viewbox()
  const canvasX = x / viewbox.scale + viewbox.x
  const canvasY = y / viewbox.scale + viewbox.y

  // 创建元素
  const shape = elementFactory.createShape({ type: nodeType })

  // 使用 create.start 启动创建
  create.start(mouseEvent.createMouseEvent({
    x: canvasX,
    y: canvasY,
    clientX: event.clientX,
    clientY: event.clientY
  }), shape)
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
