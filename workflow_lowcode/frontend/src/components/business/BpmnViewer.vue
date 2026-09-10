<template>
  <div ref="containerRef" class="bpmn-viewer" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import BpmnViewer from 'bpmn-js/lib/NavigatedViewer'
import type ViewerType from 'bpmn-js/lib/NavigatedViewer'

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
    await viewer.importXML(props.xml)
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
    viewer = new BpmnViewer({ container: containerRef.value })
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
