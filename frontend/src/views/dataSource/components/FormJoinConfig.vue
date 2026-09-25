<script lang="ts">
// ----- FORM 数据源「关联查询配置」组件 -----
// 属性：modelValue（queryMode + config joins / sql query+columns+params）、mainFormKey（主表单列候选）、
//       targetFormOptions（targetFormKey 下拉候选）、disabled（只读锁定）
// 事件：update:modelValue
// config 模式：声明式 JOIN（targetFormKey / localField / foreignField / joinField / virtualKey / label / 能力标记）
// sql 模式：复用 SqlEditor（SQL 模板 + 列声明 + 参数白名单）
import type { ColumnConfigItem } from '@/api/bizData'

export interface JoinConfigItem {
  targetFormKey: string
  localField: string
  foreignField: string
  joinField: string
  virtualKey: string
  label: string
  sortable: boolean
  filterable: boolean
}

export interface FormJoinConfigValue {
  queryMode: 'none' | 'config' | 'sql'
  joins?: JoinConfigItem[]
  query?: string
  columns?: ColumnConfigItem[]
  params?: string[]
}

/** 默认关联条目（alias 由后端系统按组自动分配，前端不录入） */
export function emptyJoin(_index: number): JoinConfigItem {
  return {
    targetFormKey: '',
    localField: '',
    foreignField: '',
    joinField: '',
    virtualKey: '',
    label: '',
    sortable: true,
    filterable: true,
  }
}
</script>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Delete, Plus, View } from '@element-plus/icons-vue'
import { formApi } from '@/api/form'
import { dataSourceApi } from '@/api/data-source'
import SqlEditor from './SqlEditor.vue'
import { emptyJoin, type FormJoinConfigValue, type JoinConfigItem } from './FormJoinConfig.vue'
import { extractFormColumns, isSystemJoinTarget, SYSTEM_JOIN_TARGET_COLUMNS, targetFormColumns, type ColumnOption } from './joinColumns'

const props = withDefaults(
  defineProps<{
    modelValue: FormJoinConfigValue
    /** 主表单 key（localField 候选来源） */
    mainFormKey?: string
    /** targetFormKey 下拉候选（enabled 的 FORM 类型数据源） */
    targetFormOptions: { key: string; name: string }[]
    disabled?: boolean
  }>(),
  { mainFormKey: '', targetFormOptions: () => [], disabled: false }
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: FormJoinConfigValue): void
}>()

/** 本地配置副本（queryMode 结构差异经 computed 分发） */
const local = reactive<FormJoinConfigValue>({
  queryMode: props.modelValue?.queryMode || 'none',
  joins: props.modelValue?.joins?.length ? props.modelValue.joins.map((j) => ({ ...j })) : [],
  query: props.modelValue?.query || '',
  columns: props.modelValue?.columns?.length ? props.modelValue.columns.map((c) => ({ ...c })) : [],
  params: props.modelValue?.params?.length ? [...props.modelValue.params] : [],
})

/** 防止 props→local 同步触发 local→props 回写导致无限循环 */
let isSyncingFromProps = false

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    // v-model 回声守卫：sync() 后父组件把 emit 的对象原样存回（各段引用一致）。
    // 若不跳过，每次键入都会走到下方克隆重建 → 全部行对象换新 → row-key（WeakMap 按
    // 对象身份分配）全变 → el-table 整表 remount → 输入框敲一个字符即失焦。
    if (
      v.queryMode === local.queryMode &&
      v.joins === local.joins &&
      v.query === local.query &&
      v.columns === local.columns &&
      v.params === local.params
    ) {
      return
    }
    isSyncingFromProps = true
    local.queryMode = v.queryMode || 'none'
    local.joins = v.joins?.length ? v.joins.map((j) => ({ ...j })) : []
    local.query = v.query || ''
    local.columns = v.columns?.length ? v.columns.map((c) => ({ ...c })) : []
    local.params = v.params?.length ? [...v.params] : []
    Promise.resolve().then(() => { isSyncingFromProps = false })
  },
  { deep: true }
)

// el-table :data 绑定的 row 是 local.joins 项的直接引用，
// v-model 编辑属性时只修改对象字段，不触发 computed setter，
// 必须深监听 local.joins 变化后主动 sync 回父组件。
watch(
  () => local.joins,
  () => { if (!isSyncingFromProps) sync() },
  { deep: true },
)

/** 变更即同步回父组件。
 *
 * 双段并存：joins 与 query/columns/params 均为「草稿」，切模式时不清空非活跃段——
 * 用户在声明式 JOIN 与 SQL 模板之间的输入都保留，支持来回切换迭代修改；
 * 当前生效段由 queryMode 标注，保存时全部入库，运行时只读活跃段。 */
function sync() {
  emit('update:modelValue', {
    queryMode: local.queryMode,
    joins: local.joins,
    query: local.query,
    columns: local.columns,
    params: local.params,
  })
}

const queryMode = computed({
  get: () => local.queryMode,
  set: (v) => {
    local.queryMode = v
    if (v === 'config' && !local.joins.length) {
      local.joins = [emptyJoin(0)]
    }
    sync()
  },
})

const joins = computed<JoinConfigItem[]>({
  get: () => local.joins || [],
  set: (v) => {
    local.joins = v
    sync()
  },
})

const queryText = computed({
  get: () => local.query || '',
  set: (v) => {
    local.query = v
    sync()
  },
})

const declaredColumns = computed<ColumnConfigItem[]>({
  get: () => local.columns || [],
  set: (v) => {
    local.columns = v
    sync()
  },
})

const declaredParams = computed<string[]>({
  get: () => local.params || [],
  set: (v) => {
    local.params = v
    sync()
  },
})

// ==================== 字段候选（表单 schema 列） ====================

const mainColumns = ref<ColumnOption[]>([])
const targetColumnsMap = ref<Record<string, ColumnOption[]>>({})

/** 拉取表单字段候选：主表单用 extractFormColumns（业务字段），目标表单用 targetFormColumns（业务字段 + 系统列 id） */
async function loadColumns(formKey: string, extractor: (schema: string | null | undefined) => ColumnOption[] = extractFormColumns): Promise<ColumnOption[]> {
  if (!formKey) return []
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    return extractor((res.data as any)?.schema)
  } catch {
    return []
  }
}

watch(
  () => props.mainFormKey,
  async (key) => {
    mainColumns.value = await loadColumns(key || '')
  },
  { immediate: true }
)

/** 目标表列懒加载（foreignField/joinField 候选）：内建数据源 → 物理列映射；业务表单 → schema 业务字段 + 系统列 id */
async function ensureTargetColumns(targetKey: string) {
  if (!targetKey || targetColumnsMap.value[targetKey]) return
  if (isSystemJoinTarget(targetKey)) {
    // 内建数据源：物理列来自本地映射（与后端 join-target-catalog 对齐），不走表单 schema
    targetColumnsMap.value[targetKey] = SYSTEM_JOIN_TARGET_COLUMNS[targetKey] || []
    return
  }
  targetColumnsMap.value[targetKey] = await loadColumns(targetKey, targetFormColumns)
}

function targetColumnsOf(targetFormKey: string): ColumnOption[] {
  return targetColumnsMap.value[targetFormKey] || []
}

function onTargetFormChange(join: JoinConfigItem) {
  join.foreignField = ''
  join.joinField = ''
  void ensureTargetColumns(join.targetFormKey)
}

function addJoin() {
  joins.value = [...joins.value, emptyJoin(joins.value.length)]
}

function removeJoin(index: number) {
  joins.value = joins.value.filter((_, i) => i !== index)
}

// ==================== 关联行顺序 ====================
// 关联条目顺序由添加顺序决定（运行时按此顺序做 LEFT JOIN 分组与虚拟列追加）；
// 原拖拽排序功能已按需求移除，row-key 保留用于渲染稳定性

// 行身份键（WeakMap 不污染数据）：keyed patch 确定性收敛
const joinUidMap = new WeakMap<object, number>()
let joinUidSeq = 0
function joinRowKey(row: JoinConfigItem): string {
  if (!joinUidMap.has(row)) joinUidMap.set(row, ++joinUidSeq)
  return String(joinUidMap.get(row))
}

// ==================== JOIN SQL 预览 ====================

const previewSql = ref('')
const previewVisible = ref(false)
const previewing = ref(false)

const hasValidJoins = computed(() =>
  (local.joins ?? []).some((j) => j.targetFormKey && j.virtualKey))

async function doPreview() {
  if (!props.mainFormKey || !hasValidJoins.value) return
  previewing.value = true
  previewVisible.value = true
  try {
    const res = await dataSourceApi.previewJoinSql(props.mainFormKey, local.joins ?? [])
    previewSql.value = res.data.sql
  } catch {
    previewSql.value = '' // 拦截器已弹错误；清空旧 SQL 防止误导
  } finally {
    previewing.value = false
  }
}

/** 把预览 SQL 转入 SQL 模板模式继续微调（声明式配置保留为草稿，可随时切回） */
function convertPreviewToSql() {
  if (!previewSql.value) return
  local.query = previewSql.value
  queryMode.value = 'sql' // setter 内部会 sync()
  previewVisible.value = false
}

// 渲染时确保已有 targetFormKey 的列已加载
watch(
  () => joins.value.map((j) => j.targetFormKey),
  (keys) => keys.forEach((k) => k && void ensureTargetColumns(k)),
  { immediate: true }
)
</script>

<template>
  <div class="form-join-config">
    <el-radio-group v-model="queryMode" :disabled="disabled" style="margin-bottom: 12px">
      <el-radio-button value="none">单表查询</el-radio-button>
      <el-radio-button value="config">声明式 JOIN</el-radio-button>
      <el-radio-button value="sql">SQL 模板</el-radio-button>
    </el-radio-group>

    <!-- ===== config：声明式 JOIN 表格 ===== -->
    <template v-if="queryMode === 'config'">
      <div class="join-hint">
        <div>同连接条件的多个显示字段会合并为一条 LEFT JOIN；主表关联字段为多选（dataPicker 多选）时仅匹配首个关联值；目标表关联字段建议选择主键 id 或唯一列，避免结果集膨胀。</div>
        <div>流程定义 / 流程实例 / 待办任务为派生列数据源，不支持作为关联目标。</div>
      </div>
      <el-table :data="joins" :row-key="joinRowKey" size="small" border>
        <el-table-column label="显示名称" min-width="100">
          <template #default="{ row }">
            <el-input v-model="row.label" placeholder="如 客户名称" :disabled="disabled" />
          </template>
        </el-table-column>
        <el-table-column label="虚拟列标识" min-width="120">
          <template #default="{ row }">
            <el-input v-model="row.virtualKey" placeholder="如 customer_name" :disabled="disabled" />
          </template>
        </el-table-column>
        <el-table-column label="主表字段" min-width="110">
          <template #default="{ row }">
            <el-select
              v-model="row.localField"
              placeholder="主表关联字段"
              filterable
              allow-create
              style="width: 100%"
              :disabled="disabled"
            >
              <el-option v-for="c in mainColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="目标表" min-width="140">
          <template #default="{ row }">
            <el-select
              v-model="row.targetFormKey"
              placeholder="选择目标表（业务表单/内建数据源）"
              filterable
              style="width: 100%"
              :disabled="disabled"
              @change="onTargetFormChange(row)"
            >
              <el-option v-for="t in targetFormOptions" :key="t.key" :label="t.name" :value="t.key">
                <div class="target-option">
                  <span>{{ t.name }}</span>
                  <span class="target-option-key">{{ t.key }}</span>
                </div>
              </el-option>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="目标表关联字段" min-width="130">
          <template #default="{ row }">
            <el-select
              v-model="row.foreignField"
              placeholder="目标表关联字段"
              filterable
              allow-create
              style="width: 100%"
              :disabled="disabled"
            >
              <el-option v-for="c in targetColumnsOf(row.targetFormKey)" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="显示字段" min-width="100">
          <template #default="{ row }">
            <el-select
              v-model="row.joinField"
              placeholder="目标表显示字段"
              filterable
              allow-create
              style="width: 100%"
              :disabled="disabled"
            >
              <el-option v-for="c in targetColumnsOf(row.targetFormKey)" :key="c.key" :label="c.label || c.key" :value="c.key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="属性" width="150" align="center">
          <template #default="{ row }">
            <el-checkbox v-model="row.sortable" :disabled="disabled">排序</el-checkbox>
            <el-checkbox v-model="row.filterable" :disabled="disabled">筛选</el-checkbox>
          </template>
        </el-table-column>
        <el-table-column label="" width="52" align="center">
          <template #default="{ $index }">
            <el-button
              :icon="Delete"
              circle
              text
              :disabled="disabled"
              :aria-label="`删除关联 ${$index + 1}`"
              @click="removeJoin($index)"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-button
        v-if="!disabled"
        type="primary"
        plain
        size="small"
        :icon="Plus"
        style="margin-top: 8px"
        @click="addJoin"
      >
        新增关联
      </el-button>
      <el-button
        v-if="!disabled"
        class="preview-sql-btn"
        size="small"
        :icon="View"
        :loading="previewing"
        :disabled="!hasValidJoins"
        style="margin-top: 8px; margin-left: 8px"
        @click="doPreview"
      >
        预览 SQL
      </el-button>

      <div v-if="previewVisible" class="sql-preview">
        <div class="sql-preview-head">
          <span>生成 SQL（问号为参数占位，按序对应 params；业务表单目标会附带目标表租户过滤）</span>
          <el-button text size="small" @click="previewVisible = false">收起</el-button>
        </div>
        <pre class="sql-preview-body">{{ previewSql || '预览失败' }}</pre>
        <div class="sql-preview-foot">
          <span>预览为无筛选 / 无关键词 / 默认排序 / 不分页的基础语句；实际查询会按需追加筛选、排序与分页。</span>
          <el-button v-if="previewSql && !disabled" type="primary" link size="small" @click="convertPreviewToSql">
            转为 SQL 模板继续编辑 →
          </el-button>
        </div>
      </div>
    </template>

    <!-- ===== sql：SQL 模板 + 列声明 + 参数白名单 ===== -->
    <template v-else-if="queryMode === 'sql'">
      <SqlEditor
        v-model="queryText"
        v-model:columns="declaredColumns"
        v-model:params="declaredParams"
        :disabled="disabled"
      />
    </template>

    <div v-else class="join-empty-hint">
      单表查询：仅返回绑定表单自身数据。配置 JOIN 后可按关联字段展示、排序、筛选。
    </div>
  </div>
</template>

<style scoped>
/* 表格 small 尺寸但字体统一为普通大小（与 SqlEditor 列声明表格一致） */
.el-table {
  font-size: 14px;
}
.join-empty-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 8px 0;
}
.join-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 8px;
}
.target-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.target-option-key {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-family: var(--el-font-family-mono, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
}
.sql-preview {
  margin-top: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  padding: 8px;
}
.sql-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.sql-preview-body {
  margin: 0;
  max-height: 200px;
  overflow: auto;
  font-family: var(--el-font-family-mono, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.sql-preview-foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
