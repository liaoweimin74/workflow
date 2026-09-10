<template>
  <div ref="containerRef" class="bpmn-viewer">
    <!-- 无图形信息（缺 BPMNDI）空态：老版本流程定义可能未携带 DI，避免白屏困惑 -->
    <div v-if="emptyState" class="bpmn-viewer__empty">
      <el-icon :size="36" class="empty-icon"><PictureRounded /></el-icon>
      <p class="empty-title">该流程定义未包含图形信息</p>
      <p class="empty-desc">流程逻辑可正常流转，但无法渲染流程图（重新发布新版后可显示）</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { PictureRounded } from '@element-plus/icons-vue'
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

/** XML 缺少 BPMNDI 图形信息时置 true，展示空态而非空白画布 */
const emptyState = ref(false)

async function renderDiagram() {
  if (!viewer || !props.xml) return
  try {
    const result = (await viewer.importXML(props.xml)) as { warnings?: unknown[] } | undefined
    const warnings = result?.warnings ?? []
    const noDiagram = warnings.some((w) =>
      String((w as Error)?.message ?? w).toLowerCase().includes('no diagram'),
    )
    emptyState.value = noDiagram
    const canvas = viewer.get('canvas') as { zoom: (type: string, auto?: boolean) => void; addMarker: (id: string, cls: string) => void }
    canvas.zoom('fit-viewport', true)
    applyHighlights()
    emit('ready')
  } catch (err) {
    emptyState.value = true
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
  position: relative;
}

/* 无图形信息空态：居中提示，覆盖在空白画布之上 */
.bpmn-viewer__empty {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--el-fill-color-lighter, #fafafa);
  border-radius: 4px;
}

.bpmn-viewer__empty .empty-icon {
  color: var(--el-text-color-placeholder, #a8abb2);
}

.bpmn-viewer__empty .empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular, #606266);
}

.bpmn-viewer__empty .empty-desc {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.bpmn-viewer :deep(.highlight-current) {
  fill: #409eff !important;
  stroke: #409eff !important;
}
</style>
