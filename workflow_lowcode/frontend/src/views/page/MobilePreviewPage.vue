<script setup lang="ts">
/**
 * 移动预览 iframe 宿主（§5.2 裁定形态：iframe 手机框 + 与 H5 生产运行时同一 Vant 渲染器）。
 *
 * 只读实时预览：设计器端 postMessage 推 canvasSchema 帧 → 本宿主喂给 MobilePageRenderer 重渲；
 * 挂载即向父窗口回 ready 握手（通知设计器可推首帧）。带 pageKey（路由 props 从 query 注入）时
 * 自加载 DRAFT 兜首帧——postMessage 到达前手机框不空白；一旦收到设计器帧，自加载结果让位。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { pageApi } from '@/api/page'
import MobilePageRenderer from '@/render/mobile/MobilePageRenderer.vue'
import { makePreviewReady, parsePreviewMessage, type PreviewSchemaPayload } from '@/render/mobile/mobilePreviewBridge'

const props = defineProps<{ pageKey?: string }>()

const schema = ref<PreviewSchemaPayload | null>(null)
let gotDesignerFrame = false

function onMessage(event: MessageEvent) {
  // 同源校验：设计器与 iframe 同 SPA origin，异源 message（含 HMR）一律忽略
  if (event.origin !== window.location.origin) return
  const parsed = parsePreviewMessage(event.data)
  if (parsed?.kind !== 'schema') return
  gotDesignerFrame = true
  schema.value = parsed.payload
}

onMounted(async () => {
  window.addEventListener('message', onMessage)
  window.parent?.postMessage(makePreviewReady(), window.location.origin)
  if (props.pageKey && !gotDesignerFrame) {
    try {
      const def = (await pageApi.getPageByKey(props.pageKey, true)).data
      // 设计器帧可能在这条 await 期间先到：先到先得，自加载不覆盖
      if (!gotDesignerFrame && def?.schema) schema.value = JSON.parse(def.schema)
    } catch {
      // 自加载失败不阻断——设计器实时帧仍可用
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})
</script>

<template>
  <div class="mobile-preview">
    <MobilePageRenderer
      v-if="schema"
      :rule="schema.rule || []"
      :data-sources="(schema.dataSources as never) || []"
      :channel-profiles="schema.channelProfiles as never"
      :option="schema.option as never"
    />
    <div v-else class="mobile-preview__pending">预览加载中…</div>
  </div>
</template>

<style scoped>
.mobile-preview {
  min-height: 100%;
  background: #f7f8fa;
}
.mobile-preview__pending {
  padding: 40px 0;
  color: #909399;
  text-align: center;
  font-size: 13px;
}
</style>
