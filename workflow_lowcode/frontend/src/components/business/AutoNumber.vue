<template>
  <div class="auto-number" :class="{ 'is-disabled': disabled }">
    <el-input
      class="auto-number__input"
      :model-value="modelValue"
      disabled
      :placeholder="placeholderText"
      :title="modelValue || undefined"
    >
      <template #prefix>
        <el-icon class="auto-number__icon"><Tickets /></el-icon>
      </template>
    </el-input>
    <!-- 无值时的格式示意（设计器画布 + 填写态空值共用）；有值后隐藏，只回显编号 -->
    <div v-if="!modelValue" class="auto-number__preview">
      <span class="auto-number__preview-text">编号规则：{{ previewText }}</span>
      <span class="auto-number__preview-policy">流水号{{ resetPolicyText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 自动编号 AutoNumber（Task 3-c）——表单设计器「系统组件」分组。
 *
 * 【只读展示字段】编号在表单提交后由后端生成器写入（prefix + 日期段 + 流水号），
 * 本组件在设计态/填写态只做展示：
 * - 无值：disabled el-input（前缀图标 + 占位「提交后自动生成」）+ 下方格式预览 previewText
 * - 有值：disabled el-input 回显后端写入的编号（悬浮 title 展示全值）
 *
 * 【值生成契约（重要，给后端生成器）】
 * - 值永远由后端在提交时生成并写入字段；前端绝不自行生成编号，
 *   本组件也因此不 emit update:modelValue（无任何 UI 交互会改变值）。
 * - 生成规则：prefix + formatAutoNumberDate(now, dateFormat) + 流水号补零至 seqDigits 位；
 *   resetPolicy 决定流水号归零粒度（day/month/year/never），完整契约见 autoNumberFormat.ts 头注释。
 */
import { computed } from 'vue'
import { Tickets } from '@element-plus/icons-vue'
import {
  buildPreviewText,
  RESET_POLICY_LABELS,
  type AutoNumberResetPolicy,
} from './autoNumberFormat'

const props = withDefaults(defineProps<{
  /** 字段值（后端生成的完整编号；空串/undefined = 尚未生成） */
  modelValue?: string
  /** 编号前缀（如单据类型缩写） */
  prefix?: string
  /** 日期段格式（yyyy/yyyyMM/yyyyMMdd/yyyyMMddHH） */
  dateFormat?: string
  /** 流水号归零粒度 */
  resetPolicy?: AutoNumberResetPolicy | string
  /** 流水号位数（补零目标长度） */
  seqDigits?: number
  /** 无值时的输入框占位文案 */
  placeholder?: string
  /** 禁用（视觉态；字段本身恒只读） */
  disabled?: boolean
}>(), {
  modelValue: '',
  prefix: 'BN',
  dateFormat: 'yyyyMMdd',
  resetPolicy: 'day',
  seqDigits: 4,
  placeholder: '',
  disabled: false,
})

/** 无值占位：显式 placeholder 优先，否则默认「提交后自动生成」 */
const placeholderText = computed(() => (props.placeholder || '').trim() ? props.placeholder : '提交后自动生成')

/** 格式示意：prefix + 当前日期按 dateFormat 格式化 + seqDigits 个 x（设计器 props 面板/画布展示用） */
const previewText = computed(() =>
  buildPreviewText({ prefix: props.prefix, dateFormat: props.dateFormat, seqDigits: props.seqDigits }),
)

/** resetPolicy 粒度提示（未知值回退「按天重置」默认语义） */
const resetPolicyText = computed(
  () => RESET_POLICY_LABELS[props.resetPolicy as AutoNumberResetPolicy] || RESET_POLICY_LABELS.day,
)

defineOptions({ name: 'AutoNumber' })
</script>

<style scoped>
.auto-number {
  width: 100%;
}

.auto-number__preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.auto-number__preview-text {
  color: var(--el-color-primary);
}

.auto-number__preview-policy {
  color: var(--el-text-color-secondary);
}
</style>
