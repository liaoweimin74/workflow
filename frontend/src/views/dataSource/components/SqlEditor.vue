<script lang="ts">
// ----- SQL 编辑器组件 -----
// 属性：modelValue（SQL 文本）、columns（列声明）、params（运行时参数）、disabled（只读锁定）
// 事件：update:modelValue、update:columns、update:params
import type { ColumnConfigItem } from '@/api/bizData'

export const COLUMN_TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DECIMAL', 'DATETIME', 'DATE', 'TEXT', 'TINYINT'] as const

export function emptyColumn(): ColumnConfigItem {
  return {
    key: '',
    label: '',
    columnType: 'VARCHAR',
    length: null,
    scale: null,
    required: false,
    unique: false,
    indexed: false,
    sortable: false,
    filterable: false,
  }
}

function indexOfKeyword(s: string, kw: string, from = 0): number {
  const lower = s.toLowerCase()
  const k = kw.toLowerCase()
  let i = lower.indexOf(k, from)
  while (i >= 0) {
    const beforeOk = i === 0 || !/[a-z0-9]/.test(lower.charAt(i - 1))
    const end = i + k.length
    const afterOk = end >= lower.length || !/[a-z0-9]/.test(lower.charAt(end))
    if (beforeOk && afterOk) return i
    i = lower.indexOf(k, i + 1)
  }
  return -1
}

/** 与后端 SqlTemplateEngine.extractSelectOutputs 对齐：解析 SELECT 输出列名（保留出现顺序、去重） */
export function parseSelectColumns(sql: string): string[] {
  const out: string[] = []
  const sel = indexOfKeyword(sql, 'SELECT')
  if (sel < 0) return out
  const from = indexOfKeyword(sql, 'FROM', sel + 6)
  if (from < 0) return out
  const list = sql.substring(sel + 6, from)
  for (const part of list.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (trimmed === '*' || trimmed.endsWith('.*')) {
      continue
    }
    let name: string
    const as = indexOfKeyword(trimmed, 'AS')
    if (as >= 0) {
      const after = trimmed.substring(as + 2).trim()
      name = after.split(/[\s,]+/)[0]
    } else {
      const dot = trimmed.lastIndexOf('.')
      name = (dot >= 0 ? trimmed.substring(dot + 1) : trimmed).trim()
    }
    name = name.replace(/`/g, '').replace(/"/g, '')
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    columns: ColumnConfigItem[]
    params?: string[]
    disabled?: boolean
  }>(),
  { params: () => [], disabled: false }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:columns', value: ColumnConfigItem[]): void
  (e: 'update:params', value: string[]): void
}>()

// 列声明本地副本：props 变化时整体替换，本地修改后 emit 新数组
const localCols = ref<ColumnConfigItem[]>(props.columns.map((c) => ({ ...c })))
watch(
  () => props.columns,
  (v) => {
    localCols.value = v.map((c) => ({ ...c }))
  },
  { deep: true }
)

const newParamName = ref('')

function emitColumns() {
  emit(
    'update:columns',
    localCols.value.map((c) => ({ ...c }))
  )
}
function addColumn() {
  localCols.value.push(emptyColumn())
  emitColumns()
}
function removeColumn(idx: number) {
  localCols.value.splice(idx, 1)
  emitColumns()
}
function addParam() {
  const name = newParamName.value.trim()
  if (name && !props.params.includes(name)) {
    emit('update:params', [...props.params, name])
    newParamName.value = ''
  }
}
function removeParam(idx: number) {
  const next = [...props.params]
  next.splice(idx, 1)
  emit('update:params', next)
}

/** 「从 SQL 解析列」：解析 SELECT 输出列生成列声明 */
function parseFromSql() {
  const keys = parseSelectColumns(props.modelValue)
  const next = keys.map((key) => ({ ...emptyColumn(), key, label: key }))
  if (next.length > 0) {
    emit('update:columns', next)
  }
}
</script>

<template>
  <div class="sql-editor">
    <el-form label-width="70px" label-position="left">
      <el-form-item label="SQL 模板">
        <el-input
          data-testid="sqleditor-sql"
          :model-value="modelValue"
          type="textarea"
          :rows="10"
          placeholder="SELECT ... FROM wf_biz_&lt;formKey&gt; WHERE tenant_id = :tenantId"
          style="font-family: monospace"
          :disabled="disabled"
          @input="emit('update:modelValue', $event as string)"
        />
        <div style="margin-top: 8px">
          <el-button
            data-testid="sqleditor-parse-sql"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            :disabled="disabled"
            @click="parseFromSql"
          >
            从 SQL 解析列
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="列声明">
        <div style="width: 100%">
          <div
            v-for="(col, idx) in localCols"
            :key="idx"
            class="sql-editor-column-row"
            style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center"
          >
            <el-input
              :data-testid="`sqleditor-col-key-${idx}`"
              v-model="col.key"
              placeholder="字段名"
              :disabled="disabled"
              @input="emitColumns"
              style="width: 130px"
            />
            <el-input
              v-model="col.label"
              placeholder="列名"
              :disabled="disabled"
              @input="emitColumns"
              style="width: 130px"
            />
            <el-select v-model="col.columnType" :disabled="disabled" @change="emitColumns" style="width: 120px">
              <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
            <el-checkbox v-model="col.sortable" :disabled="disabled" @change="emitColumns">排序</el-checkbox>
            <el-checkbox v-model="col.filterable" :disabled="disabled" @change="emitColumns">筛选</el-checkbox>
            <el-button
              :data-testid="`sqleditor-del-column-${idx}`"
              :icon="Delete"
              circle
              size="small"
              :disabled="disabled"
              @click="removeColumn(idx)"
            />
          </div>
          <el-button
            data-testid="sqleditor-add-column"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            :disabled="disabled"
            @click="addColumn"
          >
            添加列
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="参数">
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
          <el-tag v-for="(p, idx) in params" :key="p" closable :disable-transitions="true" @close="removeParam(idx)">
            {{ p }}
          </el-tag>
          <el-input
            data-testid="sqleditor-param-input"
            v-model="newParamName"
            placeholder="参数名，回车添加"
            :disabled="disabled"
            @keyup.enter="addParam"
            style="width: 160px"
          />
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>