<template>
  <UserPicker
    :model-value="modelValue"
    :multiple="multiple"
    :disabled="disabled"
    :placeholder="placeholder"
    :clearable="clearable"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * 系统组件·用户选择（Task 143）。
 *
 * 封装系统已有的 UserPicker（@/components/business/UserPicker.vue），
 * 作为表单设计器 / 页面设计器「系统组件」分组的用户字段组件：
 * - 值语义：单选存 username（string），多选存 username 数组（string[]）
 * - 设计器画布与运行时渲染共用（main.ts 经 FcDesigner.component 全局注册）
 * - 业务表单列映射：单选 → VARCHAR(255)，多选 → JSON（见 ColumnConfigDialog / ColumnTypeMapper）
 */
import UserPicker from '@/components/business/UserPicker.vue'

const props = withDefaults(defineProps<{
  /** 选中值（单选 username 字符串，多选 username 数组） */
  modelValue?: string | string[]
  /** 是否多选 */
  multiple?: boolean
  /** 禁用 */
  disabled?: boolean
  /** 占位提示 */
  placeholder?: string
  /** 是否可清空 */
  clearable?: boolean
}>(), {
  multiple: false,
  disabled: false,
  placeholder: '请选择用户',
  clearable: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'change', value: string | string[]): void
}>()

function handleChange(value: string | string[]) {
  emit('update:modelValue', value)
  emit('change', value)
}

// props 仅声明即用（模板透传），显式引用避免 lint 未使用告警
void props
</script>
