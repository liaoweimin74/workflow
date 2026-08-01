<template>
  <el-form ref="formRef" :model="localModel" :label-width="labelWidth || '80px'" :label-position="labelPosition" style="width: 100%">
    <el-row v-for="(row, ri) in layoutRows" :key="ri" :gutter="resolvedLayout.gap" style="width: 100%">
      <el-col v-for="field in row.fields" :key="field.prop || field.label" :span="field.span ?? (24 / resolvedLayout.cols)">
        <el-form-item :label="field.label" :prop="field.prop" :rules="field.rules">
          <slot v-if="field.type === 'slot'" :name="field.slotName" :value="localModel[field.prop]" :update="(v: any) => setFieldValue(field, v)" />
          <render-field v-else :field="field" :model-value="localModel[field.prop]" :local-model="localModel" @update:model-value="( v: any) => setModelField(field, v)" @input-change="handleChange(field, localModel[field.prop])" />
        </el-form-item>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed, defineComponent, h } from 'vue'
import { ElInput, ElSelect, ElOption, ElTreeSelect, ElSwitch, ElDatePicker, ElRadioGroup, ElRadio, ElCheckboxGroup, ElCheckbox } from 'element-plus'
import type { FormField, FormBuilderProps } from './types'
import LookupPicker from './LookupPicker.vue'

// --- 内联字段渲染组件 ---
const RenderField = defineComponent({
  props: {
    field: { type: Object as () => FormField, required: true },
    modelValue: { required: true },
    localModel: { type: Object as () => Record<string, any>, required: true },
  },
  emits: ['update:modelValue', 'inputChange'],
  setup(props, { emit }) {
    return () => {
      const f = props.field
      const v = props.modelValue
      const onInput = (val: any) => {
        emit('update:modelValue', val)
        emit('inputChange', val)
      }
      const common = {
        modelValue: v,
        'onUpdate:modelValue': onInput,
        placeholder: f.placeholder,
        disabled: f.disabled,
        ...f.props,
      }

      switch (f.type) {
        case 'input':
          return h(ElInput, common)
        case 'textarea':
          return h(ElInput, { ...common, type: 'textarea' })
        case 'select':
          return h(ElSelect, common, () =>
            (f.options || []).map((opt) =>
              h(ElOption, { key: String(opt.value), label: opt.label, value: opt.value }),
            ),
          )
        case 'tree-select':
          return h(ElTreeSelect, {
            ...common,
            ...f.treeProps,
            checkStrictly: true,
          })
        case 'switch':
          return h(ElSwitch, common)
        case 'date-picker':
          return h(ElDatePicker, common)
        case 'radio':
          return h(
            ElRadioGroup,
            common,
            () =>
              (f.options || []).map((opt) =>
                h(ElRadio, { key: String(opt.value), value: opt.value }, () => opt.label),
              ),
          )
        case 'checkbox':
          return h(
            ElCheckboxGroup,
            common,
            () =>
              (f.options || []).map((opt) =>
                h(ElCheckbox, { key: String(opt.value), value: opt.value }, () => opt.label),
              ),
          )
        case 'lookup':
          return h(LookupPicker, {
            modelValue: v,
            'onUpdate:modelValue': (val: Record<string, any> | null | Record<string, any>[]) => {
              onInput(val)
              // 批量更新 returnFields 目标字段
              if (f.props?.returnFields && val) {
                if (Array.isArray(val) && val.length > 0) {
                  for (const [sourceField, targetField] of Object.entries(f.props.returnFields)) {
                    props.localModel[targetField] = val[0][sourceField]
                  }
                } else if (!Array.isArray(val)) {
                  for (const [sourceField, targetField] of Object.entries(f.props.returnFields)) {
                    props.localModel[targetField] = val[sourceField]
                  }
                }
              }
              // 清空时清理目标字段
              if (f.props?.returnFields) {
                const isEmpty = !val || (Array.isArray(val) && val.length === 0)
                if (isEmpty) {
                  for (const targetField of Object.values(f.props.returnFields)) {
                    props.localModel[targetField] = null
                  }
                }
              }
            },
            ...f.props,
          })
        default:
          return null
      }
    }
  },
})

const props = withDefaults(defineProps<FormBuilderProps>(), {
  layout: 'single',
  labelWidth: '80px',
})

const resolvedLayout = computed(() => {
  const l = props.layout
  if (typeof l === 'object' && l !== null && 'cols' in l) {
    return { cols: l.cols, gap: l.gap ?? 16 }
  }
  if (l === 'single') return { cols: 1, gap: 0 }
  if (l === 'double') return { cols: 2, gap: 16 }
  return { cols: 1, gap: 0 }
})

const layoutRows = computed(() => {
  const cols = resolvedLayout.value.cols
  const defaultSpan = 24 / cols
  const rows: { fields: FormField[] }[] = []
  let currentRow: FormField[] = []
  let acc = 0
  for (const field of props.fields) {
    // 跳过不可见字段
    if (field.visible && !field.visible({ ...localModel })) continue
    const span = field.span ?? defaultSpan
    if (acc > 0 && acc + span > 24) {
      rows.push({ fields: currentRow })
      currentRow = [field]
      acc = span
    } else {
      currentRow.push(field)
      acc += span
    }
  }
  if (currentRow.length) rows.push({ fields: currentRow })
  return rows
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const formRef = ref()
const localModel = reactive<Record<string, any>>({ ...props.modelValue })
const oldValues = ref<Record<string, any>>({})

// 初始化 oldValues
watch(
  () => props.modelValue,
  (val) => {
    // 先清除旧 key，再写入新值，避免残留
    const oldKeys = Object.keys(localModel)
    const newKeys = Object.keys(val)
    for (const key of oldKeys) {
      if (!(key in val)) {
        delete localModel[key]
      }
    }
    Object.assign(localModel, val)
    // 记录初始值
    for (const key of newKeys) {
      if (!(key in oldValues.value)) {
        oldValues.value[key] = val[key]
      }
    }
  },
  { immediate: true, deep: true },
)

// 同步 localModel 变化到父组件
watch(
  localModel,
  (val) => {
    emit('update:modelValue', { ...val })
  },
  { deep: true },
)

async function handleChange(field: FormField, newVal: any) {
  if (!field.onChange) return
  const oldVal = oldValues.value[field.prop]
  const ok = await field.onChange(newVal, oldVal, { ...localModel })
  if (ok === false) {
    localModel[field.prop] = oldVal
  } else {
    oldValues.value[field.prop] = newVal
  }
}

function setModelField(field: FormField, val: any) {
  oldValues.value[field.prop] = localModel[field.prop]
  localModel[field.prop] = val
}

function setFieldValue(field: FormField, val: any) {
  oldValues.value[field.prop] = localModel[field.prop]
  localModel[field.prop] = val
}

async function validate(): Promise<boolean> {
  return new Promise((resolve) => {
    formRef.value?.validate((valid: boolean) => {
      resolve(valid)
    })
  })
}

function validateField(prop: string) {
  return formRef.value?.validateField(prop)
}

function resetFields() {
  formRef.value?.resetFields()
}

function clearValidate(props?: string | string[]) {
  formRef.value?.clearValidate(props)
}

defineExpose({ validate, validateField, resetFields, clearValidate })
</script>