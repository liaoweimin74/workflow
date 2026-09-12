<template>
  <div v-if="showOrb" class="ai-assistant-root">
    <!-- 悬浮球（点击开/关对话窗体） -->
    <button
      class="ai-orb"
      :class="{ 'ai-orb-active': windowOpen }"
      :title="windowOpen ? '收起 AI 助手' : '打开 AI 助手'"
      @click="toggleWindow"
    >
      <el-icon :size="22"><MagicStick /></el-icon>
    </button>

    <!-- 完全悬浮的对话窗体 -->
    <div v-if="windowOpen" class="ai-window">
      <div class="ai-window-header">
        <span class="ai-title">AI 助手</span>
        <div class="ai-window-actions">
          <el-button link size="small" :disabled="store.messages.length === 0" @click="handleClear">
            清空对话
          </el-button>
          <el-button link size="small" @click="windowOpen = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <div ref="messagesRef" class="ai-messages">
        <div v-if="store.messages.length === 0" class="ai-empty">
          你好，我可以帮你生成表单、指引功能入口等。试试说："帮我生成一个员工请假单表单"。
        </div>
        <div v-for="message in store.messages" :key="message.id" :class="['ai-msg', message.role]">
          <div class="ai-bubble">{{ message.content }}</div>
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
              @click="navigate(nav)"
            >
              🔗 {{ nav.label }}
            </el-tag>
          </div>
        </div>
        <div v-if="sending" class="ai-msg assistant"><div class="ai-bubble">正在处理…</div></div>
      </div>

      <div class="ai-input">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          resize="none"
          :disabled="sending"
          placeholder="输入你的需求，Enter 发送（Shift+Enter 换行）"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" :loading="sending" :disabled="!canSend" @click="send">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MagicStick, Close } from '@element-plus/icons-vue'
import { chat, type AiChatTurn } from '@/api/ai'
import { useAiAssistantStore } from '@/stores/aiAssistantStore'
import { useAuthStore } from '@/stores/auth'
import { aiActionBus } from '@/utils/aiActionBus'
import { flattenMenuPages } from '@/utils/menuIndex'

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

function toggleWindow() {
  windowOpen.value = !windowOpen.value
}

function handleClear() {
  store.clear()
  ElMessage.success('已清空对话')
}

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

  const menus = flattenMenuPages(authStore.menus)

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
        store.addMessage(
          'assistant',
          assistantText,
          formToolProduced ? { applied: formToolApplied } : undefined,
          navigations,
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
function navigate(nav: { label: string; path: string }) {
  if (route.path === nav.path) {
    ElMessage.info('已在该页面')
    return
  }
  router.push(nav.path)
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

/* 完全悬浮的对话窗体 */
.ai-window {
  position: fixed;
  right: 24px;
  bottom: 88px;
  width: 380px;
  height: min(560px, calc(100vh - 140px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e9edfa;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(31, 36, 55, 0.18);
  z-index: 2499;
  overflow: hidden;
}
.ai-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #e9edfa;
  background: linear-gradient(90deg, #eef0fc, #f8f9fe);
}
.ai-window-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ai-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
}
.ai-empty {
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}
.ai-msg {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}
.ai-msg.user {
  align-items: flex-end;
}
.ai-msg.assistant {
  align-items: flex-start;
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
  background: #f1f4fe;
  color: #303133;
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
}
.ai-input .el-textarea {
  flex: 1;
}
</style>
