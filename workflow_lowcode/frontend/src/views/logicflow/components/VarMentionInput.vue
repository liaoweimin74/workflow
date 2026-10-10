<template>
  <div class="var-mention">
    <el-input
      ref="inputRef"
      :model-value="modelValue"
      :type="type"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :autosize="type === 'textarea' ? { minRows: rows ?? 3, maxRows: 12 } : false"
      @update:model-value="onInput"
      @keydown="onKeydown"
      @keyup="refreshTrigger"
      @click="refreshTrigger"
      @blur="closeSoon"
    >
      <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    </el-input>

    <!-- # 触发的变量选择浮层（filter 文本实时筛选，↑↓ 导航 / Enter 选中 / Esc 关闭） -->
    <div v-if="open" class="vm-popover">
      <div class="vm-head">
        <span>插入变量</span>
        <span class="vm-hint">{{ insertHint }}</span>
      </div>
      <div class="vm-list">
        <div
          v-for="(v, i) in filtered"
          :key="v"
          class="vm-item"
          :class="{ 'is-active': i === active }"
          @mousedown.prevent
          @click="pick(v)"
          @mousemove="active = i"
        >
          <span class="vm-name">{{ v }}</span>
          <span class="vm-token">{{ tokenPreview(v) }}</span>
        </div>
        <div v-if="!filtered.length" class="vm-empty">
          {{ variables.length ? '无匹配变量' : '画布暂无可用变量（入参/结果变量/item 变量）' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

/**
 * 带 # 变量呼出的表达式/脚本输入框：
 * - 输入 # （可继续键入筛选词）弹出变量选择列表（入参声明 + resultVar + item/index）；
 * - ↑↓ 选择、Enter 选中、Esc 关闭、点击直接选中；
 * - insertStyle='placeholder' 插入 {{var}}（HTTP url / 集合表达式等 {{ }} 上下文），
 *   'plain' 插入裸变量名（Groovy 条件表达式 / 脚本上下文）。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    variables?: string[]
    insertStyle?: 'placeholder' | 'plain'
    type?: 'textarea' | 'input'
    rows?: number
    placeholder?: string
    disabled?: boolean
  }>(),
  { variables: () => [], insertStyle: 'placeholder', type: 'input', rows: 3 }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const inputRef = ref<{ textarea?: HTMLTextAreaElement; input?: HTMLInputElement } | null>(null)

function nativeEl(): HTMLTextAreaElement | HTMLInputElement | null {
  return (inputRef.value?.textarea as HTMLTextAreaElement) || (inputRef.value?.input as HTMLInputElement) || null
}

const open = ref(false)
const filter = ref('')
const active = ref(0)
/** 触发 # 在文本中的起始下标（替换区间左端） */
const triggerStart = ref(0)

const filtered = computed(() => {
  const src = props.variables.filter((v) => !!v)
  const f = filter.value.toLowerCase()
  const list = f ? src.filter((v) => v.toLowerCase().includes(f)) : src
  return list.slice(0, 50)
})

/** 头部提示（含 {{ }} 字面量，必须走 script 计算避免模板插值嵌套解析冲突） */
const insertHint = computed(() =>
  props.insertStyle === 'plain' ? '以变量名插入' : '以 {{变量}} 插入'
)

/** 列表项右侧插入预览（同上，{{ }} 不宜内联在模板插值里） */
function tokenPreview(v: string): string {
  return props.insertStyle === 'plain' ? v : `{{${v}}}`
}

function onInput(value: string) {
  emit('update:modelValue', value)
  nextTick(refreshTrigger)
}

/** 按光标前的文本判定是否处于 # 触发态 */
function refreshTrigger() {
  const el = nativeEl()
  if (!el || props.disabled) {
    close()
    return
  }
  const caret = el.selectionStart ?? 0
  const before = String(props.modelValue ?? '').slice(0, caret)
  const m = before.match(/#([A-Za-z_][A-Za-z0-9_]*)?$/)
  if (!m) {
    close()
    return
  }
  triggerStart.value = caret - m[0].length
  filter.value = m[1] ?? ''
  active.value = 0
  open.value = true
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filtered.value.length) active.value = (active.value + 1) % filtered.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filtered.value.length) active.value = (active.value - 1 + filtered.value.length) % filtered.value.length
  } else if (e.key === 'Enter') {
    // 有候选时选中；无候选放行（textarea 换行 / 单行无副作用）
    if (filtered.value.length) {
      e.preventDefault()
      pick(filtered.value[active.value] ?? filtered.value[0])
    } else {
      e.preventDefault()
      close()
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

/** 选中变量：替换「# + 筛选词」区间为插入 token，光标落 token 之后 */
function pick(name: string) {
  const el = nativeEl()
  const caret = el?.selectionStart ?? String(props.modelValue ?? '').length
  const token = props.insertStyle === 'plain' ? name : `{{${name}}}`
  const text = String(props.modelValue ?? '')
  const next = text.slice(0, triggerStart.value) + token + text.slice(caret)
  const pos = triggerStart.value + token.length
  emit('update:modelValue', next)
  close()
  nextTick(() => {
    const e = nativeEl()
    if (e) {
      e.focus()
      e.setSelectionRange(pos, pos)
    }
  })
}

function close() {
  open.value = false
  filter.value = ''
  active.value = 0
}

/** 失焦延迟关闭：给列表项 mousedown.prevent/click 留出事件窗口 */
function closeSoon() {
  setTimeout(close, 120)
}
</script>

<style scoped>
.var-mention {
  position: relative;
  width: 100%;
}

.vm-popover {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 40;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(31, 36, 55, 0.16);
  overflow: hidden;
}

.vm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.vm-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.vm-list {
  max-height: 176px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.vm-list::-webkit-scrollbar {
  width: 6px;
}

.vm-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.vm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--el-text-color-primary);
}

.vm-item.is-active {
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
}

.vm-name {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  word-break: break-all;
}

.vm-token {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.vm-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
