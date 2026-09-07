<script lang="ts">
// ----- 可视化查询构建组件 -----
// 属性：modelValue（VisualQueryConfig）、params（运行时参数）、tables（可选表列表）、disabled（只读锁定）
// 事件：update:modelValue、update:params
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
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    modelValue: VisualQueryConfig
    params?: string[]
    tables?: string[]
    disabled?: boolean
  }>(),
  { params: () => [], tables: () => [], disabled: false }
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

const newParamName = ref('')

function addJoin() {
  local.value.joins.push({ alias: '', targetTable: '', joinType: 'LEFT JOIN', on: '', columns: [] })
  emitModel()
}
function removeJoin(idx: number) {
  local.value.joins.splice(idx, 1)
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
function parseSelectColumns() {
  local.value.selectColumns = (local.value.selectColumnsInput || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s)
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

// 只读 SQL 预览：与后端 VisualSqlGenerator 输出一致（列名来自 selectColumnsInput 实时解析）
const previewSql = computed(() => {
  const v = local.value
  if (!v.mainTable) return ''
  const cols = (v.selectColumnsInput || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s)
  let sql = `SELECT ${cols.join(', ') || '*'}`
  sql += ` FROM ${v.mainTable} ${v.mainAlias || 'm'}`
  for (const j of v.joins) {
    if (j.targetTable && j.on) {
      sql += ` ${j.joinType} ${j.targetTable} ${j.alias} ON ${j.on}`
    }
  }
  sql += ` WHERE ${v.mainAlias || 'm'}.tenant_id = :tenantId`
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
        <el-select
          data-testid="vqb-main-table"
          v-model="local.mainTable"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入表名"
          :disabled="disabled"
          style="width: 240px"
        >
          <el-option v-for="t in tables" :key="t" :label="t" :value="t" />
        </el-select>
        <el-input
          data-testid="vqb-main-alias"
          v-model="local.mainAlias"
          placeholder="别名"
          :disabled="disabled"
          style="width: 100px; margin-left: 8px"
        />
      </el-form-item>

      <el-form-item label="JOIN">
        <div style="width: 100%">
          <div
            v-for="(j, idx) in local.joins"
            :key="idx"
            style="
              display: flex;
              gap: 8px;
              margin-bottom: 8px;
              padding: 8px;
              border: 1px solid var(--el-border-color);
              border-radius: 4px;
              align-items: center;
            "
          >
            <el-select v-model="j.joinType" :disabled="disabled" style="width: 110px">
              <el-option label="LEFT JOIN" value="LEFT JOIN" />
              <el-option label="INNER JOIN" value="INNER JOIN" />
              <el-option label="RIGHT JOIN" value="RIGHT JOIN" />
            </el-select>
            <el-input v-model="j.targetTable" placeholder="目标表" :disabled="disabled" style="width: 140px" />
            <el-input v-model="j.alias" placeholder="别名" :disabled="disabled" style="width: 70px" />
            <el-input v-model="j.on" placeholder="ON 条件，如 c.id = m.customer_id" :disabled="disabled" />
            <el-button :icon="Delete" circle size="small" :disabled="disabled" @click="removeJoin(idx)" />
          </div>
          <el-button
            data-testid="vqb-add-join"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            :disabled="disabled"
            @click="addJoin"
          >
            添加关联
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="选择列">
        <el-input
          data-testid="vqb-select-columns"
          v-model="local.selectColumnsInput"
          type="textarea"
          :rows="2"
          placeholder="逗号分隔，如 m.order_no, c.name AS customer_name"
          :disabled="disabled"
          @blur="parseSelectColumns"
        />
      </el-form-item>

      <el-form-item label="筛选">
        <div style="width: 100%">
          <div
            v-for="(w, idx) in local.where"
            :key="idx"
            style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center"
          >
            <el-input v-model="w.column" placeholder="列名，如 m.status" :disabled="disabled" style="width: 160px" />
            <el-select v-model="w.op" :disabled="disabled" style="width: 90px">
              <el-option v-for="op in WHERE_OPS" :key="op" :label="op" :value="op" />
            </el-select>
            <el-input v-model="w.value" placeholder="值，留空用 :param" :disabled="disabled" style="width: 180px" />
            <el-button :icon="Delete" circle size="small" :disabled="disabled" @click="removeWhere(idx)" />
          </div>
          <el-button
            data-testid="vqb-add-where"
            type="primary"
            plain
            size="small"
            :icon="Plus"
            :disabled="disabled"
            @click="addWhere"
          >
            添加条件
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="排序">
        <div style="width: 100%">
          <div
            v-for="(o, idx) in local.orderBy"
            :key="idx"
            style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center"
          >
            <el-input v-model="o.column" placeholder="列名，如 m.created_at" :disabled="disabled" style="width: 200px" />
            <el-select v-model="o.order" :disabled="disabled" style="width: 90px">
              <el-option label="ASC" value="ASC" />
              <el-option label="DESC" value="DESC" />
            </el-select>
            <el-button :icon="Delete" circle size="small" :disabled="disabled" @click="removeOrderBy(idx)" />
          </div>
          <el-button
            data-testid="vqb-add-order"
            type="primary"
            plain
            size="small"
            :icon="Plus"
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