<script setup lang="ts">
/**
 * 设计器侧移动预览手机框（§5.2 裁定形态：iframe 手机框 + 同一 Vant 渲染器）。
 *
 * 只读实时预览：iframe 装载 /mobile/preview 路由（同源 SPA），本页推 canvasSchema 帧：
 *  - iframe 就绪（回 ready 握手）→ 推首帧；
 *  - 画布指纹（JSON.stringify(getSchema())）变化 → 300ms 去抖追帧；点亮页签强推一帧；
 *  - 「刷新」按钮手动重推。iframe 内部渲染的是生产同款 MobilePageRenderer，本组件不碰。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { makePreviewSchema, parsePreviewMessage } from '@/render/mobile/mobilePreviewBridge'
import type { PreviewSchemaPayload } from '@/render/mobile/mobilePreviewBridge'

const props = defineProps<{
  active: boolean
  pageKey: string
  /** 与「保存」同口径的画布序列化函数（含未保存改动） */
  getSchema: () => PreviewSchemaPayload
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const ready = ref(false)
const lastFrameJson = ref('')
let syncTimer: ReturnType<typeof setTimeout> | null = null

/** iframe src：pageKey 走 query 由路由 props 透传（自加载 DRAFT 兜首帧，实时帧随后覆盖） */
const src = computed(() => `/mobile/preview?pageKey=${encodeURIComponent(props.pageKey || '')}`)

function postFrame() {
  const payload = props.getSchema()
  const json = JSON.stringify(payload)
  if (json === lastFrameJson.value) return
  lastFrameJson.value = json
  frame.value?.contentWindow?.postMessage(makePreviewSchema(payload), window.location.origin)
}

function syncSoon() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    if (ready.value && props.active) postFrame()
  }, 300)
}

function onMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  // 只吃预览端的 ready 握手帧；其余（渲染器内部广播等）不归本组件管
  if (parsePreviewMessage(event.data)?.kind !== 'ready') return
  ready.value = true
  postFrame()
}

// 页签点亮（v-show 语义）且画布已变化时补推——切回页签即所见即所得
watch(
  () => props.active,
  (on) => {
    if (on && ready.value) postFrame()
  },
)
watch(() => JSON.stringify(props.getSchema()), syncSoon)

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  if (syncTimer) clearTimeout(syncTimer)
})

function refresh() {
  lastFrameJson.value = ''
  postFrame()
}
</script>

<template>
  <div class="m-preview" v-show="active">
    <div class="m-preview__toolbar">
      <span class="m-preview__hint">只读实时预览（未保存改动同步展示）</span>
      <el-button size="small" @click="refresh">刷新</el-button>
    </div>
    <div class="m-preview__phone">
      <iframe ref="frame" class="m-preview__frame" :src="src" title="移动预览" />
    </div>
  </div>
</template>

<style scoped>
.m-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
}
.m-preview__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.m-preview__hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
/* 手机框：iPhone 逻辑分辨率 375×667 圆角+暗色边框，iframe 与生产运行时同构 */
.m-preview__phone {
  flex: 1;
  min-height: 0;
  padding: 14px;
  border-radius: 36px;
  background: #1f2329;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.m-preview__frame {
  width: 375px;
  height: 100%;
  min-height: 560px;
  border: 0;
  border-radius: 24px;
  background: #fff;
}
</style>
