<template>
  <el-select
    :model-value="selectValue"
    :multiple="multiple"
    :disabled="disabled"
    :clearable="clearable"
    :loading="loading"
    :placeholder="placeholder"
    :size="size"
    style="width: 100%"
    @update:model-value="handleChange"
  >
    <el-option
      v-for="opt in options"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </el-select>
</template>

<script setup lang="ts">
/**
 * 业务组件·字典下拉（Task 3-a，表单设计器「字典选择」字段）。
 *
 * el-select 包装，选项来自系统字典（GET /dict-data/{dictCode}，见 api/dict.ts）：
 * - props.dictTypeCode 变化（含首次挂载）自动拉取字典数据渲染选项，
 *   label ← DictDataVO.label、value ← DictDataVO.value（对齐后端字段，非 dictLabel/dictValue）
 * - 仅展示「启用」字典项（status === 1，与字典管理页语义一致），按 sortOrder 升序
 * - 回显补偿：当前值命中「停用」字典项时把该项补入选项（不展示于新增选择场景之外，
 *   仅保证存量数据 label 可回显，而非裸值）
 * - 加载失败静默降级：console.warn + 空选项，不弹 ElMessage（表单渲染页不应被
 *   字典故障打断填写，故障可见性交给控制台）
 * - 值语义：单选 string，多选 string[]（form-create validate: string/array）
 */
import { computed, onMounted, ref, watch } from 'vue'
import { getDictDataList } from '@/api/dict'

interface DictOption {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  /** 选中值（单选 string，多选 string[]） */
  modelValue?: string | string[]
  /** 字典类型编码（dictCode，对应字典管理页的分类编码） */
  dictTypeCode?: string
  /** 是否多选 */
  multiple?: boolean
  /** 占位提示 */
  placeholder?: string
  /** 禁用 */
  disabled?: boolean
  /** 是否可清空 */
  clearable?: boolean
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
}>(), {
  modelValue: '',
  dictTypeCode: '',
  multiple: false,
  placeholder: '请选择',
  disabled: false,
  clearable: true,
  size: 'default',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[]): void
  (e: 'change', value: string | string[]): void
}>()

const options = ref<DictOption[]>([])
const loading = ref(false)

/** 传给 el-select 的值：多选容错（历史 VARCHAR 单值自动包装为数组），单选透传 */
const selectValue = computed<string | string[]>(() => {
  if (props.multiple) {
    if (Array.isArray(props.modelValue)) return props.modelValue
    return props.modelValue ? [props.modelValue] : []
  }
  return props.modelValue ?? ''
})

async function loadOptions() {
  const code = (props.dictTypeCode || '').trim()
  if (!code) {
    options.value = []
    return
  }
  loading.value = true
  try {
    const res = await getDictDataList(code)
    const list = (res.data as any[]) || []
    const enabled = list
      .filter((d) => d.status === 1)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((d) => ({ label: String(d.label ?? ''), value: String(d.value ?? '') }))
    // 回显补偿：当前值命中停用项时补入选项，保证存量数据 label 可回显
    const current = Array.isArray(selectValue.value) ? selectValue.value : [selectValue.value]
    const enabledValues = new Set(enabled.map((o) => o.value))
    const compensated = list
      .filter((d) => d.status !== 1 && current.includes(String(d.value)))
      .map((d) => ({ label: String(d.label ?? ''), value: String(d.value ?? '') }))
      .filter((o) => !enabledValues.has(o.value))
    options.value = [...enabled, ...compensated]
  } catch (e) {
    // 静默降级：不弹 ElMessage，控制台留痕
    console.warn(`[DictSelect] 字典数据加载失败（dictTypeCode=${code}）:`, e)
    options.value = []
  } finally {
    loading.value = false
  }
}

function handleChange(value: string | string[]) {
  emit('update:modelValue', value)
  emit('change', value)
}

onMounted(loadOptions)
// 字典类型变化（设计器面板改配置 / 联动）→ 重拉选项
watch(() => props.dictTypeCode, loadOptions)
</script>
