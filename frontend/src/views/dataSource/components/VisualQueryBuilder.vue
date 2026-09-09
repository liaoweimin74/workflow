<script lang="ts">
// ----- 可视化查询构建组件 -----
// 属性：modelValue（VisualQueryConfig）、params（运行时参数）、tables（可选表列表）、tableFields（表名→字段名列表）、disabled
// 事件：update:modelValue、update:params
// 别名规则：主表固定 m；目标表取表名去 wf_(biz_)? 前缀首字母，冲突时追加序号（c→c1→c2）
// 选择列：由 主表字段多选 + 各 JOIN 目标表字段多选 驱动，效果写入 selectColumns（别名.字段），选择列区以 tag 展示可删除
// 筛选/排序：表名下拉（主表 + JOIN 目标表）+ 字段名下拉，组装为 别名.字段 存于 column
export interface JoinClause {
  alias: string
  targetTable: string
  joinType: string
  on: string
  columns: string[]
}
export interface WhereCondition {
  column: string
  op: string
  value: string
}
export interface OrderClause {
  column: string
  order: string
}
export interface VisualQueryConfig {
  mainTable: string
  mainAlias: string
  joins: JoinClause[]
  selectColumns: string[]
  selectColumnsInput: string
  where: WhereCondition[]
  orderBy: OrderClause[]
}

/** 主表别名固定值 */
export const MAIN_ALIAS = 'm'

/** 目标表别名：表名去 wf_(biz_)? 前缀取首字母小写，与 used 冲突时追加序号 */
export function deriveJoinAlias(targetTable: string, used: string[]): string {
  const base = (targetTable || '').replace(/^wf_(biz_)?/, '').trim()
  const first = base ? base[0].toLowerCase() : 'j'
  let alias = first
  let i = 1
  while (used.includes(alias)) {
    alias = first + i++
  }
  return alias
}

/** 组装 ON 条件：主表字段 = 目标表字段（均带别名限定） */
export function buildJoinOn(mainAlias: string, targetAlias: string, mainField: string, targetField: string): string {
  return `${mainAlias}.${mainField} = ${targetAlias}.${targetField}`
}

/** 解析 ON 条件字符串 → { mainField, targetField }。无别名限定/无法识别时默认左侧为主表字段 */
export function parseJoinOn(on: string, mainAlias: string): { mainField: string; targetField: string } {
  const eq = (on || '').split('=').map((s) => s.trim())
  if (eq.length !== 2) return { mainField: '', targetField: '' }
  const [left, right] = eq
  const bare = (side: string) => (side.includes('.') ? side.split('.').slice(1).join('.') : side)
  const rightAlias = right.includes('.') ? right.split('.')[0] : ''
  if (rightAlias === mainAlias) {
    // 右侧带主表别名 → 右侧为主表字段（兼容历史格式 c.id = m.customer_id）
    return { mainField: bare(right), targetField: bare(left) }
  }
  return { mainField: bare(left), targetField: bare(right) }
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    modelValue: VisualQueryConfig
    params?: string[]
    tables?: string[]
    tableFields?: Record<string, string[]>
    disabled?: boolean
  }>(),
  { params: () => [], tables: () => [], tableFields: () => ({}), disabled: false }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: VisualQueryConfig): void
  (e: 'update:params', value: string[]): void
}>()

const WHERE_OPS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN']

function deepClone(v: VisualQueryConfig): VisualQueryConfig {
  return JSON.parse(JSON.stringify(v)) as VisualQueryConfig
}

// 本地副本：props 变化时整体替换，本地修改后 emit 新对象
const local = ref<VisualQueryConfig>(deepClone(props.modelValue))
watch(
  () => props.modelValue,
  (v) => {
    local.value = deepClone(v)
  },
  { deep: true }
)

/** 每行 JOIN 的 on 字段下拉值（不入模型，仅 UI 编辑态） */
const rowFields = ref<{ mainField: string; targetField: string }[]>([])
function syncRowFields() {
  while (rowFields.value.length < local.value.joins.length) {
    const on = local.value.joins[rowFields.value.length].on || ''
    const parsed = parseJoinOn(on, MAIN_ALIAS)
    rowFields.value.push({ mainField: parsed.mainField, targetField: parsed.targetField })
  }
  while (rowFields.value.length > local.value.joins.length) {
    rowFields.value.pop()
  }
}
watch(
  () => local.value.joins,
  () => syncRowFields(),
  { deep: true, immediate: true }
)

// ----- 别名 ↔ 表名 映射（筛选/排序表名下拉用）-----
function aliasOfTable(table: string): string {
  if (!table) return ''
  if (table === local.value.mainTable) return MAIN_ALIAS
  const j = local.value.joins.find((jj) => jj.targetTable === table)
  return j ? j.alias : ''
}
function tableOfAlias(alias: string): string {
  if (!alias) return ''
  if (alias === MAIN_ALIAS) return local.value.mainTable
  const j = local.value.joins.find((jj) => jj.alias === alias)
  return j ? j.targetTable : ''
}
function splitColumn(column: string): { alias: string; field: string } {
  const i = (column || '').indexOf('.')
  if (i < 0) return { alias: '', field: column || '' }
  return { alias: column.slice(0, i), field: column.slice(i + 1) }
}
/** 表名下拉选项：主表 + 各 JOIN 目标表 */
const tableOptions = computed(() => {
  const opts: string[] = []
  if (local.value.mainTable) opts.push(local.value.mainTable)
  for (const j of local.value.joins) {
    if (j.targetTable && !opts.includes(j.targetTable)) opts.push(j.targetTable)
  }
  return opts
})

// ----- 筛选 UI 状态：每行 where 的 表名/字段名（column 即 别名.字段）-----
interface ColUI {
  table: string
  field: string
}
const whereUIs = ref<ColUI[]>([])
const orderUIs = ref<ColUI[]>([])
function syncColUIs(target: ColUI[], rows: Array<{ column: string }>) {
  while (target.length < rows.length) {
    const { alias, field } = splitColumn(rows[target.length].column)
    target.push({ table: tableOfAlias(alias), field })
  }
  while (target.length > rows.length) target.pop()
}
watch(
  () => local.value.where,
  () => syncColUIs(whereUIs.value, local.value.where),
  { deep: true, immediate: true }
)
watch(
  () => local.value.orderBy,
  () => syncColUIs(orderUIs.value, local.value.orderBy),
  { deep: true, immediate: true }
)

/** 已占用别名集合：主表别名 + 其他 JOIN 的别名 */
function usedAliases(skipIdx: number): string[] {
  const used = [MAIN_ALIAS]
  for (let i = 0; i < local.value.joins.length; i++) {
    if (i !== skipIdx && local.value.joins[i].targetTable) {
      used.push(local.value.joins[i].alias || deriveJoinAlias(local.value.joins[i].targetTable, used))
    }
  }
  return used
}

const newParamName = ref('')

function addJoin() {
  local.value.joins.push({ alias: '', targetTable: '', joinType: 'LEFT JOIN', on: '', columns: [] })
  syncRowFields()
  emitModel()
}
function removeJoin(idx: number) {
  local.value.joins.splice(idx, 1)
  syncRowFields()
  emitModel()
}
function addWhere() {
  local.value.where.push({ column: '', op: '=', value: '' })
  emitModel()
}
function removeWhere(idx: number) {
  local.value.where.splice(idx, 1)
  emitModel()
}
function addOrderBy() {
  local.value.orderBy.push({ column: '', order: 'ASC' })
  emitModel()
}
function removeOrderBy(idx: number) {
  local.value.orderBy.splice(idx, 1)
  emitModel()
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
function emitModel() {
  emit('update:modelValue', deepClone(local.value))
}

/** 目标表变化：重算别名并同步（主表别名固定 m） */
function onJoinTargetChange(idx: number) {
  const j = local.value.joins[idx]
  if (j.targetTable) {
    j.alias = deriveJoinAlias(j.targetTable, usedAliases(idx))
  }
  emitModel()
}

/** on 字段下拉变化：组装 ON 条件字符串（两者都有值才生成） */
function onJoinFieldChange(idx: number) {
  const j = local.value.joins[idx]
  const f = rowFields.value[idx]
  if (f && f.mainField && f.targetField) {
    j.alias = j.alias || deriveJoinAlias(j.targetTable, usedAliases(idx))
    j.on = buildJoinOn(MAIN_ALIAS, j.alias, f.mainField, f.targetField)
  } else {
    j.on = ''
  }
  emitModel()
}

/** 主表变化：emit 同步（供父组件联动字段候选） */
function onMainChange() {
  emitModel()
}

/** 主表字段候选：tableFields[mainTable] */
const mainFieldOptions = computed(() => props.tableFields[local.value.mainTable] || [])
/** 指定 JOIN 的目标表字段候选 */
function targetFieldOptions(targetTable: string): string[] {
  return props.tableFields[targetTable] || []
}
/** 筛选/排序字段候选：tableFields[表名] */
function fieldOptionsFor(table: string): string[] {
  return props.tableFields[table] || []
}

// ----- 选择列：别名.字段 前缀集合操作 -----
function colsWithPrefix(alias: string): string[] {
  const p = alias + '.'
  return local.value.selectColumns.filter((c) => c.startsWith(p)).map((c) => c.slice(p.length))
}
function setColsWithPrefix(alias: string, fields: string[]) {
  const p = alias + '.'
  const others = local.value.selectColumns.filter((c) => !c.startsWith(p))
  local.value.selectColumns = [...others, ...fields.map((f) => p + f)]
}
/** 主表字段多选选中集 */
const mainSelectedCols = computed(() => colsWithPrefix(MAIN_ALIAS))
function onMainColsChange(v: string[]) {
  setColsWithPrefix(MAIN_ALIAS, v)
  emitModel()
}
/** JOIN 目标表字段多选选中集（别名未生成时即时推导，不写回） */
function joinColsValue(idx: number): string[] {
  const j = local.value.joins[idx]
  if (!j || !j.targetTable) return []
  const alias = j.alias || deriveJoinAlias(j.targetTable, usedAliases(idx))
  return colsWithPrefix(alias)
}
function onJoinColsChange(idx: number, v: string[]) {
  const j = local.value.joins[idx]
  if (!j || !j.targetTable) return
  const alias = j.alias || deriveJoinAlias(j.targetTable, usedAliases(idx))
  if (!j.alias) j.alias = alias
  setColsWithPrefix(alias, v)
  emitModel()
}

// ----- 筛选/排序：表名/字段名变化 → 组装 column -----
function rebuildWhereColumn(idx: number) {
  const ui = whereUIs.value[idx]
  const w = local.value.where[idx]
  if (!ui || !w) return
  const alias = ui.table ? aliasOfTable(ui.table) : ''
  w.column = ui.field && alias ? `${alias}.${ui.field}` : ''
  emitModel()
}
function onWhereTableChange(idx: number, table: string) {
  const ui = whereUIs.value[idx]
  if (!ui) return
  ui.table = table
  ui.field = ''
  rebuildWhereColumn(idx)
}
function onWhereFieldChange(idx: number, field: string) {
  const ui = whereUIs.value[idx]
  if (!ui) return
  ui.field = field
  rebuildWhereColumn(idx)
}
function rebuildOrderColumn(idx: number) {
  const ui = orderUIs.value[idx]
  const o = local.value.orderBy[idx]
  if (!ui || !o) return
  const alias = ui.table ? aliasOfTable(ui.table) : ''
  o.column = ui.field && alias ? `${alias}.${ui.field}` : ''
  emitModel()
}
function onOrderTableChange(idx: number, table: string) {
  const ui = orderUIs.value[idx]
  if (!ui) return
  ui.table = table
  ui.field = ''
  rebuildOrderColumn(idx)
}
function onOrderFieldChange(idx: number, field: string) {
  const ui = orderUIs.value[idx]
  if (!ui) return
  ui.field = field
  rebuildOrderColumn(idx)
}

// 只读 SQL 预览：与后端 VisualSqlGenerator 输出一致（主表别名固定 m）
const previewSql = computed(() => {
  const v = local.value
  if (!v.mainTable) return ''
  const cols = v.selectColumns || []
  let sql = `SELECT ${cols.join(', ') || '*'}`
  sql += ` FROM ${v.mainTable} ${MAIN_ALIAS}`
  for (const j of v.joins) {
    if (j.targetTable && j.on) {
      const alias = j.alias || deriveJoinAlias(j.targetTable, usedAliases(0))
      sql += ` ${j.joinType} ${j.targetTable} ${alias} ON ${j.on}`
    }
  }
  sql += ` WHERE ${MAIN_ALIAS}.tenant_id = :tenantId`
  for (const w of v.where) {
    if (w.column && w.op) {
      sql += ` AND ${w.column} ${w.op} ?`
    }
  }
  if (v.orderBy.length > 0) {
    const parts = v.orderBy.filter((o) => o.column).map((o) => `${o.column} ${o.order || 'ASC'}`)
    if (parts.length > 0) sql += ` ORDER BY ${parts.join(', ')}`
  }
  return sql
})
</script>

<template>
  <div class="visual-query-builder">
    <el-form label-width="70px" label-position="left">
      <el-form-item label="主表">
        <div style="width: 100%; display: flex; gap: 8px; align-items: center">
          <el-select
            data-testid="vqb-main-table"
            v-model="local.mainTable"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入表名"
            :disabled="disabled"
            style="width: 180px"
            @change="onMainChange"
          >
            <el-option v-for="t in tables" :key="t" :label="t" :value="t" />
          </el-select>
          <el-select
            v-if="local.mainTable"
            data-testid="vqb-main-cols"
            :model-value="mainSelectedCols"
            multiple
            filterable
            allow-create
            default-first-option
            collapse-tags
            :max-collapse-tags="5"
            collapse-tags-tooltip
            placeholder="选择列（多选，加入选择列）"
            :disabled="disabled"
            class="vqb-main-cols"
            style="flex: 1; min-width: 0"
            @update:model-value="onMainColsChange"
          >
            <el-option v-for="c in mainFieldOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </div>
      </el-form-item>

      <el-form-item label="JOIN">
        <div style="width: 100%">
          <el-table :data="local.joins" size="small" border>
            <el-table-column label="关联" width="96" align="center">
              <template #default="{ row }">
                <el-select
                  :model-value="row.joinType"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(v: string) => { row.joinType = v; emitModel() }"
                >
                  <el-option label="左联" value="LEFT JOIN" />
                  <el-option label="内联" value="INNER JOIN" />
                  <el-option label="右联" value="RIGHT JOIN" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="目标表" min-width="100">
              <template #default="{ row, $index }">
                <el-select
                  :data-testid="`vqb-join-target-${$index}`"
                  v-model="row.targetTable"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="目标表"
                  :disabled="disabled"
                  style="width: 100%"
                  @change="onJoinTargetChange($index)"
                >
                  <el-option v-for="t in tables" :key="t" :label="t" :value="t" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="目标表字段（多选入列）" min-width="190">
              <template #default="{ row, $index }">
                <el-select
                  v-if="row.targetTable"
                  :data-testid="`vqb-join-cols-${$index}`"
                  :model-value="joinColsValue($index)"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  collapse-tags
                  :max-collapse-tags="2"
                  collapse-tags-tooltip
                  placeholder="目标表字段"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(v: string[]) => onJoinColsChange($index, v)"
                >
                  <el-option v-for="c in targetFieldOptions(row.targetTable)" :key="c" :label="c" :value="c" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="关联条件" min-width="220">
              <template #default="{ row, $index }">
                <div style="display: flex; gap: 4px; align-items: center">
                  <span style="color: #303133">当</span>
                  <el-select
                    :data-testid="`vqb-join-main-col-${$index}`"
                    v-model="rowFields[$index].mainField"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="主表字段"
                    :disabled="disabled"
                    style="flex: 1"
                    @change="onJoinFieldChange($index)"
                  >
                    <el-option v-for="c in mainFieldOptions" :key="c" :label="c" :value="c" />
                  </el-select>
                  <span style="color: #909399">=</span>
                  <el-select
                    :data-testid="`vqb-join-target-col-${$index}`"
                    v-model="rowFields[$index].targetField"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="目标表字段"
                    :disabled="disabled"
                    style="flex: 1"
                    @change="onJoinFieldChange($index)"
                  >
                    <el-option v-for="c in targetFieldOptions(row.targetTable)" :key="c" :label="c" :value="c" />
                  </el-select>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="" width="46" align="center">
              <template #default="{ $index }">
                <el-button :icon="Delete" circle text size="small" :disabled="disabled" @click="removeJoin($index)" />
              </template>
            </el-table-column>
          </el-table>
          <el-button
            data-testid="vqb-add-join"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            style="margin-top: 8px"
            :disabled="disabled"
            @click="addJoin"
          >
            添加关联
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="筛选">
        <div style="width: 100%">
          <el-table :data="local.where" size="small" border>
            <el-table-column label="表名" min-width="130">
              <template #default="{ $index }">
                <el-select
                  :data-testid="`vqb-where-table-${$index}`"
                  :model-value="whereUIs[$index]?.table"
                  filterable
                  placeholder="表名"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(t: string) => onWhereTableChange($index, t)"
                >
                  <el-option v-for="t in tableOptions" :key="t" :label="t" :value="t" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="字段名" min-width="120">
              <template #default="{ $index }">
                <el-select
                  :data-testid="`vqb-where-field-${$index}`"
                  :model-value="whereUIs[$index]?.field"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="字段名"
                  :disabled="disabled || !whereUIs[$index]?.table"
                  style="width: 100%"
                  @update:model-value="(f: string) => onWhereFieldChange($index, f)"
                >
                  <el-option v-for="c in fieldOptionsFor(whereUIs[$index]?.table)" :key="c" :label="c" :value="c" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="操作符" width="92" align="center">
              <template #default="{ row }">
                <el-select
                  :model-value="row.op"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(v: string) => { row.op = v; emitModel() }"
                >
                  <el-option v-for="op in WHERE_OPS" :key="op" :label="op" :value="op" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="值" min-width="130">
              <template #default="{ row, $index }">
                <el-input
                  :data-testid="`vqb-where-value-${$index}`"
                  :model-value="row.value"
                  placeholder="值"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(v: string) => { row.value = v; emitModel() }"
                />
              </template>
            </el-table-column>
            <el-table-column label="" width="46" align="center">
              <template #default="{ $index }">
                <el-button :icon="Delete" circle text size="small" :disabled="disabled" @click="removeWhere($index)" />
              </template>
            </el-table-column>
          </el-table>
          <el-button
            data-testid="vqb-add-where"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            style="margin-top: 8px"
            :disabled="disabled"
            @click="addWhere"
          >
            添加条件
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="排序">
        <div style="width: 100%">
          <el-table :data="local.orderBy" size="small" border>
            <el-table-column label="表名" min-width="130">
              <template #default="{ $index }">
                <el-select
                  :data-testid="`vqb-order-table-${$index}`"
                  :model-value="orderUIs[$index]?.table"
                  filterable
                  placeholder="表名"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(t: string) => onOrderTableChange($index, t)"
                >
                  <el-option v-for="t in tableOptions" :key="t" :label="t" :value="t" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="字段名" min-width="120">
              <template #default="{ $index }">
                <el-select
                  :data-testid="`vqb-order-field-${$index}`"
                  :model-value="orderUIs[$index]?.field"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="字段名"
                  :disabled="disabled || !orderUIs[$index]?.table"
                  style="width: 100%"
                  @update:model-value="(f: string) => onOrderFieldChange($index, f)"
                >
                  <el-option v-for="c in fieldOptionsFor(orderUIs[$index]?.table)" :key="c" :label="c" :value="c" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="排序方式" width="100" align="center">
              <template #default="{ row, $index }">
                <el-select
                  :data-testid="`vqb-order-dir-${$index}`"
                  :model-value="row.order"
                  :disabled="disabled"
                  style="width: 100%"
                  @update:model-value="(v: string) => { row.order = v; emitModel() }"
                >
                  <el-option label="升序" value="ASC" />
                  <el-option label="降序" value="DESC" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="" width="46" align="center">
              <template #default="{ $index }">
                <el-button :icon="Delete" circle text size="small" :disabled="disabled" @click="removeOrderBy($index)" />
              </template>
            </el-table-column>
          </el-table>
          <el-button
            data-testid="vqb-add-order"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            style="margin-top: 8px"
            :disabled="disabled"
            @click="addOrderBy"
          >
            添加排序
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="参数">
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
          <el-tag v-for="(p, idx) in params" :key="p" closable :disable-transitions="true" @close="removeParam(idx)">
            {{ p }}
          </el-tag>
          <el-input
            data-testid="vqb-param-input"
            v-model="newParamName"
            placeholder="参数名，回车添加"
            :disabled="disabled"
            @keyup.enter="addParam"
            style="width: 160px"
          />
        </div>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">SQL 预览（只读，保存时生成）</el-divider>
    <el-input
      data-testid="vqb-sql-preview"
      :model-value="previewSql"
      type="textarea"
      :rows="5"
      readonly
      style="font-family: var(--el-font-family-mono)"
    />
  </div>
</template>

<style scoped>
/* 表格 small 尺寸但字体统一为普通大小 */
.el-table {
  font-size: 14px;
}
/* 主表字段多选：单行显示，超出截断不折行 */
.vqb-main-cols :deep(.el-select__tags) {
  max-height: 32px;
  overflow: hidden;
  flex-wrap: nowrap;
}
.vqb-main-cols :deep(.el-select__tags-text) {
  white-space: nowrap;
}
</style>