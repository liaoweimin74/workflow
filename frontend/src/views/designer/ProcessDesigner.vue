<template>
  <div class="process-designer">
    <!-- 顶部工具栏 -->
    <designer-toolbar
      :read-only="isReadOnly"
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
      <!-- 左侧节点面板（只读模式隐藏，悬浮卡片） -->
      <node-palette v-if="!isReadOnly" v-model:collapsed="paletteCollapsed" />

      <!-- 中间画布（全幅铺底，左右面板悬浮其上；panel-right-open 时小地图左移避让属性面板） -->
      <div
        class="canvas-container"
        :class="{ 'panel-right-open': !propertyCollapsed }"
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

      <!-- 右侧属性面板（悬浮卡片） -->
      <property-panel v-model:collapsed="propertyCollapsed" :read-only="isReadOnly" />
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import DesignerToolbar from './components/toolbar/DesignerToolbar.vue'
import NodePalette from './components/NodePalette.vue'
import PropertyPanel from './properties/PropertyPanel.vue'
import { useDesignerStore } from '@/stores/designerStore'
import { initModeler, destroyModeler, getModeler } from './utils/bpmnModeler'
import { importXml, exportXml, exportSvg } from './utils/xmlParser'
import { validateProcessXml } from './utils/bpmnValidation'
import { findStartEventInScope, resolveDropParent } from './utils/subflowNavigation'
import { processDesignApi, deployedProcessApi } from '@/api/processDefinition'
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
const paletteCollapsed = ref(true) // 节点面板默认折叠（展开态仍可拖拽节点，折叠态保留图标拖拽条）
const propertyCollapsed = ref(false)

/** 只读模式：通过 /designer?procDefId=xxx&readonly=1 进入，查看历史版本 */
const isReadOnly = computed(() => route.query.readonly === '1')

onMounted(async () => {
  loading.value = true
  try {
    // 初始化 modeler（只读模式禁用编辑）
    await nextTick()
    if (canvasWrapperRef.value) {
      initModeler({ container: canvasWrapperRef.value }, isReadOnly.value)
    }

    if (isReadOnly.value) {
      await loadReadOnlyVersion()
      return
    }

    const draftId = route.query.id as string
    if (!draftId) {
      ElMessage.warning('缺少流程定义 ID')
      return
    }

    // 加载设计器数据
    const res = await processDesignApi.loadEditor(draftId)
    const editorData = res.data

    designerStore.setDraft(editorData.id, editorData.name, editorData.key)
    designerStore.setBpmnXml(editorData.bpmnXml)
    designerStore.setNodeConfigs(editorData.nodeConfigs || {})
    designerStore.setDraftBasicInfo({
      categoryId: editorData.categoryId || null,
      description: editorData.description || '',
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

/** 只读模式：加载历史版本的编辑器数据（该版本 XML + 配置快照） */
async function loadReadOnlyVersion() {
  const procDefId = route.query.procDefId as string
  if (!procDefId) {
    ElMessage.warning('缺少流程版本 ID')
    return
  }
  const res = await deployedProcessApi.getVersionEditor(procDefId)
  const editorData = res.data
  designerStore.setDraft('', editorData.name || '', editorData.key || '')
  designerStore.setBpmnXml(editorData.bpmnXml)
  designerStore.setNodeConfigs(editorData.nodeConfigs || {})
  designerStore.setDraftBasicInfo({ categoryId: null, description: '' })
  designerStore.markClean()

  const modeler = getModeler()
  await importXml(modeler, editorData.bpmnXml)

  const minimap: any = (modeler as any).get('minimap')
  if (minimap) {
    minimap.open()
  }
  // 只读模式：仅注册选择监听（展示节点配置），不注册编辑/删除监听
  setupEventListeners(true)
}

onBeforeUnmount(() => {
  destroyModeler()
  designerStore.clearConfigs()
})

function setupEventListeners(readOnly = false) {
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
      // userTask 的 wf:nodeRole（initiator/approver/handler）入 store，供属性面板按类别分发
      const bo = element.businessObject
      const nodeRole = bo && bo.get ? (bo.get('wf:nodeRole') as string | undefined) || null : null
      designerStore.selectNode(element.id, nodeType, nodeRole)
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

  if (readOnly) {
    return
  }

  eventBus.on('commandStack.changed', () => {
    designerStore.setBpmnXml('') // mark dirty
  })

  // 删除级联：bpmn-js 删除子流程时内部元素同批进入 deleted 列表，统一清理 config
  eventBus.on('elements.deleted', (event: any) => {
    const deleted: any[] = event.elements || []
    deleted.forEach((el: any) => { if (el.id) designerStore.deleteNodeConfig(el.id) })
  })

  // 双击子流程 → 与原生斜向下箭头（.bjs-drilldown 按钮）行为一致：
  // 进入内建的子流程设计界面（切换至子流程 plane，圆角面包屑可返回）。
  // 子流程无独立 plane（无内部元素）时退回原地折叠/展开。
  eventBus.on('element.dblclick', (event: any) => {
    const el = event.element
    const bo = el && el.businessObject
    if (!bo || !bo.$instanceOf || !bo.$instanceOf('bpmn:SubProcess')) return
    const planeRoot = canvas.findRoot(el.id + '_plane')
    if (planeRoot && planeRoot !== canvas.getRootElement()) {
      canvas.setRootElement(planeRoot)
    } else {
      const modeling = (getModeler() as any).get('modeling')
      modeling.toggleCollapse(el)
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
      key: designerStore.draftKey || '',
      categoryId: designerStore.draftCategoryId,
      description: designerStore.draftDescription,
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
    // 先导出并校验：错误直接拦截，警告合并进确认文案
    const modeler = getModeler()
    const xml = await exportXml(modeler)

    // 阻断性错误直接拦截（不再请求后端）；仅非阻断警告允许用户确认后继续
    const { error, warnings } = validateProcessXml(xml, designerStore.nodeConfigs)
    if (error) {
      ElMessage.error({
        message: `无法部署：${error}`,
        duration: 8000,
        showClose: true,
        dangerouslyUseHTMLString: false
      })
      return
    }
    if (warnings.length) {
      const confirmed = await ElMessageBox.confirm(
        `${warnings.join('\n')}\n\n是否仍要继续部署？`,
        '部署警告',
        { type: 'warning', confirmButtonText: '继续部署', cancelButtonText: '取消' }
      ).then(() => true).catch(() => false)
      if (!confirmed) return
    } else {
      await ElMessageBox.confirm('确定要部署此流程吗？部署后将创建新的流程定义版本。', '确认部署', {
        type: 'warning'
      })
    }

    await processDesignApi.saveDesign(designerStore.draftId, {
      name: designerStore.draftName || '',
      key: designerStore.draftKey || '',
      categoryId: designerStore.draftCategoryId,
      description: designerStore.draftDescription,
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
  if (isReadOnly.value) {
    router.push('/process/definition')
    return
  }
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

  // 计算放置坐标（画布坐标）
  const rect = canvasWrapperRef.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  // 转换为画布坐标
  const viewbox = canvas.viewbox()
  const canvasX = x / viewbox.scale + viewbox.x
  const canvasY = y / viewbox.scale + viewbox.y

  // 父容器：按落点命中「展开态子流程」（保持 bpmn-js 内建界面语义），
  // 未命中任何展开子流程则取当前 plane 根元素（主流程 plane→主流程；子流程 plane→子流程）
  const rootElement = resolveDropParent({ x: canvasX, y: canvasY }, elementRegistry, canvas.getRootElement())

  // 校验：当前容器作用域内只能有一个开始事件（子流程可有自己的开始事件）
  if (nodeType === 'bpmn:StartEvent') {
    const existing = findStartEventInScope(rootElement, elementRegistry)
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

  // 创建元素 shape
  const shape = elementFactory.createShape({ type: nodeType })

  // 直接以父容器创建并放置元素（父容器已在开始事件校验前解析）
  modeling.createShape(shape, { x: canvasX, y: canvasY }, rootElement)

  // 发起节点：设置 assignee 和 wf:nodeRole
  if (nodeRole === 'initiator') {
    modeling.updateProperties(shape, {
      'flowable:assignee': '${initiator}',
      'wf:nodeRole': 'initiator'
    })
  } else if (nodeRole === 'approver' || nodeRole === 'handler') {
    // 审批节点/办理节点：写入 wf:nodeRole 区分类别
    modeling.updateProperties(shape, {
      'wf:nodeRole': nodeRole
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
  background: var(--el-bg-color-page, #f1f4fe);
}

.designer-body {
  position: relative; /* 左右悬浮面板的定位锚点 */
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: transparent; /* 渐变由 designer-theme.css 的 .djs-container 提供 */
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
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
