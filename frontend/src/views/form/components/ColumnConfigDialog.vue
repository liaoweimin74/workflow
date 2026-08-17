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
      <el-table-column type="expand" width="32">
        <template #default="{ row }">
          <div v-if="row.subColumns" class="subtable-config">
            <div class="subtable-config-header">
              <span class="subtable-config-title">子表字段配置（{{ row.label }}）</span>
              <span class="subtable-config-label">传输方式</span>
              <el-select v-model="row.subMode" size="small" style="width: 220px">
                <el-option label="内嵌（随主表往返）" value="embedded" />
                <el-option label="独立接口（dedicated）" value="dedicated" />
              </el-select>
            </div>
            <el-alert
              v-if="row.subColumns.filter((c: any) => !c.unsupported).length === 0"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom: 8px"
            >
              子表没有可映射子列，该字段将无法发布。
            </el-alert>
            <el-table :data="row.subColumns" border size="small">
              <el-table-column label="子字段" min-width="120">
                <template #default="{ row: sub }">
                  <div :class="{ 'unsupported-field': sub.unsupported }">{{ sub.label }}</div>
                  <div class="field-key">{{ sub.key }}</div>
                </template>
              </el-table-column>
              <el-table-column label="列类型" width="140">
                <template #default="{ row: sub }">
                  <el-select v-if="!sub.unsupported" v-model="sub.columnType" size="small" :disabled="isCrossChangeLocked(sub)">
                    <el-option v-for="t in allowedTypes" :key="t" :label="t" :value="t" />
                  </el-select>
                  <span v-else class="unsupported-text">不支持</span>
                </template>
              </el-table-column>
              <el-table-column label="长度" width="90" align="center">
                <template #default="{ row: sub }">
                  <el-input-number
                    v-if="!sub.unsupported && showLength(sub)"
                    v-model="sub.length"
                    :min="1"
                    :max="sub.columnType === 'VARCHAR' ? 255 : 30"
                    size="small"
                    controls-position="right"
                    style="width: 100%"
                  />
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="必填" width="70" align="center">
                <template #default="{ row: sub }">
                  <el-switch v-if="!sub.unsupported" v-model="sub.required" size="small" />
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="唯一" width="70" align="center">
                <template #default="{ row: sub }">
                  <el-switch v-if="!sub.unsupported" v-model="sub.unique" size="small" />
                  <span v-else>—</span>
                </template>
              </el-table-column>
              <el-table-column label="索引" width="70" align="center">
                <template #default="{ row: sub }">
                  <el-switch v-if="!sub.unsupported" v-model="sub.indexed" size="small" />
                  <span v-else>—</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <span v-else class="subtable-empty">—</span>
        </template>
      </el-table-column>
      <el-table-column label="字段" min-width="130">
        <template #default="{ row }">
          <div :class="{ 'unsupported-field': row.unsupported }">
            {{ row.label }}
            <el-tag v-if="row.hidden" size="small" type="info" style="margin-left: 4px">隐藏</el-tag>
            <el-tag v-if="row.subColumns" size="small" type="warning" style="margin-left: 4px">子表</el-tag>
          </div>
          <div class="field-key">{{ row.key }}</div>
        </template>
      </el-table-column>
      <el-table-column label="列类型" width="150">
        <template #default="{ row }">
          <span v-if="row.subColumns" class="subtable-type">子表</span>
          <el-select v-else-if="!row.unsupported && !row.hidden" v-model="row.columnType" size="small" :disabled="isCrossChangeLocked(row)">
            <el-option v-for="t in allowedTypes" :key="t" :label="t" :value="t" />
          </el-select>
          <span v-else-if="row.hidden">{{ row.columnType }}</span>
          <span v-else class="unsupported-text">不支持</span>
        </template>
      </el-table-column>
      <el-table-column label="长度" width="90" align="center">
        <template #default="{ row }">
          <el-input-number
            v-if="!row.unsupported && !row.hidden && !row.subColumns && showLength(row)"
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
          <el-switch v-if="!row.unsupported && !row.hidden && !row.subColumns" v-model="row.required" size="small" />
          <span v-else-if="row.hidden">—</span>
        </template>
      </el-table-column>
      <el-table-column label="唯一" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-if="!row.unsupported && !row.hidden && !row.subColumns" v-model="row.unique" size="small" />
          <span v-else-if="row.hidden">—</span>
        </template>
      </el-table-column>
      <el-table-column label="索引" width="70" align="center">
        <template #default="{ row }">
          <el-switch v-if="!row.unsupported && !row.hidden && !row.subColumns" v-model="row.indexed" size="small" />
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
  /** 组件类型（form-create rule type，如 colorPicker/elTransfer；供业务数据列表定制渲染） */
  componentType?: string
  /** 子表列映射（非空表示该 key 为子表字段，映射独立物理表 wf_biz_<formKey>_<key>） */
  subColumns?: ColumnConfigItem[]
  /** 子表传输方式：embedded（默认，内嵌 JSON 随主表往返）/ dedicated（独立子表 CRUD 接口） */
  subMode?: string
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
      return { columnType: 'VARCHAR', length: 255, scale: null }
    case 'cascader':
      // 级联选择器值为数组（级联路径）→ JSON（与后端对齐；VARCHAR 会触发 Java 序列化乱码）
      return { columnType: 'JSON', length: null, scale: null }
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
      // 签名图片 base64 → TEXT（TEXT 64KB 对 base64 签名图通常足够）
      return { columnType: 'TEXT', length: null, scale: null }
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

/** 不可映射组件（与后端 ColumnTypeMapper.UNSUPPORTED_COMPONENTS 对齐） */
const UNSUPPORTED_TYPES = ['divider', 'groupContainer', 'dataTable']
/** 子表组件：group/tableForm 映射独立物理表，子列由 children 递归提取 */
const SUBTABLE_TYPES = ['group', 'tableForm']

/** 列映射生成但不在业务数据列表展示的组件（隐藏列：仅参与 CRUD 写入） */
const HIDDEN_COMPONENT_TYPES = ['subForm', 'elTransfer', 'tree', 'elTreeSelect', 'fcEditor', 'cascader', 'signaturePad']

/** 从 LookupPicker fetch.action（/v1/biz-data/<formKey>）推断数据源表单 key */
function inferSourceFormKey(propsMap: Record<string, any>): string | undefined {
  const action = typeof propsMap.fetch?.action === 'string' ? propsMap.fetch.action : ''
  const m = action.match(/\/v1\/biz-data\/([a-zA-Z][a-zA-Z0-9_]*)/)
  return m ? m[1] : undefined
}

function isLayoutContainer(rule: any): boolean {
  return !rule?.field && Array.isArray(rule?.children)
}

/**
 * 提取子表组件的直接子规则：
 * - 布局容器（group 的 props.rule 或 tableForm 的 props.columns[].rule 内嵌 fcRow/col）：字段在 children
 * - group/subForm：内部字段在 props.rule
 * - tableForm：内部字段在 props.columns[].rule（每列一个 rule 数组）
 * 所有结构汇总返回，供子列收集统一穿透。
 */
function subTableChildren(rule: any): any[] {
  const out: any[] = []
  if (Array.isArray(rule?.children)) out.push(...rule.children)
  if (Array.isArray(rule?.props?.rule)) out.push(...rule.props.rule)
  const columns = rule?.props?.columns
  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (col && Array.isArray(col.rule)) out.push(...col.rule)
    }
  }
  return out
}

/** 递归提取子表子列（子表内不再支持嵌套子表，嵌套子表标记为不可映射） */
function collectSubFields(rules: any[], existingSub: ColumnConfigItem[] | undefined, out: ColumnConfigItem[]) {
  for (const rule of rules) {
    if (isLayoutContainer(rule)) {
      collectSubFields(subTableChildren(rule), existingSub, out)
      continue
    }
    const field = rule?.field as string | undefined
    if (!field) continue
    const type = rule?.type as string
    const label = (rule?.title as string) || field
    const existing = existingSub?.find(c => c.key === field)
    if (SUBTABLE_TYPES.includes(type) || type === 'subForm') {
      out.push({ key: field, label, columnType: '', length: null, scale: null, required: false, unique: false, indexed: false, unsupported: true })
      continue
    }
    // data-picker：子表内同样生成两列（id 列 + 隐藏冗余文本列），与主表一致
    if (type === 'dataPicker') {
      const propsMap = (rule?.props || {}) as Record<string, any>
      const existingText = existingSub?.find(c => c.key === field + '_text')
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
          sourceFormKey: propsMap.sourceFormKey,
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
    out.push({
      key: field,
      label,
      columnType: mapped.columnType,
      length: mapped.length,
      scale: mapped.scale,
      required: Boolean(rule?.validate?.some?.((v: any) => v.required)),
      unique: existing?.unique ?? false,
      indexed: existing?.indexed ?? false,
      existingType: existing?.columnType,
    })
  }
}

function collectFields(rules: any[], out: ColumnConfigItem[]) {
  for (const rule of rules) {
    if (isLayoutContainer(rule)) {
      collectFields(subTableChildren(rule), out)
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
    // 子表组件：提取子列映射到独立物理表 wf_biz_<formKey>_<field>
    if (SUBTABLE_TYPES.includes(type)) {
      const existing = props.existingColumns?.find(c => c.key === field)
      const subItems: ColumnConfigItem[] = []
      collectSubFields(subTableChildren(rule), existing?.subColumns, subItems)
      out.push({
        key: field,
        label,
        columnType: '',
        length: null,
        scale: null,
        required: false,
        unique: false,
        indexed: false,
        subColumns: subItems,
        subMode: existing?.subMode ?? 'embedded',
        // 无子列时视为不可映射，阻止发布
        unsupported: subItems.length === 0,
      })
      continue
    }
    // subForm：以 JSON 列落主表（与 upload 同策略），隐藏展示（仅参与 CRUD 写入）
    if (type === 'subForm') {
      const existing = props.existingColumns?.find(c => c.key === field)
      out.push({
        key: field,
        label,
        columnType: 'JSON',
        length: null,
        scale: null,
        required: Boolean(rule?.validate?.some?.((v: any) => v.required)),
        unique: false,
        indexed: false,
        hidden: true,
        existingType: existing?.columnType,
      })
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
        componentType: 'dataPicker',
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
        componentType: 'dataPickerText',
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
        componentType: 'LookupPicker',
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
      componentType: type,
      // 隐藏组件（子表单/穿梭框/树形/富文本/级联/签名）：JSON 列不进列表（仅参与 CRUD 写入）
      ...(HIDDEN_COMPONENT_TYPES.includes(type) ? { hidden: true } : {}),
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
  const items = editableItems.value
    .filter(i => !i.unsupported && (i.columnType || (i.subColumns && i.subColumns.length > 0)))
    .map(({ existingType, unsupported, ...rest }) => rest)
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
.subtable-config {
  padding: 8px 16px;
  background: #fafafa;
}
.subtable-config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.subtable-config-title {
  font-weight: 600;
  margin-right: 8px;
}
.subtable-config-label {
  font-size: 12px;
  color: #909399;
  margin-left: 16px;
}
.subtable-type {
  color: #e6a23c;
  font-weight: 600;
}
.subtable-empty {
  color: #c0c4cc;
  padding: 0 12px;
}
</style>
