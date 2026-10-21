<template>
  <el-dialog
    :model-value="modelValue"
    :title="permission ? `编辑权限对象 — ${permission.name}` : '新建权限对象'"
    width="1080px"
    top="4vh"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert type="info" :closable="false" show-icon class="mb-3">
      <template #title>一个权限对象 = 条件（组内 AND）+ 关联数据源</template>
      <div class="text-xs leading-5">
        条件是「能看到哪些行」的圈定：同一角色命中多个对象时取并集（对象间 OR，任一对象满足即可见），
        不写条件 = 全部行。数据权限就是查看权限：受控数据源上，角色未被授权就一行都看不见，
        也谈不上修改、删除（看即能操作）。
      </div>
    </el-alert>

    <el-form label-width="90px" label-position="left">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="名称" required>
            <el-input v-model="form.name" data-testid="rp-name" maxlength="100" show-word-limit placeholder="例如：销售本人数据" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="备注">
            <el-input v-model="form.remark" data-testid="rp-remark" maxlength="255" placeholder="用途说明（可选）" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="关联数据源" required>
        <el-select
          v-model="form.dataSourceIds"
          data-testid="rp-sources"
          multiple
          filterable
          placeholder="仅启用中的 FORM / SQL 数据源"
          style="width: 100%"
          @change="loadColumns"
        >
          <el-option v-for="source in sourceOptions" :key="source.id" :label="`${source.name}（${source.type}）`" :value="source.id" />
        </el-select>
        <div v-if="unavailableSourceIds.length" class="text-xs text-orange-500 leading-5">
          该对象还关联着已停用或不可用的数据源：{{ unavailableSourceIds.join('、') }}，保存前请移除。
        </div>
        <div v-else class="text-xs text-gray-400 leading-5">
          条件按列名施加到每个关联数据源，下方「列名」只列出这些源都能筛出的列（交集）。
        </div>
      </el-form-item>
    </el-form>

    <!-- ==================== 条件 ==================== -->
    <div class="flex items-center justify-between mb-2">
      <div>
        <span class="font-medium">过滤条件</span>
        <span class="text-xs text-gray-400 ml-2">组内 AND（全部满足）；与客户端筛选叠加取交集</span>
      </div>
      <el-button size="small" data-testid="rp-add-condition" @click="addCondition">添加条件</el-button>
    </div>
    <el-table :data="form.conditions" size="small" empty-text="无条件 = 全部行（被授权的角色看得见该源的所有数据）">
      <el-table-column label="列名" width="200">
        <template #default="{ row }">
          <el-select
            v-model="row.column"
            data-testid="rp-condition-column"
            filterable
            allow-create
            default-first-option
            :placeholder="columnPlaceholder"
            style="width: 100%"
          >
            <el-option v-for="column in columnOptions" :key="column.key" :label="`${column.label}（${column.key}）`" :value="column.key" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="运算符" width="150">
        <template #default="{ row }">
          <el-select v-model="row.op" data-testid="rp-condition-op" style="width: 100%">
            <el-option v-for="option in OP_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="取值" min-width="320">
        <template #default="{ row }">
          <span v-if="row.op === 'isempty' || row.op === 'isnotempty'" class="text-gray-400">不需要取值</span>
          <div v-else-if="row.op === 'range'" class="rv-range">
            <div class="rv-field">
              <el-input v-model="row.value" class="rv-input" data-testid="rp-range-start" placeholder="起点" />
              <VarInsertPopover @pick="insert(row, 'value', $event)" />
            </div>
            <span class="text-gray-400">~</span>
            <div class="rv-field">
              <el-input v-model="row.rangeEnd" class="rv-input" data-testid="rp-range-end" placeholder="终点" />
              <VarInsertPopover @pick="insert(row, 'rangeEnd', $event)" />
            </div>
          </div>
          <div v-else class="rv-field">
            <el-input
              v-model="row.value"
              class="rv-input"
              data-testid="rp-condition-value"
              :placeholder="row.op === 'in' ? '多个值用逗号分隔，例如 3, {orgIdSubtree}' : '固定值，或点右侧 { } 插入变量'"
            />
            <VarInsertPopover @pick="insert(row, 'value', $event)" />
          </div>
        </template>
      </el-table-column>
      <el-table-column width="60" align="right">
        <template #default="{ $index }">
          <el-button link type="danger" size="small" @click="form.conditions.splice($index, 1)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="var-legend">
      <span class="text-xs text-gray-400">
        取值可写字面量，也可点输入框右侧 <code>{ }</code> 插入变量（变量可与字面量拼接，如 LIKE 配 <code>{orgId}/%</code>）：
      </span>
      <span v-for="item in VARIABLE_LEGEND" :key="item.token" class="text-xs text-gray-500">
        <code>{{ item.token }}</code> {{ item.detail }}
      </span>
    </div>

    <!-- ==================== 授权（只读提示） ==================== -->
    <div class="text-xs text-gray-500 leading-5 mt-3">
      主体授权（哪些角色能通过本对象看见行）在「角色管理 → 数据权限」中维护；
      这里改条件或换数据源都不会动已有授权。
      <span v-if="roleGrantCount" class="text-gray-400">当前已有 {{ roleGrantCount }} 条角色授权。</span>
      <span v-else class="text-orange-500" data-testid="rp-no-grant-warning">
        当前没有任何角色授权：本对象关联的数据源将非管理员都看不见。
      </span>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" data-testid="rp-save" :loading="submitting" @click="submit">
        {{ permission ? '保存修改' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: 'RowPermissionEditor' })

import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import VarInsertPopover from './VarInsertPopover.vue'
import { rowPermissionApi, type RowPermissionColumnOption, type RowPermissionDTO } from '@/api/rowPermission'
import type { DataSourceDTO } from '@/api/data-source'
import {
  OP_OPTIONS,
  VARIABLE_OPTIONS,
  emptyConditionRow,
  fromApiConditions,
  toApiConditions,
  validateConditionRows,
  type ConditionEditorRow,
} from './conditionModel'

const props = defineProps<{
  modelValue: boolean
  permission: RowPermissionDTO | null
  dataSources: DataSourceDTO[]
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  saved: []
}>()

const form = ref<{
  name: string
  remark: string
  dataSourceIds: string[]
  conditions: ConditionEditorRow[]
}>({
  name: '',
  remark: '',
  dataSourceIds: [],
  conditions: [emptyConditionRow()],
})

const submitting = ref(false)
const roleGrantCount = ref(0)
const columnOptions = ref<RowPermissionColumnOption[]>([])
const candidatesFailed = ref(false)

const VARIABLE_LEGEND = VARIABLE_OPTIONS.map((item) => ({
  token: `{${item.name}}`,
  detail: item.list ? `${item.detail}；须独占整个取值` : item.detail,
}))

/** { } 弹层选中变量后写进取值：IN 是逗号分隔的列表，变量作为新的一项追加，其余运算符直接拼在光标位尾 */
function insert(row: ConditionEditorRow, field: 'value' | 'rangeEnd', token: string): void {
  const current = row[field]
  const needsSeparator = row.op === 'in' && current.trim().length > 0 && !current.trim().endsWith(',')
  row[field] = needsSeparator ? `${current}, ${token}` : `${current}${token}`
}

const columnPlaceholder = computed(() => {
  if (candidatesFailed.value) return '候选加载失败，直接输入列名'
  return form.value.dataSourceIds.length ? '选列' : '先选数据源，或直接输入列名'
})

/** 下拉里补上已关联但当前不在启用列表里的源：否则编辑历史对象时看不到它，也没法主动移除 */
const sourceOptions = computed<DataSourceDTO[]>(() => {
  const known = new Set(props.dataSources.map((source) => source.id))
  const missing = (props.permission?.dataSourceIds ?? [])
    .filter((id) => !known.has(id))
    .map((id) => ({ id, name: id, type: '不可用' }) as DataSourceDTO)
  return [...props.dataSources, ...missing]
})

const unavailableSourceIds = computed(() => {
  const known = new Set(props.dataSources.map((source) => source.id))
  return form.value.dataSourceIds.filter((id) => !known.has(id))
})

/** 候选列问后端要交集：可筛性口径在查询期生成器那边，前端只负责显示与提示 */
async function loadColumns(): Promise<void> {
  const selectable = new Set(props.dataSources.map((source) => source.id))
  const ids = form.value.dataSourceIds.filter((id) => selectable.has(id))
  if (!ids.length) {
    columnOptions.value = []
    candidatesFailed.value = false
    return
  }
  try {
    const result = await rowPermissionApi.columnCandidates(ids)
    columnOptions.value = result.data ?? []
    candidatesFailed.value = false
  } catch {
    columnOptions.value = []
    candidatesFailed.value = true
  }
}

function addCondition(): void {
  form.value.conditions.push(emptyConditionRow())
}

async function initialize(): Promise<void> {
  roleGrantCount.value = props.permission?.grants.length ?? 0
  form.value = {
    name: props.permission?.name ?? '',
    remark: props.permission?.remark ?? '',
    dataSourceIds: [...(props.permission?.dataSourceIds ?? [])],
    conditions: props.permission ? fromApiConditions(props.permission.conditions) : [emptyConditionRow()],
  }
  await loadColumns()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void initialize()
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写权限名称')
    return
  }
  if (form.value.dataSourceIds.length === 0) {
    ElMessage.warning('请至少关联一个数据源')
    return
  }
  const conditionError = validateConditionRows(form.value.conditions)
  if (conditionError) {
    ElMessage.warning(conditionError)
    return
  }

  submitting.value = true
  try {
    await rowPermissionApi.save({
      id: props.permission?.id ?? null,
      name: form.value.name.trim(),
      remark: form.value.remark.trim() || null,
      conditions: toApiConditions(form.value.conditions),
      dataSourceIds: [...form.value.dataSourceIds],
    })
    ElMessage.success(props.permission ? '权限对象已更新' : '权限对象已创建')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.rv-range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rv-field {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.rv-field .rv-input {
  flex: 1 1 auto;
  min-width: 0;
}

.var-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
}

.var-legend code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}
</style>
