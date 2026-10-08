<template>
  <div v-if="showOrb" class="ai-assistant-root">
    <!-- 悬浮球（点击开/关对话窗体；可拖动换位，Task 80b） -->
    <button
      ref="orbEl"
      class="ai-orb"
      :class="{ 'ai-orb-active': windowOpen, 'ai-orb-dragging': orbDragging }"
      :style="orbStyle"
      :title="windowOpen ? '收起小智' : '打开小智（可拖动）'"
      @pointerdown="onOrbPointerDown"
      @pointermove="onOrbPointerMove"
      @pointerup="onOrbPointerUp"
      @pointercancel="onOrbPointerCancel"
      @click="onOrbClick"
    >
      <RobotIcon class="ai-orb-icon" />
    </button>

    <!-- 完全悬浮的对话窗体（header 可拖动移动位置，Task 80） -->
    <div v-if="windowOpen" ref="windowEl" class="ai-window" :style="winStyle">
      <div
        class="ai-window-header"
        title="拖动移动位置 · 双击复位"
        @pointerdown="onWindowDragStart"
        @pointermove="onWindowDragMove"
        @pointerup="onWindowDragEnd"
        @pointercancel="onWindowDragEnd"
        @dblclick="resetWindowPos"
      >
        <div class="ai-window-title">
          <span class="ai-header-avatar"><RobotIcon /></span>
          <span class="ai-title">小智·AI 助手</span>
        </div>
        <div class="ai-window-actions">
          <button class="ai-icon-btn" title="清除历史" :disabled="store.messages.length === 0" @click="handleClear">
            <el-icon :size="16"><Delete /></el-icon>
          </button>
          <button class="ai-icon-btn" title="收起" @click="windowOpen = false">
            <el-icon :size="16"><Close /></el-icon>
          </button>
        </div>
      </div>

      <div ref="messagesRef" class="ai-messages">
        <div v-if="store.messages.length === 0" class="ai-empty">
          你好，我是小智。可以帮你生成表单、指引功能入口等。试试说："帮我生成一个员工请假单表单"。
        </div>

        <div v-for="message in store.messages" :key="message.id" class="ai-msg" :class="message.role">
          <template v-if="message.role === 'assistant'">
            <span class="ai-msg-avatar"><RobotIcon /></span>
            <div class="ai-msg-body">
              <div class="ai-bubble ai-bubble-md">
                <MarkdownRenderer :text="message.content" :pages="menuPages" @navigate="navigate" />
              </div>
              <div v-if="message.formResult" class="ai-form-card">
                <span v-if="message.formResult.applied">✅ 已应用到当前表单</span>
                <span v-else>表单已生成。打开表单设计器后可应用。</span>
              </div>
              <div v-if="message.navigations && message.navigations.length" class="ai-nav-list">
                <el-tag
                  v-for="nav in message.navigations"
                  :key="nav.path"
                  class="ai-nav-tag"
                  type="primary"
                  effect="plain"
                  @click="navigate(nav.path)"
                >
                  → {{ nav.label }}
                </el-tag>
              </div>
            </div>
          </template>
          <div v-else class="ai-bubble">{{ message.content }}</div>
        </div>

        <div v-if="sending" class="ai-msg assistant">
          <span class="ai-msg-avatar"><RobotIcon /></span>
          <div class="ai-msg-body"><div class="ai-bubble">正在处理…</div></div>
        </div>
      </div>

      <div class="ai-input">
        <el-input
          v-model="input"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 5 }"
          resize="none"
          :disabled="sending"
          placeholder="输入问题，Enter 发送 / Shift+Enter 换行"
          @keydown.enter.exact.prevent="send"
        />
        <el-button class="ai-send-btn" type="primary" :loading="sending" :disabled="!canSend" @click="send">
          <el-icon v-if="!sending"><Position /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Delete, Close, Position } from '@element-plus/icons-vue'
import { chat, type AiChatTurn } from '@/api/ai'
import { useAiAssistantStore } from '@/stores/aiAssistantStore'
import { useAuthStore } from '@/stores/auth'
import { aiActionBus } from '@/utils/aiActionBus'
import { flattenMenuPages } from '@/utils/menuIndex'
import MarkdownRenderer from './MarkdownRenderer.vue'
import RobotIcon from './RobotIcon.vue'

const route = useRoute()
const router = useRouter()
const store = useAiAssistantStore()
const authStore = useAuthStore()

const windowOpen = ref(false)
const input = ref('')
const sending = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const windowEl = ref<HTMLElement | null>(null)
let controller: AbortController | null = null

/** 登录页不显示悬浮球 */
const showOrb = computed(() => store.visible && route.name !== 'Login')
const canSend = computed(() => input.value.trim().length > 0 && !sending.value)
/** 站内可跳转页面（菜单白名单） */
const menuPages = computed(() => flattenMenuPages(authStore.menus))

function toggleWindow() {
  windowOpen.value = !windowOpen.value
}

// ---------------------------------------------------------------- 悬浮球拖动（Task 80b）
const AI_ORB_POS_KEY = 'ai-assistant-orb-pos'
const ORB_SIZE = 52
const DRAG_THRESHOLD = 5
/** 球自定义位置；null = 默认右下（right:24 bottom:24） */
const orbEl = ref<HTMLElement | null>(null)
const orbPos = ref<{ x: number; y: number } | null>(null)
const orbDragging = ref(false)
let orbDrag: { startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null
/** 拖动结束后的那次 click 不再开关窗口 */
let suppressOrbClick = false

const orbStyle = computed(() =>
  orbPos.value
    ? { left: `${orbPos.value.x}px`, top: `${orbPos.value.y}px`, right: 'auto', bottom: 'auto' }
    : undefined,
)

function clampOrbPos(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - ORB_SIZE - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - ORB_SIZE - 8)),
  }
}

function onOrbPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  const el = orbEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const origin = orbPos.value ?? { x: rect.left, y: rect.top }
  orbDrag = { startX: e.clientX, startY: e.clientY, originX: origin.x, originY: origin.y, moved: false }
  // capture 后拖出球体/视口事件仍持续派发
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onOrbPointerMove(e: PointerEvent) {
  if (!orbDrag) return
  const dx = e.clientX - orbDrag.startX
  const dy = e.clientY - orbDrag.startY
  if (!orbDrag.moved) {
    // 位移超过阈值才进入拖动：小于阈值仍视为点击
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    orbDrag.moved = true
    orbDragging.value = true
  }
  orbPos.value = clampOrbPos(orbDrag.originX + dx, orbDrag.originY + dy)
}

function endOrbDrag(commit: boolean) {
  if (!orbDrag) return
  const moved = orbDrag.moved
  orbDrag = null
  orbDragging.value = false
  if (!moved) return
  suppressOrbClick = true
  if (commit && orbPos.value) {
    try {
      localStorage.setItem(AI_ORB_POS_KEY, JSON.stringify(orbPos.value))
    } catch {
      /* 存储不可用时位置仅本次会话有效 */
    }
  }
}

function onOrbPointerUp() {
  endOrbDrag(true)
}

function onOrbPointerCancel() {
  endOrbDrag(false)
}

function onOrbClick() {
  // 拖动结束产生的 click 不切换窗口
  if (suppressOrbClick) {
    suppressOrbClick = false
    return
  }
  toggleWindow()
}

// ---------------------------------------------------------------- 对话窗体拖动（Task 80）
const AI_WIN_POS_KEY = 'ai-assistant-window-pos'
/** 窗体自定义位置；null = 默认右下（right:24 bottom:88，不写内联 style） */
const winPos = ref<{ x: number; y: number } | null>(null)
let dragState: { startX: number; startY: number; originX: number; originY: number } | null = null

const winStyle = computed(() =>
  winPos.value
    ? { left: `${winPos.value.x}px`, top: `${winPos.value.y}px`, right: 'auto', bottom: 'auto' }
    : undefined,
)

/** 拖动越界钳制：窗体任何部分都留在视口内 */
function clampWindowPos(x: number, y: number): { x: number; y: number } {
  const w = windowEl.value?.offsetWidth ?? 340
  const h = windowEl.value?.offsetHeight ?? 480
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)),
  }
}

function onWindowDragStart(e: PointerEvent) {
  if (e.button !== 0) return
  // 右上角图标按钮（清除/收起）不触发拖动
  if ((e.target as HTMLElement).closest('.ai-icon-btn')) return
  const el = windowEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const origin = winPos.value ?? { x: rect.left, y: rect.top }
  dragState = { startX: e.clientX, startY: e.clientY, originX: origin.x, originY: origin.y }
  // capture 后 move/up 持续派发到 header，拖出窗体/视口也不中断
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  el.classList.add('ai-window-dragging')
}

function onWindowDragMove(e: PointerEvent) {
  if (!dragState) return
  winPos.value = clampWindowPos(
    dragState.originX + (e.clientX - dragState.startX),
    dragState.originY + (e.clientY - dragState.startY),
  )
}

function onWindowDragEnd() {
  if (!dragState) return
  dragState = null
  windowEl.value?.classList.remove('ai-window-dragging')
  try {
    if (winPos.value) localStorage.setItem(AI_WIN_POS_KEY, JSON.stringify(winPos.value))
  } catch {
    /* 隐私模式等存储不可用时静默忽略（本次会话内拖动仍然有效） */
  }
}

/** 双击 header 复位到默认右下位置 */
function resetWindowPos() {
  winPos.value = null
  try {
    localStorage.removeItem(AI_WIN_POS_KEY)
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  try {
    const orbRaw = localStorage.getItem(AI_ORB_POS_KEY)
    if (orbRaw) {
      const saved = JSON.parse(orbRaw) as { x: number; y: number }
      if (typeof saved?.x === 'number' && typeof saved?.y === 'number') {
        orbPos.value = clampOrbPos(saved.x, saved.y)
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(AI_WIN_POS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { x: number; y: number }
      if (typeof saved?.x === 'number' && typeof saved?.y === 'number') winPos.value = saved
    }
  } catch {
    /* ignore */
  }
})

// 打开窗体时钳制一次：视口比上次保存位置时小（如窗口缩小）不会越界
watch(windowOpen, async (open) => {
  if (!open || !winPos.value) return
  await nextTick()
  winPos.value = clampWindowPos(winPos.value.x, winPos.value.y)
})

function handleClear() {
  controller?.abort()
  controller = null
  sending.value = false
  store.clear()
  ElMessage.success('已清空对话')
}
onUnmounted(() => {
  controller?.abort()
  controller = null
})

/** 新消息滚动到底部 */
watch(
  () => store.messages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  },
)

function send() {
  const text = input.value.trim()
  if (!text || sending.value) return

  // 历史 = 本轮之前的所有消息
  const history: AiChatTurn[] = store.messages.map((m) => ({ role: m.role, content: m.content }))
  store.addMessage('user', text)
  input.value = ''
  sending.value = true

  let formToolProduced = false
  let formToolApplied = false

  const menus = menuPages.value

  controller = chat(
    { message: text, history, context: { ...(store.context ?? {}), menus } },
    {
      onToolResult: (name, result) => {
        if (name === 'generate_form_schema') {
          formToolProduced = true
          formToolApplied = tryApplyForm(result)
        }
      },
      onMessage: (assistantText, navigations) => {
        // 正文已内联链接的页面，不再在底部重复出现
        const extra = (navigations ?? []).filter((nav) => !assistantText.includes(`(${nav.path})`))
        store.addMessage(
          'assistant',
          assistantText,
          formToolProduced ? { applied: formToolApplied } : undefined,
          extra.length ? extra : undefined,
        )
      },
      onError: (error) => {
        sending.value = false
        controller = null
        store.addMessage('assistant', `⚠️ ${error?.msg || '对话失败，请重试'}`)
      },
      onDone: () => {
        sending.value = false
        controller = null
      },
    },
  )
}

/** 页面入口跳转 */
function navigate(path: string) {
  if (!path) return
  if (route.path === path) {
    ElMessage.info('已在该页面')
    return
  }
  router.push(path)
}

/** 上下文绑定：当前在表单设计器时，生成的表单自动回填画布 */
function tryApplyForm(result: unknown): boolean {
  const ctx = store.context as { route?: string } | null
  if (!ctx || ctx.route !== 'form-designer') return false
  const schema = (result as { schema?: unknown })?.schema
  if (typeof schema !== 'string') return false

  let rule: unknown[] = []
  try {
    const parsed = JSON.parse(schema)
    rule = Array.isArray(parsed) ? parsed : parsed?.rule ?? []
  } catch {
    rule = []
  }
  if (!Array.isArray(rule) || rule.length === 0) return false

  aiActionBus.emit('applyFormSchema', rule)
  return true
}
</script>

<style scoped>
.ai-orb {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--el-color-primary), var(--brand-bright, #46c9d6));
  box-shadow: 0 6px 16px color-mix(in srgb, var(--el-color-primary) 35%, transparent);
  z-index: 2500;
  transition: transform 0.15s ease;
  touch-action: none;
  user-select: none;
}
/* 拖动中：抓取光标 + 放大 + 取消过渡（跟手） */
.ai-orb-dragging {
  cursor: grabbing;
  transform: scale(1.1);
  transition: none;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--el-color-primary) 45%, transparent);
}
.ai-orb:hover {
  transform: scale(1.06);
}
.ai-orb-active {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 22%, transparent), 0 6px 16px color-mix(in srgb, var(--el-color-primary) 35%, transparent);
}
.ai-orb-icon {
  width: 26px;
  height: 26px;
}

/* 完全悬浮的对话窗体 */
.ai-window {
  position: fixed;
  right: 24px;
  bottom: 88px;
  width: 340px;
  height: min(480px, calc(100vh - 140px));
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  z-index: 2499;
  overflow: hidden;
}

/* 深色标题栏，突出存在感（四态恒深色系：主色拼黑，白字始终可读）；同时是拖拽把手（Task 80） */
.ai-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--el-color-primary) 62%, #101010), color-mix(in srgb, var(--el-color-primary) 26%, #0a0a0a));
  color: #fff;
  cursor: move;
  user-select: none;
  touch-action: none;
}

/* 拖动中反馈：阴影加深 + 轻微放大，与静止状态区分 */
.ai-window-dragging {
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.38);
  transition: none;
}
.ai-window-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-header-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.ai-header-avatar :deep(svg) {
  width: 18px;
  height: 18px;
}
.ai-title {
  font-weight: 600;
  font-size: 15px;
  color: #fff;
}
.ai-window-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ai-icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e5e7eb;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

/* 把手上的图标按钮保持 pointer 光标，不随 header 变 move */
.ai-window-header .ai-icon-btn {
  cursor: pointer;
}
.ai-icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.ai-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--el-bg-color-page);
}
.ai-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.ai-msg {
  display: flex;
  margin-bottom: 12px;
}
.ai-msg.user {
  justify-content: flex-end;
}
.ai-msg.assistant {
  align-items: flex-start;
  gap: 8px;
}
.ai-msg-avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-industrial-50);
  color: var(--ds-industrial-500);
}
.ai-msg-avatar :deep(svg) {
  width: 17px;
  height: 17px;
}
.ai-msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: calc(100% - 34px);
}
.ai-bubble {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-msg.user .ai-bubble {
  background: var(--brand);
  color: #fff;
}
.ai-msg.assistant .ai-bubble {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}
.ai-bubble-md {
  width: 100%;
  max-width: 100%;
  white-space: normal;
}
.ai-form-card {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--brand-bright, #46c9d6) 13%, transparent);
  color: var(--el-color-primary);
  font-size: 12px;
}
.ai-nav-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ai-nav-tag {
  margin-top: 6px;
  cursor: pointer;
}
.ai-input {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color-overlay);
}
.ai-input .el-textarea {
  flex: 1;
}
.ai-send-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
}
</style>
