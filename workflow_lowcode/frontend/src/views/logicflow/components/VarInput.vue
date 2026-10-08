<template>
  <div class="var-field" v-bind="wrapperAttrs">
    <el-input
      ref="inputInst"
      v-bind="inputAttrs"
      :model-value="modelValue"
      :type="textarea ? 'textarea' : 'text'"
      :rows="rows"
      @update:model-value="onValue"
    >
      <template v-if="!textarea" #suffix>
        <VariablePicker :variables="variables" :mode="mode" @pick="onPick" />
      </template>
    </el-input>

    <!-- textarea 无 suffix 槽：浮动触发钮 -->
    <div v-if="textarea" class="var-anchor">
      <VariablePicker :variables="variables" :mode="mode" @pick="onPick" />
    </div>

    <!-- 就近变量列表（Groovy 编辑器等长文本场景） -->
    <div v-if="chips" class="var-chips">
      <span class="chips-label">变量</span>
      <div class="chips-scroll">
        <template v-if="chipVars.length">
          <button
            v-for="v in chipVars"
            :key="v.group + v.name"
            class="chip"
            type="button"
            :title="v.detail || v.name"
            @click="onChipPick(v)"
          >
            {{ v.name }}
          </button>
        </template>
        <span v-else class="chips-empty">暂无可用变量：工具栏「入参」可声明，上游节点输出参数（results）可产出</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useAttrs } from 'vue'
import type { InputInstance } from 'element-plus'
import VariablePicker from './VariablePicker.vue'
import type { FlowVarItem } from '../utils/flowVars'
import { varInsertText } from '../utils/flowVars'

defineOptions({ name: 'VarInput', inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined
    variables?: FlowVarItem[]
    /** placeholder = 插入 {{name}}；bare = 插入裸变量名 */
    mode?: 'placeholder' | 'bare'
    /** 点击后整字段替换（变量名单值字段：condition.variable / 参数 source 等） */
    replace?: boolean
    /** textarea 形态（Groovy 编辑器） */
    textarea?: boolean
    rows?: number
    /** 显示就近变量 chips 行 */
    chips?: boolean
  }>(),
  { variables: () => [], mode: 'placeholder', replace: false, textarea: false, rows: 3, chips: false }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const attrs = useAttrs()
/** class/style 落在外层包装（flex 布局/deep 选择器沿用原类名位置），其余透传 el-input */
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const inputInst = ref<InputInstance>()

/** 空值统一按空串处理（可选字段 value?: string 直绑不报错） */
const curValue = computed(() => props.modelValue ?? '')

/** bare 模式 chips 同步隐藏 formData 组 */
const chipVars = computed(() =>
  props.mode === 'bare' ? props.variables.filter((v) => v.group !== 'form') : props.variables
)

function onValue(value: string) {
  emit('update:modelValue', value)
}

/** 光标处插入并恢复焦点/光标（无原生元素时退化为尾部追加） */
async function insertAtCursor(text: string) {
  const el = (inputInst.value?.textarea ?? inputInst.value?.input) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | undefined
  const cur = curValue.value

  if (!el) {
    emit('update:modelValue', cur + text)
    return
  }

  const start = el.selectionStart ?? cur.length
  const end = el.selectionEnd ?? cur.length
  emit('update:modelValue', cur.slice(0, start) + text + cur.slice(end))

  await nextTick()
  el.focus()
  const pos = start + text.length
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    /* 部分浏览器对只读态设置选区会抛错，忽略 */
  }
}

function onPick(text: string) {
  if (props.replace && !props.textarea) {
    emit('update:modelValue', text)
    return
  }
  insertAtCursor(text)
}

/** chips 点击：与弹出列表同一插入语义 */
function onChipPick(v: FlowVarItem) {
  onPick(varInsertText(v, props.mode))
}
</script>

<style scoped>
.var-field {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  flex-direction: column;
  gap: 6px;
}

.var-field :deep(.el-input),
.var-field :deep(.el-textarea) {
  width: 100%;
}

/* textarea：右侧留出浮动触发钮空间 */
.var-field :deep(.el-textarea textarea) {
  padding-right: 36px;
}

.var-anchor {
  position: absolute;
  top: 7px;
  right: 9px;
  z-index: 5;
  line-height: 1;
}

/* ===== 就近变量 chips ===== */
.var-chips {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
}

.chips-label {
  flex-shrink: 0;
  padding-top: 2px;
  color: var(--el-text-color-secondary);
}

.chips-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 74px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.chips-scroll::-webkit-scrollbar {
  width: 5px;
}

.chips-scroll::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.chip {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
  color: var(--el-color-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.chip:hover {
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  border-color: var(--el-color-primary);
}

.chips-empty {
  color: var(--el-text-color-placeholder);
  line-height: 1.6;
}
</style>
