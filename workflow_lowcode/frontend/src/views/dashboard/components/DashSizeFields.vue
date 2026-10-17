<template>
  <el-form-item label="宽度">
    <div style="display: flex; gap: 8px; width: 100%">
      <el-select :model-value="spanMode" style="width: 170px" @update:model-value="onSpanMode">
        <el-option v-for="o in DASH_SPAN_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <el-input-number
        v-if="spanMode === 0"
        :model-value="spanCustom"
        :min="1"
        :max="24"
        style="flex: 1"
        @update:model-value="onSpanCustom"
      />
    </div>
    <div class="size-hint">按 24 栅格分宽；同行多个组件建议档位互补（如两个 1/2 宽）</div>
  </el-form-item>

  <el-form-item label="显示高度">
    <div style="display: flex; gap: 8px; width: 100%">
      <el-select :model-value="heightMode" style="width: 170px" @update:model-value="onHeightMode">
        <el-option v-for="o in DASH_HEIGHT_OPTIONS" :key="o.value || 'auto'" :value="o.value" :label="o.label" />
      </el-select>
      <el-input
        v-if="heightMode === 'custom'"
        :model-value="heightCustom"
        placeholder="如 280px"
        maxlength="12"
        style="flex: 1"
        @update:model-value="onHeightCustom"
      />
    </div>
    <div class="size-hint">卡片整体高度；自适应时随内容伸缩</div>
  </el-form-item>
</template>

<script setup lang="ts">
/**
 * 图表分组组件的宽度/高度配置段（档位见 dash-shared 的 DASH_SPAN_OPTIONS /
 * DASH_HEIGHT_OPTIONS，两个配置入口共用同一段控件，保证选项一致）。
 *
 * 值形态与设计器 rule 一致：span = 生效栅格（1-24），height = 生效 CSS 高度
 * （'' = 自适应）；档位与自定义输入是本组件的内部态，父级只关心生效值。
 */
import { ref, watch } from 'vue'
import {
  DASH_HEIGHT_OPTIONS,
  DASH_SPAN_OPTIONS,
  clampDashSpan,
  dashHeightModeOf,
  dashSpanModeOf,
} from './dash-shared'

const props = defineProps<{
  /** 生效栅格跨度（1-24，与 rule.col.span 镜像） */
  span?: number
  /** 生效显示高度（'' = 自适应） */
  height?: string
}>()

const emit = defineEmits<{
  (e: 'update:span', value: number): void
  (e: 'update:height', value: string): void
}>()

const spanMode = ref(dashSpanModeOf(props.span))
const spanCustom = ref(clampDashSpan(props.span))
const heightMode = ref(dashHeightModeOf(props.height))
const heightCustom = ref(String(props.height ?? ''))

/** 最近一次向外回传的值：父级回填时同值不再重算档位（避免自定义输入被打回下拉） */
let lastEmitted: { span: number; height: string } = {
  span: clampDashSpan(props.span),
  height: String(props.height ?? ''),
}

watch(
  () => [props.span, props.height] as const,
  ([span, height]) => {
    if (span === lastEmitted.span && String(height ?? '') === lastEmitted.height) return
    spanMode.value = dashSpanModeOf(span)
    spanCustom.value = clampDashSpan(span)
    heightMode.value = dashHeightModeOf(height)
    heightCustom.value = String(height ?? '')
    lastEmitted = { span: clampDashSpan(span), height: String(height ?? '') }
  },
)

function emitSpan(value: number): void {
  const span = clampDashSpan(value)
  lastEmitted = { ...lastEmitted, span }
  emit('update:span', span)
}

function emitHeight(value: string): void {
  const height = String(value ?? '').trim()
  lastEmitted = { ...lastEmitted, height }
  emit('update:height', height)
}

function onSpanMode(mode: number): void {
  spanMode.value = mode
  if (mode !== 0) {
    spanCustom.value = mode
    emitSpan(mode)
    return
  }
  emitSpan(spanCustom.value)
}

function onSpanCustom(value: number): void {
  spanCustom.value = clampDashSpan(value)
  emitSpan(spanCustom.value)
}

function onHeightMode(mode: string): void {
  heightMode.value = mode
  if (mode !== 'custom') {
    if (mode) heightCustom.value = mode
    emitHeight(mode)
    return
  }
  emitHeight(heightCustom.value)
}

function onHeightCustom(value: string): void {
  heightCustom.value = value
  emitHeight(value)
}
</script>

<style scoped>
.size-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder, #c0c4cc);
  line-height: 1.4;
  width: 100%;
}
</style>
