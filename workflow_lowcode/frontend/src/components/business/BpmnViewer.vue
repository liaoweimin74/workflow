<template>
  <div ref="containerRef" class="bpmn-viewer" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer'
import type ViewerType from 'bpmn-js/lib/NavigatedViewer'
import { normalizeBpmnXmlForRender } from '@/views/designer/utils/xmlParser'
import { customRendererModule } from '@/views/designer/utils/customRenderer'

// bpmn-js 基础样式 + bpmn 字体（overlay 类别图标用）+ 画布通用主题（与设计器同源，四态明暗自适应）
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import '@/views/designer/styles/bpmn-canvas-theme.css'

const props = defineProps<{
  /** BPMN XML 字符串 */
  xml: string
  /** 需高亮的节点 ID 列表（已完成 + 当前节点） */
  highlights?: string[]
}>()

const emit = defineEmits<{
  (e: 'ready'): void
  (e: 'error', err: Error): void
}>()

const containerRef = ref<HTMLElement>()
let viewer: ViewerType | null = null

async function renderDiagram() {
  if (!viewer || !props.xml) return
  try {
    await viewer.importXML(normalizeBpmnXmlForRender(props.xml))
    const canvas = viewer.get('canvas') as { zoom: (type: string, auto?: boolean) => void; addMarker: (id: string, cls: string) => void }
    canvas.zoom('fit-viewport', true)
    applyHighlights()
    emit('ready')
  } catch (err) {
    emit('error', err instanceof Error ? err : new Error(String(err)))
  }
}

function applyHighlights() {
  if (!viewer || !props.highlights?.length) return
  const canvas = viewer.get('canvas') as { addMarker: (id: string, cls: string) => void }
  for (const id of props.highlights) {
    canvas.addMarker(id, 'highlight-current')
  }
}

watch(() => props.xml, () => renderDiagram())
watch(() => props.highlights, () => applyHighlights(), { deep: true })

onMounted(async () => {
  if (containerRef.value) {
    // 注册 customRendererModule：给节点打类别 marker（approver-task 等）
    // 并叠加类别底色/图标 —— 与设计器视觉一致，且 bpmn-canvas-theme.css
    // 的类别色/overlay 规则才能命中
    viewer = new BpmnViewer({ container: containerRef.value, additionalModules: [customRendererModule] })
    await renderDiagram()
  }
})

onBeforeUnmount(() => {
  viewer?.destroy()
  viewer = null
})
</script>

<style scoped>
.bpmn-viewer {
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.bpmn-viewer :deep(.highlight-current) {
  fill: #409eff !important;
  stroke: #409eff !important;
}
</style>
