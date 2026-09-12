<template>
  <div v-if="showOrb" class="ai-assistant-root">
    <!-- 悬浮球（点击开/关对话窗体） -->
    <button
      class="ai-orb"
      :class="{ 'ai-orb-active': windowOpen }"
      :title="windowOpen ? '收起小智' : '打开小智'"
      @click="toggleWindow"
    >
      <RobotIcon class="ai-orb-icon" />
    </button>

    <!-- 完全悬浮的对话窗体 -->
    <div v-if="windowOpen" class="ai-window">
      <div class="ai-window-header">
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
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
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
let controller: AbortController | null = null

/** 登录页不显示悬浮球 */
const showOrb = computed(() => store.visible && route.name !== 'Login')
const canSend = computed(() => input.value.trim().length > 0 && !sending.value)
/** 站内可跳转页面（菜单白名单） */
const menuPages = computed(() => flattenMenuPages(authStore.menus))

function toggleWindow() {
  windowOpen.value = !windowOpen.value
}

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
  background: linear-gradient(135deg, #5755ee, #46c9d6);
  box-shadow: 0 6px 16px rgba(87, 85, 238, 0.35);
  z-index: 2500;
  transition: transform 0.15s ease;
}
.ai-orb:hover {
  transform: scale(1.06);
}
.ai-orb-active {
  box-shadow: 0 0 0 3px rgba(87, 85, 238, 0.2), 0 6px 16px rgba(87, 85, 238, 0.35);
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
  width: 400px;
  height: min(600px, calc(100vh - 140px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #d6d6fd;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(42, 41, 112, 0.24);
  z-index: 2499;
  overflow: hidden;
}

/* 深色标题栏，突出存在感 */
.ai-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(120deg, #4342b5, #2a2970);
  color: #fff;
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
  background: #fafbff;
}
.ai-empty {
  color: #909399;
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
  background: #e9eaff;
  color: #5755ee;
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
  background: #5755ee;
  color: #fff;
}
.ai-msg.assistant .ai-bubble {
  background: #fff;
  border: 1px solid #e9edfa;
  color: #303133;
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
  background: #ecfbfd;
  color: #1f8592;
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
  border-top: 1px solid #e9edfa;
  background: #fff;
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
