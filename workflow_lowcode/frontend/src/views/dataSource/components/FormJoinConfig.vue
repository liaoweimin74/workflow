<script lang="ts">
// ----- FORM 数据源「关联查询配置」组件 -----
// 属性：modelValue（queryMode + config joins / sql query+columns+params）、mainFormKey（主表单列候选）、
//       targetFormOptions（targetFormKey 下拉候选）、disabled（只读锁定）
// 事件：update:modelValue
// config 模式：声明式 JOIN（targetFormKey / localField / foreignField / joinField / virtualKey / label / 能力标记）
// sql 模式：复用 SqlEditor（SQL 模板 + 列声明 + 参数白名单）
import type { ColumnConfigItem } from '@/api/bizData'

export interface JoinConfigItem {
  alias: string
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

/** 默认关联条目（alias 自动编号，可在编辑中改名） */
export function emptyJoin(index: number): JoinConfigItem {
  return {
    alias: `j${index + 1}`,
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
import { Delete, Plus } from '@element-plus/icons-vue'
import { formApi } from '@/api/form'
import SqlEditor from './SqlEditor.vue'
import { emptyJoin, type FormJoinConfigValue, type JoinConfigItem } from './FormJoinConfig.vue'

interface ColumnOption {
  key: string
  label: string
}

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

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    local.queryMode = v.queryMode || 'none'
    local.joins = v.joins?.length ? v.joins.map((j) => ({ ...j })) : []
    local.query = v.query || ''
    local.columns = v.columns?.length ? v.columns.map((c) => ({ ...c })) : []
    local.params = v.params?.length ? [...v.params] : []
  },
  { deep: true }
)

/** 变更即同步回父组件 */
function sync() {
  emit('update:modelValue', {
    queryMode: local.queryMode,
    joins: local.queryMode === 'config' ? local.joins : undefined,
    query: local.queryMode === 'sql' ? local.query : undefined,
    columns: local.queryMode === 'sql' ? local.columns : undefined,
    params: local.queryMode === 'sql' ? local.params : undefined,
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

/** 从表单 schema rule 提取字段候选（field → title） */
function extractFormColumns(schema: string | null | undefined): ColumnOption[] {
  if (!schema) return []
  try {
    const parsed = JSON.parse(schema)
    const rules = Array.isArray(parsed) ? parsed : (parsed.rule || [])
    const out: ColumnOption[] = []
    for (const r of rules) {
      if (r && r.field) {
        out.push({ key: String(r.field), label: r.title || String(r.field) })
      }
    }
    return out
  } catch {
    return []
  }
}

async function loadColumns(formKey: string): Promise<ColumnOption[]> {
  if (!formKey) return []
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    return extractFormColumns((res.data as any)?.schema)
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

/** 目标表单列懒加载（foreignField/joinField 候选） */
async function ensureTargetColumns(targetFormKey: string) {
  if (!targetFormKey || targetColumnsMap.value[targetFormKey]) return
  targetColumnsMap.value[targetFormKey] = await loadColumns(targetFormKey)
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

    <!-- ===== config：声明式 JOIN 列表 ===== -->
    <template v-if="queryMode === 'config'">
      <div v-for="(join, i) in joins" :key="i" class="join-card">
        <div class="join-card-header">
          <span class="join-card-title">关联 {{ i + 1 }}</span>
          <el-button
            v-if="!disabled"
            text
            type="danger"
            :icon="Delete"
            size="small"
            :aria-label="`删除关联 ${i + 1}`"
            @click="removeJoin(i)"
          />
        </div>
        <el-form label-width="auto" label-position="top" class="join-form">
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="目标表单">
                <el-select
                  v-model="join.targetFormKey"
                  placeholder="选择关联业务表单"
                  filterable
                  style="width: 100%"
                  :disabled="disabled"
                  @change="onTargetFormChange(join)"
                >
                  <el-option v-for="t in targetFormOptions" :key="t.key" :label="t.name" :value="t.key" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="主表字段 (localField)">
                <el-select
                  v-model="join.localField"
                  placeholder="主表关联字段"
                  filterable
                  allow-create
                  style="width: 100%"
                  :disabled="disabled"
                >
                  <el-option v-for="c in mainColumns" :key="c.key" :label="c.label || c.key" :value="c.key" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="目标表关联字段 (foreignField)">
                <el-select
                  v-model="join.foreignField"
                  placeholder="目标表关联字段"
                  filterable
                  allow-create
                  style="width: 100%"
                  :disabled="disabled"
                >
                  <el-option v-for="c in targetColumnsOf(join.targetFormKey)" :key="c.key" :label="c.label || c.key" :value="c.key" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="显示字段 (joinField)">
                <el-select
                  v-model="join.joinField"
                  placeholder="目标表显示字段"
                  filterable
                  allow-create
                  style="width: 100%"
                  :disabled="disabled"
                >
                  <el-option v-for="c in targetColumnsOf(join.targetFormKey)" :key="c.key" :label="c.label || c.key" :value="c.key" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="虚拟列标识 (virtualKey)">
                <el-input v-model="join.virtualKey" placeholder="如 customer_name" :disabled="disabled" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="显示名称 (label)">
                <el-input v-model="join.label" placeholder="如 客户名称" :disabled="disabled" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="6">
              <el-form-item label="别名 (alias)">
                <el-input v-model="join.alias" placeholder="如 j1" :disabled="disabled" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="可排序">
                <el-switch v-model="join.sortable" :disabled="disabled" />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="可筛选">
                <el-switch v-model="join.filterable" :disabled="disabled" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </div>
      <el-button v-if="!disabled" size="small" :icon="Plus" type="primary" plain @click="addJoin">
        新增关联
      </el-button>
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
.join-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px 12px 0;
  margin-bottom: 10px;
}
.join-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.join-card-title {
  font-weight: 600;
  font-size: 13px;
}
.join-form {
  margin-top: 0;
}
.join-empty-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 8px 0;
}
</style>
