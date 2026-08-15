<template>
  <el-dialog v-model="visible" :title="`发布业务表单 - 列映射确认（${formName || ''}）`" width="760px" :close-on-click-modal="false">
    <el-alert
      v-if="unsupportedFields.length > 0"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    >
      存在不支持映射为数据列的字段（子表/嵌套表单等）：{{ unsupportedFields.join('、') }}。请移除后发布。
    </el-alert>
    <el-alert type="info" :closable="false" style="margin-bottom: 12px">
      表单发布后将生成数据表，字段按以下列映射存储。已发布字段的列类型不允许跨类变更（如文本改数字）。
    </el-alert>

    <el-table :data="editableItems" border size="small" max-height="420">
      <el-table-column label="字段" min-width="130">
        <template #default="{ row }">
          <div :class="{ 'unsupported-field': row.unsupported }">
            {{ row.label }}
            <el-tag v-if="row.hidden" size="small" type="info" style="margin-left: 4px">隐藏</el-tag>
          </div>
          <div class="field-key">{{ row.key }}</div>
        </template>
      </el-table-column>
      <el-table-column label="列类型" width="150">
        <template #default="{ row }">
          <el-select v-if="!row.unsupported && !row.hidden" v-model="row.columnType" size="small" :disabled="isCrossChangeLocked(row)">
            <el-option v-for="t in allowedTypes" :key="t" :label="t" :value="t" />
          </el-select>
          <span v-else-if="row.hidden">{{ row.columnType }}</span>
          <span v-else class="unsupported-text">不支持</span>
        </template>
      </el-table-column>
      <el-table-column label="长度" width="90" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="!row.unsupported && !row.hidden && showLength(row)"
            v-model="row.length"
            :min="1"
            :max="row.columnType === 'VARCHAR' ? 255 : 30"
            size="small"
            controls-position="right"
            style="width: 100%"
          />
          <span v-else-if="row.hidden">{{ row.length }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="必填" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-if="!row.unsupported && !row.hidden" v-model="row.required" size="small" />
          <span v-else-if="row.hidden">—</span>
        </template>
      </el-table-column>
      <el-table-column label="唯一" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-if="!row.unsupported && !row.hidden" v-model="row.unique" size="small" />
          <span v-else-if="row.hidden">—</span>
        </template>
      </el-table-column>
      <el-table-column label="索引" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-if="!row.unsupported && !row.hidden" v-model="row.indexed" size="small" />
          <span v-else-if="row.hidden">—</span>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="unsupportedFields.length > 0" @click="handleConfirm">确认发布</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Rule } from '@form-create/element-ui'

export interface ColumnConfigItem {
  key: string
  label: string
  columnType: string
  length: number | null
  scale: number | null
  required: boolean
  unique: boolean
  indexed: boolean
  unsupported?: boolean
  /** 隐藏列（data-picker 冗余文本列，不进表格/筛选，参与 CRUD 写入） */
  hidden?: boolean
  /** 数据引用配置（dataPicker 字段：sourceFormKey/displayField/mode JSON） */
  pickerConfig?: string
  /** 已发布版本中的列类型（存在时禁止跨类变更） */
  existingType?: string
}

const props = defineProps<{
  modelValue: boolean
  schema?: Rule[]
  formName?: string
  /** 已发布版本的列映射（再次发布时用于禁止跨类变更） */
  existingColumns?: ColumnConfigItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', items: ColumnConfigItem[]): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const allowedTypes = ['VARCHAR', 'TEXT', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'TINYINT', 'JSON', 'LONGTEXT']

const editableItems = ref<ColumnConfigItem[]>([])
const unsupportedFields = computed(() => editableItems.value.filter(i => i.unsupported).map(i => i.label))

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      buildDraft()
    }
  },
)

/** 组件类型 → 列类型映射（与后端 ColumnTypeMapper 对齐） */
function mapComponentToColumn(type: string, propsMap: Record<string, any>): { columnType: string; length: number | null; scale: number | null } | null {
  switch (type) {
    case 'input':
      return { columnType: 'VARCHAR', length: 255, scale: null }
    case 'textarea':
    case 'RichText':
    case 'richText':
      return { columnType: 'TEXT', length: null, scale: null }
    case 'inputNumber': {
      const precision = Number(propsMap?.precision) || 0
      return precision > 0
        ? { columnType: 'DECIMAL', length: 18, scale: precision }
        : { columnType: 'INT', length: null, scale: null }
    }
    case 'select':
    case 'radio':
    case 'cascader':
      return { columnType: 'VARCHAR', length: 255, scale: null }
    case 'checkbox':
    case 'multiSelect':
    case 'multiSelectPro':
      // 多选值以数组/JSON 存储，长度不可控 → JSON（与后端 ColumnTypeMapper 对齐）
      return { columnType: 'JSON', length: null, scale: null }
    case 'DatePicker':
    case 'datePicker': {
      const subType = propsMap?.type
      if (subType === 'datetime' || subType === 'datetimerange') {
        return { columnType: 'DATETIME', length: null, scale: null }
      }
      return { columnType: 'DATE', length: null, scale: null }
    }
    case 'TimePicker':
    case 'timePicker':
      return { columnType: 'VARCHAR', length: 32, scale: null }
    case 'switch':
      return { columnType: 'TINYINT', length: 1, scale: null }
    case 'Upload':
    case 'upload':
    case 'fileUpload':
      return { columnType: 'JSON', length: null, scale: null }
    case 'rate':
      return { columnType: 'INT', length: null, scale: null }
    case 'colorPicker':
      return { columnType: 'VARCHAR', length: 16, scale: null }
    case 'tree':
    case 'elTreeSelect': {
      // 多选（showCheckbox/multiple）以数组/JSON 存储，单选存值 → VARCHAR(255)
      const multi = propsMap?.multiple || propsMap?.showCheckbox
      return multi
        ? { columnType: 'JSON', length: null, scale: null }
        : { columnType: 'VARCHAR', length: 255, scale: null }
    }
    case 'elTransfer':
      return { columnType: 'JSON', length: null, scale: null }
    case 'fcEditor':
      return { columnType: 'TEXT', length: null, scale: null }
    case 'signaturePad':
      // 签名图片 base64 可能很长 → LONGTEXT
      return { columnType: 'LONGTEXT', length: null, scale: null }
    case 'subForm':
      // 子表：值以 JSON 数组存储（列标记 hidden，不进列表）
      return { columnType: 'JSON', length: null, scale: null }
    case 'slider': {
      // 双滑块（range）值 [min,max] → JSON；step 小数 → DECIMAL；其余整数 → INT（与后端 applySlider 对齐）
      if (propsMap?.range) return { columnType: 'JSON', length: null, scale: null }
      const step = Number(propsMap?.step)
      if (Number.isFinite(step) && step > 0 && !Number.isInteger(step)) {
        const plain = step.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')
        const scale = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0
        return { columnType: 'DECIMAL', length: 18, scale }
      }
      return { columnType: 'INT', length: null, scale: null }
    }
    default:
      return null
  }
}

const UNSUPPORTED_TYPES = ['divider', 'groupContainer', 'dataTable']

/** 从 LookupPicker fetch.action（/v1/biz-data/<formKey>）推断数据源表单 key */
function inferSourceFormKey(propsMap: Record<string, any>): string | undefined {
  const action = typeof propsMap.fetch?.action === 'string' ? propsMap.fetch.action : ''
  const m = action.match(/\/v1\/biz-data\/([a-zA-Z][a-zA-Z0-9_]*)/)
  return m ? m[1] : undefined
}

function isLayoutContainer(rule: any): boolean {
  return !rule?.field && Array.isArray(rule?.children)
}

function collectFields(rules: any[], out: ColumnConfigItem[]) {
  for (const rule of rules) {
    if (isLayoutContainer(rule)) {
      collectFields(rule.children || [], out)
      continue
    }
    const field = rule?.field as string | undefined
    if (!field) continue
    const type = rule?.type as string
    const label = (rule?.title as string) || field
    if (UNSUPPORTED_TYPES.includes(type)) {
      out.push({ key: field, label, columnType: '', length: null, scale: null, required: false, unique: false, indexed: false, unsupported: true })
      continue
    }
    // data-picker：生成两列（id 列 + 隐藏冗余文本列）
    // 值以 JSON 数组存储（["u1","u2"]，单选为 ["u1"]），长度不可控 → 两列均 TEXT
    if (type === 'dataPicker') {
      const propsMap = (rule?.props || {}) as Record<string, any>
      const existing = props.existingColumns?.find(c => c.key === field)
      const existingText = props.existingColumns?.find(c => c.key === field + '_text')
      out.push({
        key: field,
        label,
        columnType: 'TEXT',
        length: null,
        scale: null,
        required: Boolean(rule?.validate?.some?.((v: any) => v.required)),
        unique: existing?.unique ?? false,
        indexed: existing?.indexed ?? false,
        pickerConfig: JSON.stringify({
          sourceFormKey: propsMap.sourceFormKey,
          displayField: propsMap.displayField,
          maxCount: propsMap.maxCount,
          pickerType: 'dataPicker',
        }),
        existingType: existing?.columnType,
      })
      out.push({
        key: field + '_text',
        label: label + '（显示）',
        columnType: 'TEXT',
        length: null,
        scale: null,
        required: false,
        unique: false,
        indexed: false,
        hidden: true,
        existingType: existingText?.columnType,
      })
      continue
    }
    // LookupPicker（查找带回）：存显示文本字符串 → VARCHAR(255)
    if (type === 'LookupPicker') {
      const propsMap = (rule?.props || {}) as Record<string, any>
      const existing = props.existingColumns?.find(c => c.key === field)
      out.push({
        key: field,
        label,
        columnType: 'VARCHAR',
        length: 255,
        scale: null,
        required: Boolean(rule?.validate?.some?.((v: any) => v.required)),
        unique: existing?.unique ?? false,
        indexed: existing?.indexed ?? false,
        pickerConfig: JSON.stringify({
          sourceFormKey: propsMap.sourceFormKey || inferSourceFormKey(propsMap),
          displayField: propsMap.displayField,
          mode: 'single',
          pickerType: 'lookupPicker',
        }),
        existingType: existing?.columnType,
      })
      continue
    }
    const mapped = mapComponentToColumn(type, rule?.props || {})
    if (!mapped) {
      out.push({ key: field, label, columnType: '', length: null, scale: null, required: false, unique: false, indexed: false, unsupported: true })
      continue
    }
    const existing = props.existingColumns?.find(c => c.key === field)
    out.push({
      key: field,
      label,
      columnType: mapped.columnType,
      length: mapped.length,
      scale: mapped.scale,
      required: Boolean(rule?.validate?.some?.((v: any) => v.required)),
      unique: existing?.unique ?? false,
      indexed: existing?.indexed ?? false,
      // subForm：JSON 列不进列表（仅参与 CRUD 写入），隐藏不可编辑
      ...(type === 'subForm' ? { hidden: true } : {}),
      existingType: existing?.columnType,
    })
  }
}

function buildDraft() {
  const items: ColumnConfigItem[] = []
  collectFields(props.schema || [], items)
  editableItems.value = items
}

/** 跨类变更判断（与后端 categoryOf 对齐） */
function categoryOf(type: string): string {
  if (!type) return 'UNKNOWN'
  if (['VARCHAR', 'TEXT', 'LONGTEXT', 'TINYINT', 'JSON'].includes(type)) return 'STRING'
  if (type === 'INT') return 'INT'
  if (type === 'DECIMAL') return 'DECIMAL'
  if (['DATE', 'DATETIME'].includes(type)) return 'DATE'
  return 'UNKNOWN'
}

function isCrossChangeLocked(row: ColumnConfigItem): boolean {
  if (!row.existingType) return false
  return categoryOf(row.existingType) !== categoryOf(row.columnType)
}

function showLength(row: ColumnConfigItem): boolean {
  return row.columnType === 'VARCHAR' || row.columnType === 'TINYINT' || row.columnType === 'DECIMAL'
}

function handleConfirm() {
  const items = editableItems.value.filter(i => !i.unsupported).map(({ existingType, unsupported, ...rest }) => rest)
  if (items.length === 0) {
    ElMessage.warning('请至少保留一个可映射字段')
    return
  }
  emit('confirm', items)
  visible.value = false
}
</script>

<style scoped>
.field-key {
  font-size: 12px;
  color: #909399;
}
.unsupported-field {
  color: #f56c6c;
  font-weight: bold;
}
.unsupported-text {
  color: #f56c6c;
}
</style>
