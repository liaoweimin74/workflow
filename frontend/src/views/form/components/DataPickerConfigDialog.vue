<template>
  <el-dialog v-model="visible" title="数据引用配置" width="620px" :close-on-click-modal="false">
    <el-form label-width="110px" size="default">
      <el-form-item label="目标表单" required>
        <el-select v-model="form.sourceFormKey" placeholder="选择已发布的业务表单" filterable style="width: 100%" @change="handleSourceChange">
          <el-option v-for="f in targetForms" :key="f.key" :label="f.name" :value="f.key" />
        </el-select>
      </el-form-item>

      <el-form-item label="显示字段" required>
        <el-select v-model="form.displayField" placeholder="选择目标表显示字段" style="width: 100%">
          <el-option v-for="c in targetColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>

      <el-form-item label="列表显示列">
        <el-select v-model="form.columns" multiple placeholder="弹窗表格列（默认显示字段）" style="width: 100%">
          <el-option v-for="c in targetColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
      </el-form-item>

      <el-form-item label="选择模式">
        <el-radio-group v-model="form.mode">
          <el-radio value="single">单选</el-radio>
          <el-radio value="multiple">多选</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="返回字段映射">
        <div style="width: 100%">
          <div v-for="(row, i) in form.returnFieldsRows" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
            <el-select v-model="row.source" placeholder="目标表字段" style="width: 45%">
              <el-option v-for="c in targetColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
            <el-select v-model="row.target" placeholder="回填到当前表单字段" style="width: 45%">
              <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
            </el-select>
            <el-button type="danger" link @click="form.returnFieldsRows.splice(i, 1)">删除</el-button>
          </div>
          <el-button type="primary" link @click="form.returnFieldsRows.push({ source: '', target: '' })">+ 添加映射</el-button>
        </div>
      </el-form-item>

      <el-form-item label="级联依赖">
        <div style="display: flex; gap: 8px; width: 100%">
          <el-select v-model="form.dependOnField" placeholder="当前表单字段" clearable style="width: 45%">
            <el-option v-for="f in currentFields" :key="f" :label="f" :value="f" />
          </el-select>
          <el-select v-model="form.dependOnSourceColumn" placeholder="目标表列" clearable style="width: 45%">
            <el-option v-for="c in targetColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
          </el-select>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormDefinitionDTO } from '@/api/form'
import type { ColumnConfigItem } from '@/api/bizData'

const props = defineProps<{
  modelValue: boolean
  /** 已发布业务表单列表 */
  targetForms: FormDefinitionDTO[]
  /** 当前表单字段 key 列表 */
  currentFields: string[]
  /** 目标表单列（父组件根据 sourceFormKey 加载后传入） */
  targetColumns: ColumnConfigItem[]
  /** 正在编辑的 dataPicker 字段 props */
  pickerProps?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', props: Record<string, any>): void
  (e: 'sourceChange', formKey: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive({
  sourceFormKey: '',
  displayField: '',
  columns: [] as string[],
  mode: 'single',
  returnFieldsRows: [] as { source: string; target: string }[],
  dependOnField: '',
  dependOnSourceColumn: '',
})

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      // 从 pickerProps 回填表单
      form.sourceFormKey = props.pickerProps?.sourceFormKey || ''
      form.displayField = props.pickerProps?.displayField || ''
      form.columns = [...(props.pickerProps?.columns || [])]
      form.mode = props.pickerProps?.mode || 'single'
      const returnFields = props.pickerProps?.returnFields || {}
      form.returnFieldsRows = Object.entries(returnFields).map(([s, t]) => ({ source: s, target: String(t) }))
      form.dependOnField = props.pickerProps?.dependOn?.field || ''
      form.dependOnSourceColumn = props.pickerProps?.dependOn?.sourceColumn || ''
    }
  },
)

watch(
  () => form.sourceFormKey,
  (key) => {
    if (key) {
      emit('sourceChange', key)
    }
  },
)

function handleSourceChange() {
  form.displayField = ''
  form.columns = []
  form.dependOnSourceColumn = ''
}

function handleConfirm() {
  if (!form.sourceFormKey || !form.displayField) {
    ElMessage.warning('请选择目标表单与显示字段')
    return
  }
  const returnFields: Record<string, string> = {}
  for (const row of form.returnFieldsRows) {
    if (row.source && row.target) {
      returnFields[row.source] = row.target
    }
  }
  const newProps: Record<string, any> = {
    sourceFormKey: form.sourceFormKey,
    displayField: form.displayField,
    columns: form.columns,
    mode: form.mode,
    returnFields,
    dependOn: form.dependOnField && form.dependOnSourceColumn
      ? { field: form.dependOnField, sourceColumn: form.dependOnSourceColumn }
      : undefined,
  }
  emit('confirm', newProps)
  visible.value = false
}
</script>
