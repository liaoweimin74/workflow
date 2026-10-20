<template>
  <el-dialog
    :model-value="modelValue"
    :title="`数据范围 — ${dataSource?.name ?? ''}`"
    width="920px"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert type="info" :closable="false" show-icon class="mb-3">
      <template #title>范围是「收紧」而非「开关」</template>
      <div class="text-xs leading-5">
        没有任何命中规则时，本租户内所有登录用户都能读到全部行（与配置前一致）。管理员不受范围约束。
        读（列表/聚合/单条）与写（修改/删除）分轴各配一条规则，新增记录不做行校验。
      </div>
    </el-alert>

    <!-- ==================== 已配置规则 ==================== -->
    <el-table :data="rules" v-loading="loading" size="small" empty-text="尚未配置规则">
      <el-table-column label="动作" width="80">
        <template #default="{ row }">
          <el-tag :type="row.action === 'READ' ? 'primary' : 'warning'" size="small">
            {{ row.action === 'READ' ? '读' : '写' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主体" min-width="200">
        <template #default="{ row }">{{ subjectLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="范围" min-width="220">
        <template #default="{ row }">{{ scopeLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="right" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="startEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="removeRule(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- ==================== 新增 / 编辑 ==================== -->
    <el-divider content-position="left">{{ editingId ? '编辑规则' : '新增规则' }}</el-divider>
    <el-form :model="form" label-width="86px" label-position="left">
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="约束动作">
            <!-- 编辑态锁死动作与主体：换轴/换主体等于另一条规则，改出来会变成「新增一条 + 旧的原样留着」 -->
            <el-select v-model="form.action" data-testid="ds-scope-action" :disabled="!!editingId" style="width: 100%">
              <el-option label="读（列表 / 聚合 / 单条）" value="READ" />
              <el-option label="写（修改 / 删除）" value="WRITE" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="主体类型">
            <el-select v-model="form.subjectType" data-testid="ds-scope-subject-type" :disabled="!!editingId" style="width: 100%" @change="form.subjectKey = ''">
              <el-option label="角色" value="ROLE" />
              <el-option label="用户" value="USER" />
              <el-option label="组织" value="ORG" />
              <el-option label="成员组" value="MEMBER_GROUP" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="主体">
            <el-select
              v-model="form.subjectKey"
              data-testid="ds-scope-subject"
              :disabled="!!editingId"
              filterable
              :remote="form.subjectType === 'USER'"
              :remote-method="searchUsers"
              :loading="subjectLoading"
              placeholder="选择主体"
              style="width: 100%"
            >
              <el-option v-for="o in subjectOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="可见范围">
            <el-radio-group v-model="form.scopeType">
              <el-radio-button value="ALL">全部</el-radio-button>
              <el-radio-button value="SELF">仅本人</el-radio-button>
              <el-radio-button value="CUSTOM">指定列</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item v-if="form.scopeType === 'CUSTOM'" label="过滤列">
            <el-select
              v-model="form.scopeColumn"
              data-testid="ds-scope-column"
              filterable
              allow-create
              default-first-option
              placeholder="选列，或直接输入列名"
              style="width: 100%"
            >
              <el-option v-for="c in columnOptions" :key="c.key" :label="`${c.label}（${c.key}）`" :value="c.key" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item v-if="form.scopeType === 'CUSTOM'" label="取值">
            <el-input v-model="form.scopeValue" data-testid="ds-scope-value" placeholder="{userId} / {orgId} / 字面量" />
          </el-form-item>
        </el-col>
      </el-row>
      <div class="flex items-center gap-2">
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ editingId ? '保存修改' : '新增规则' }}
        </el-button>
        <el-button v-if="editingId" @click="resetForm">取消编辑</el-button>
        <span class="text-xs text-gray-400">{{ formHint }}</span>
      </div>
    </el-form>

    <!-- ==================== 生效预览 ==================== -->
    <el-divider content-position="left">生效预览</el-divider>
    <div class="flex items-center gap-2 flex-wrap">
      <el-select v-model="previewAction" data-testid="ds-scope-preview-action" style="width: 210px" @change="runPreview">
        <el-option label="读（READ）" value="READ" />
        <el-option label="写（WRITE）" value="WRITE" />
      </el-select>
      <el-select
        v-model="previewUserId"
        data-testid="ds-scope-preview-user"
        filterable
        clearable
        remote
        :remote-method="searchUsers"
        :loading="subjectLoading"
        placeholder="指定用户（留空 = 我自己）"
        style="width: 260px"
        @change="runPreview"
      >
        <el-option v-for="o in userOptions" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-button data-testid="ds-scope-preview-btn" :loading="previewLoading" @click="runPreview">预览</el-button>
    </div>

    <div v-if="preview" class="mt-2 text-xs leading-6 bg-gray-50 px-3 py-2 rounded">
      <div>
        预览对象：
        <strong>{{ preview.username ?? '当前登录用户' }}</strong>
        <el-tag :type="preview.unrestricted ? 'success' : 'warning'" size="small" class="ml-1">
          {{ preview.unrestricted ? '不受限（可访问全部行）' : '受限于下列条件' }}
        </el-tag>
      </div>
      <div class="text-gray-500">可命中主体：{{ preview.subjects.join('、') || '（无）' }}</div>
      <div class="text-gray-500">
        命中规则 {{ preview.matchedRules.length }} 条，最终生效：
        <strong>{{ preview.effectiveRule ? scopeLabel(preview.effectiveRule) : '无' }}</strong>
      </div>
      <div v-if="!preview.unrestricted" class="text-gray-700">
        实际追加条件：<code>{{ JSON.stringify(preview.condition) }}</code>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
defineOptions({ name: 'DataScopeDialog' })

import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dataScopeApi } from '@/api/dataScope'
import type {
  DataScopeAction,
  DataScopeDTO,
  DataScopeEffectiveVO,
  DataScopeSubject,
  DataScopeType,
} from '@/api/dataScope'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { getRoleList } from '@/api/role'
import { getOrgTree } from '@/api/org'
import { getMemberGroupList } from '@/api/memberGroup'
import { getUserList, getUserBatch } from '@/api/user'
import type { TreeNode } from '@/types/org'

const props = defineProps<{ modelValue: boolean; dataSource: DataSourceDTO | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const loading = ref(false)
const submitting = ref(false)
const rules = ref<DataScopeDTO[]>([])

// ==================== 新增 / 编辑表单 ====================
const emptyForm = () => ({
  action: 'READ' as DataScopeAction,
  subjectType: 'ROLE' as DataScopeSubject,
  subjectKey: '',
  scopeType: 'ALL' as DataScopeType,
  scopeColumn: '',
  scopeValue: '',
})

const form = ref(emptyForm())
const editingId = ref<number | null>(null)

/** 主体 id → 展示名（角色 code → 角色名同理）；列表里的规则靠它还原成人话 */
const roleNames = ref<Record<string, string>>({})
const orgNames = ref<Record<string, string>>({})
const groupNames = ref<Record<string, string>>({})
const userNames = ref<Record<string, string>>({})

// ==================== 主体候选项 ====================
const subjectLoading = ref(false)
const roleOptions = ref<{ value: string; label: string }[]>([])
const orgOptions = ref<{ value: string; label: string }[]>([])
const groupOptions = ref<{ value: string; label: string }[]>([])
const userOptions = ref<{ value: string; label: string }[]>([])

const subjectOptions = computed(() => {
  switch (form.value.subjectType) {
    case 'ROLE':
      return roleOptions.value
    case 'ORG':
      return orgOptions.value
    case 'MEMBER_GROUP':
      return groupOptions.value
    default:
      // 用户靠远程搜索，候选集随输入变化
      return userOptions.value
  }
})

async function searchUsers(keyword: string): Promise<void> {
  subjectLoading.value = true
  try {
    const res = await getUserList({ username: keyword?.trim() || undefined, page: 1, size: 30 })
    userOptions.value = (res.data.rows ?? []).map((u) => ({
      value: String(u.id),
      label: `${u.nickname || u.username}（${u.username}）`,
    }))
    res.data.rows?.forEach((u) => rememberUser(u.id, `${u.nickname || u.username}（${u.username}）`))
  } catch {
    userOptions.value = []
  } finally {
    subjectLoading.value = false
  }
}

function rememberUser(id: number, label: string): void {
  userNames.value = { ...userNames.value, [String(id)]: label }
}

/** 编辑弹窗的 org 树摊平成带缩进的一维列表：el-select 不接树形数据 */
function flattenOrgs(nodes: TreeNode[], depth = 0): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  for (const n of nodes) {
    out.push({ value: String(n.id), label: `${'　'.repeat(depth)}${n.label}` })
    if (n.children?.length) out.push(...flattenOrgs(n.children, depth + 1))
    orgNames.value[String(n.id)] = n.label
  }
  return out
}

async function loadSubjectCatalogs(): Promise<void> {
  const [roles, tree, groups] = await Promise.all([
    getRoleList({ page: 1, size: 500 }).catch(() => null),
    getOrgTree().catch(() => null),
    getMemberGroupList({ page: 1, size: 500 }).catch(() => null),
  ])
  roleOptions.value = (roles?.data.rows ?? []).map((r) => ({
    value: r.roleCode,
    label: `${r.roleName}（${r.roleCode}）`,
  }))
  roles?.data.rows?.forEach((r) => {
    roleNames.value[r.roleCode] = r.roleName
  })
  orgOptions.value = flattenOrgs(tree?.data ?? [])
  groupOptions.value = (groups?.data.rows ?? []).map((g) => {
    groupNames.value[String(g.id)] = g.groupName
    return { value: String(g.id), label: g.groupName }
  })
}

/** 已配置规则里的用户 id 不一定在搜索结果里，按 id 批量回查名称 */
async function resolveRuleUserNames(list: DataScopeDTO[]): Promise<void> {
  const missing = list
    .filter((r) => r.subjectType === 'USER' && !userNames.value[r.subjectKey])
    .map((r) => Number(r.subjectKey))
    .filter((n) => Number.isFinite(n))
  if (missing.length === 0) return
  try {
    const res = await getUserBatch(missing)
    res.data?.forEach((u) => rememberUser(u.id, `${u.nickname || u.username}（${u.username}）`))
  } catch {
    // 名称查不到不影响配置，退化成显示裸 id
  }
}

// ==================== CUSTOM 过滤列候选 ====================
const columnOptions = ref<{ key: string; label: string }[]>([])

async function loadColumns(): Promise<void> {
  if (!props.dataSource) return
  try {
    const res = await dataSourceApi.getMetadata(props.dataSource.id)
    const cols = (res.data.columns ?? []).map((c) => ({ key: c.key, label: c.label || c.key }))
    // 元数据只列表单声明字段；created_by 是后端 BUILTIN_COLUMNS 里的内置列，
    // 不补进来就只能手敲列名，而「按创建人过滤」正是 CUSTOM 最常见的用法
    if (!cols.some((c) => c.key === 'created_by')) cols.unshift({ key: 'created_by', label: '创建人' })
    columnOptions.value = cols
  } catch {
    columnOptions.value = []
  }
}

// ==================== 规则增删改 ====================
const formHint = computed(() => {
  if (form.value.scopeType === 'SELF') return '仅本人：按内置列 created_by 等值过滤，新增记录会自动写入该列。'
  if (form.value.scopeType === 'CUSTOM') return '指定列：列名须在数据源里真实存在，取值支持 {userId} / {username} / {orgId}。'
  return '全部：该主体在此动作上不受行级限制（多主体命中时取最宽的一条）。'
})

async function loadRules(): Promise<void> {
  if (!props.dataSource) return
  loading.value = true
  try {
    const res = await dataScopeApi.list(props.dataSource.id)
    rules.value = res.data ?? []
    await resolveRuleUserNames(rules.value)
  } finally {
    loading.value = false
  }
}

function startEdit(row: DataScopeDTO): void {
  editingId.value = row.id
  form.value = {
    action: row.action,
    subjectType: row.subjectType,
    subjectKey: row.subjectKey,
    scopeType: row.scopeType,
    scopeColumn: row.scopeColumn ?? '',
    scopeValue: row.scopeValue ?? '',
  }
}

function resetForm(): void {
  editingId.value = null
  form.value = emptyForm()
}

async function submit(): Promise<void> {
  if (!props.dataSource) return
  if (!form.value.subjectKey) {
    ElMessage.warning('请选择主体')
    return
  }
  if (form.value.scopeType === 'CUSTOM' && (!form.value.scopeColumn || !form.value.scopeValue)) {
    ElMessage.warning('指定列模式需要填写过滤列与取值')
    return
  }
  submitting.value = true
  try {
    await dataScopeApi.save({
      dataSourceId: props.dataSource.id,
      action: form.value.action,
      subjectType: form.value.subjectType,
      subjectKey: form.value.subjectKey,
      scopeType: form.value.scopeType,
      // SELF/ALL 不携带列与值：后端也会清空，前端别留脏值
      scopeColumn: form.value.scopeType === 'CUSTOM' ? form.value.scopeColumn : null,
      scopeValue: form.value.scopeType === 'CUSTOM' ? form.value.scopeValue : null,
    })
    ElMessage.success(editingId.value ? '规则已更新' : '规则已新增')
    resetForm()
    await loadRules()
    // 规则变了就重算预览：否则预览会说“命中 1 条”而表里已经没有这条
    await runPreview()
  } finally {
    submitting.value = false
  }
}

async function removeRule(row: DataScopeDTO): Promise<void> {
  if (!row.id || !props.dataSource) return
  try {
    await ElMessageBox.confirm(
      `删除后「${subjectLabel(row)}」在${row.action === 'READ' ? '读' : '写'}轴上不再受限，确定删除？`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await dataScopeApi.remove(row.id)
  ElMessage.success('已删除')
  await loadRules()
  await runPreview()
}

function subjectLabel(row: DataScopeDTO): string {
  const key = row.subjectKey
  switch (row.subjectType) {
    case 'ROLE':
      return `角色：${roleNames.value[key] ? `${roleNames.value[key]}（${key}）` : key}`
    case 'USER':
      return `用户：${userNames.value[key] ?? `id ${key}`}`
    case 'ORG':
      return `组织：${orgNames.value[key] ? `${orgNames.value[key]}（id ${key}）` : `id ${key}`}`
    default:
      return `成员组：${groupNames.value[key] ? `${groupNames.value[key]}（id ${key}）` : `id ${key}`}`
  }
}

function scopeLabel(row: DataScopeDTO): string {
  if (row.scopeType === 'SELF') return '仅本人（created_by = 当前用户）'
  if (row.scopeType === 'ALL') return '全部（不受限）'
  return `${row.scopeColumn} = ${row.scopeValue}`
}

// ==================== 生效预览 ====================
const previewAction = ref<DataScopeAction>('READ')
const previewUserId = ref<string>('')
const previewLoading = ref(false)
const preview = ref<DataScopeEffectiveVO | null>(null)

async function runPreview(): Promise<void> {
  if (!props.dataSource) return
  previewLoading.value = true
  try {
    const res = await dataScopeApi.effective({
      dataSourceId: props.dataSource.id,
      action: previewAction.value,
      userId: previewUserId.value ? Number(previewUserId.value) : undefined,
    })
    preview.value = res.data
  } catch {
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

/** 父级以 v-if 挂载本组件，因此打开即初始化（重开必然重新取数，不留旧快照） */
onMounted(() => {
  void Promise.all([loadSubjectCatalogs(), loadColumns()])
  void loadRules()
  void searchUsers('')
  void runPreview()
})
</script>
