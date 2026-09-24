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
import { nextTick, onMounted, ref, watch } from 'vue'
import { Delete, Plus, Rank } from '@element-plus/icons-vue'
import { moveItem, useTableDragSort } from '@/composables/useTableDragSort'

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

// ==================== 列声明拖拽排序 ====================
// 拖拽调整列顺序：params.columns 数组顺序即字段元数据展示顺序
const colsTableRef = ref<HTMLElement>()

// 行身份键（WeakMap 不污染数据）：Sortable 外部移动 DOM 后 keyed patch 确定性收敛
const colUidMap = new WeakMap<object, number>()
let colUidSeq = 0
function colRowKey(row: ColumnConfigItem): string {
  if (!colUidMap.has(row)) colUidMap.set(row, ++colUidSeq)
  return String(colUidMap.get(row))
}

function onColReorder(oldIndex: number, newIndex: number) {
  // 替换引用而非就地 splice：el-table 行重渲染依赖 data 引用变化
  const next = [...localCols.value]
  moveItem(next, oldIndex, newIndex)
  localCols.value = next
  emitColumns()
}

const { init: initColSort } = useTableDragSort({
  getTbody: () => colsTableRef.value?.querySelector('.el-table__body-wrapper tbody'),
  handle: '.drag-handle',
  disabled: () => props.disabled,
  onReorder: onColReorder,
})

onMounted(() => nextTick(() => initColSort()))
// 从 SQL 重新解析/父级全量替换后行数变化，tbody 容器不变无需重绑；
// 但 disabled 从 true → false（只读切换）时需补绑
watch(
  () => props.disabled,
  (v) => {
    if (!v) nextTick(() => initColSort())
  }
)
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
        <div ref="colsTableRef" style="width: 100%">
          <el-table :data="localCols" :row-key="colRowKey" size="small" border>
            <el-table-column label="" width="36" align="center" class-name="drag-col">
              <template #default>
                <el-icon class="drag-handle" title="拖拽排序"><Rank /></el-icon>
              </template>
            </el-table-column>
            <el-table-column label="字段名" min-width="130">
              <template #default="{ row, $index }">
                <el-input
                  :data-testid="`sqleditor-col-key-${$index}`"
                  v-model="row.key"
                  placeholder="字段名"
                  :disabled="disabled"
                  @input="emitColumns"
                />
              </template>
            </el-table-column>
            <el-table-column label="列名" min-width="130">
              <template #default="{ row }">
                <el-input
                  v-model="row.label"
                  placeholder="列名"
                  :disabled="disabled"
                  @input="emitColumns"
                />
              </template>
            </el-table-column>
            <el-table-column label="类型" width="170">
              <template #default="{ row }">
                <el-select v-model="row.columnType" :disabled="disabled" style="width: 100%" @change="emitColumns">
                  <el-option v-for="t in COLUMN_TYPES" :key="t" :label="t" :value="t" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="属性" width="150" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.sortable" :disabled="disabled" @change="emitColumns">排序</el-checkbox>
                <el-checkbox v-model="row.filterable" :disabled="disabled" @change="emitColumns">筛选</el-checkbox>
              </template>
            </el-table-column>
            <el-table-column label="" width="52" align="center">
              <template #default="{ $index }">
                <el-button
                  :data-testid="`sqleditor-del-column-${$index}`"
                  :icon="Delete"
                  circle
                  text
                  :disabled="disabled"
                  @click="removeColumn($index)"
                />
              </template>
            </el-table-column>
          </el-table>
          <el-button
            data-testid="sqleditor-add-column"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            style="margin-top: 8px"
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

<style scoped>
/* 表格 small 尺寸但字体统一为普通大小 */
.el-table {
  font-size: 14px;
}
/* 拖拽把手列：抓手光标 + 悬停高亮，提示可拖拽排序 */
.drag-handle {
  cursor: grab;
  color: var(--el-text-color-placeholder);
  transition: color 0.2s;
}
.drag-handle:hover {
  color: var(--el-color-primary);
}
.drag-handle:active {
  cursor: grabbing;
}
.drag-col .cell {
  padding-left: 4px;
  padding-right: 4px;
}
</style>