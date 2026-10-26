<script setup lang="ts">
defineOptions({ name: 'UserManagement' })

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Key, Postcard } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { registerPageActions } from '@/utils/aiPageExecutor'
import { getUserList, createUser, updateUser, deleteUser, updateUserStatus, resetUserPassword, getUserById } from '@/api/user'
import { getOrgTree } from '@/api/org'
import { getRoleList } from '@/api/role'
import { getPostOptions } from '@/api/post'
import ClientIdentityDrawer from './ClientIdentityDrawer.vue'
import type { UserVO } from '@/types/user'
import type { TreeNode } from '@/types/org'
import type { RoleVO } from '@/types/role'
import type { PostOptionVO } from '@/types/post'

// ---------- 下拉/树数据 ----------
const orgTree = ref<TreeNode[]>([])
const roleList = ref<RoleVO[]>([])
const postOptions = ref<PostOptionVO[]>([])

// 角色列表保留首屏加载（角色列 ID→名称映射必需），已声明 cache:true 跨页面复用
onMounted(async () => {
  const roleRes = await getRoleList({ page: 1, size: 999 })
  roleList.value = roleRes.data.rows
})

// ---------- 组织树延迟加载 ----------
let _orgTreeLoaded = false
async function ensureOrgTree() {
  if (_orgTreeLoaded) return
  _orgTreeLoaded = true
  const res = await getOrgTree()
  orgTree.value = res.data
}

// ---------- 搜索字段 ----------
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '用户名', prop: 'username', placeholder: '输入用户名' },
  { type: 'input', label: '昵称', prop: 'nickname', placeholder: '输入昵称' },
  {
    type: 'tree-select',
    label: '组织机构',
    prop: 'orgId',
    placeholder: '选择组织',
    treeProps: {
      data: orgTree.value,
      props: { label: 'label', value: 'id', children: 'children' },
    },
    style: 'width: 200px',
    onExpand: ensureOrgTree,
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '选择状态',
    options: [
      { label: '全部', value: undefined },
      { label: '启用', value: 1 },
      { label: '停用', value: 0 },
    ],
    style: 'width: 120px',
  },
])

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'username', label: '用户名', width: 120 },
  { prop: 'nickname', label: '昵称', width: 120 },
  { prop: 'email', label: '邮箱', minWidth: 160 },
  { prop: 'phone', label: '手机号', width: 140 },
  { prop: 'orgName', label: '组织机构', width: 140 },
  { prop: 'postName', label: '岗位', width: 110 },
  {
    label: '角色',
    minWidth: 140,
    slotName: 'roles',
  },
  {
    label: '状态',
    width: 80,
    align: 'center',
    slotName: 'status',
  },
  { prop: 'createdAt', label: '创建时间', width: 170 },
]

// ---------- 操作按钮（含回调） ----------
const handleStatusChange = async (row: UserVO) => {
  const newStatus = row.status === 1 ? 0 : 1
  const label = newStatus === 0 ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确定${label}用户「${row.nickname}」吗？`, '确认', { type: 'warning' })
    await updateUserStatus(row.id, newStatus)
    ElMessage.success(`${label}成功`)
    searchTableRef.value?.fetchList()
  } catch { /* cancelled */ }
}

const handleResetPassword = async (row: UserVO) => {
  try {
    await ElMessageBox.confirm(`确定重置用户「${row.nickname}」的密码吗？`, '确认重置密码', { type: 'warning' })
    await resetUserPassword(row.id)
    ElMessage.success('密码已重置为 123456')
  } catch { /* cancelled */ }
}

const searchTableRef = ref()

// ---------- A4 端身份抽屉（J5b） ----------
const identityVisible = ref(false)
const identityUser = ref<UserVO | null>(null)
const handleShowIdentity = (row: UserVO) => {
  identityUser.value = row
  identityVisible.value = true
}

const actionButtons: ActionButton[] = [
  {
    label: '重置密码',
    icon: Key,
    size: 'small',
    link: true,
    confirm: '确定重置密码吗？',
    onClick: handleResetPassword,
  },
  {
    label: '端身份',
    icon: Postcard,
    size: 'small',
    link: true,
    permission: 'system:user:identity',
    onClick: handleShowIdentity,
  },
]

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await getUserList(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 表单配置 ----------
const formConfig = computed<FormConfig<UserVO>>(() => ({
  rule: [
    { type: 'input', field: 'username', title: '用户名', props: { placeholder: '请输入用户名' }, validate: [{ required: true, message: '请输入用户名', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'nickname', title: '昵称', props: { placeholder: '请输入昵称' }, validate: [{ required: true, message: '请输入昵称', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'email', title: '邮箱', props: { placeholder: '请输入邮箱' } } as Rule,
    { type: 'input', field: 'phone', title: '手机号', props: { placeholder: '请输入手机号' } } as Rule,
    {
      type: 'treeSelect', field: 'orgId', title: '组织机构',
      props: { placeholder: '选择组织', data: orgTree.value, props: { label: 'label', value: 'id', children: 'children' } },
    } as Rule,
    {
      type: 'select', field: 'postId', title: '岗位',
      props: { placeholder: '选择岗位（可选，在「岗位管理」维护）', clearable: true, filterable: true },
      options: postOptions.value.map((p) => ({ label: `${p.postName}（${p.postCode}）`, value: p.id })),
    } as Rule,
    {
      type: 'select', field: 'roleIds', title: '角色',
      props: { multiple: true, placeholder: '选择角色' },
      options: roleList.value.map((r) => ({ label: r.roleName, value: r.id })),
    } as Rule,
  ],
  createApi: createUser,
  updateApi: (id, data) => updateUser(id as number, { ...data, postId: (data as any).postId ?? null }),
  deleteApi: async (id) => { await deleteUser(id as number) },
  getApi: (id) => getUserById(id as number).then((r) => r.data),
  dialogTitle: { create: '新增用户', edit: '编辑用户' },
  createPermission: 'system:user:create',
  editPermission: 'system:user:update',
  deletePermission: 'system:user:delete',
  onFormOpen: () => { void ensureOrgTree(); void ensurePostOptions() },
}))

/** 岗位下拉选项（首次打开表单时加载；失败下次重试） */
let _postOptionsLoaded = false
async function ensurePostOptions() {
  if (_postOptionsLoaded) return
  _postOptionsLoaded = true
  try {
    const res = await getPostOptions()
    postOptions.value = res.data
  } catch {
    _postOptionsLoaded = false
  }
}

// ==================== AI 页面操作（L2 注册层：用户管理） ====================
const aiRoute = useRoute()

function aiRows(limit = 10) {
  const rows = (searchTableRef.value?.getList?.() ?? []) as UserVO[]
  return rows.slice(0, limit).map((r) => ({ id: r.id, username: r.username, nickname: r.nickname, email: r.email, orgName: r.orgName, status: r.status }))
}

const QUERY_FIELDS = ['username', 'nickname', 'orgId', 'status']

const unregisterAi = registerPageActions({
  routePath: aiRoute.path,
  pageType: 'admin',
  manifest: () => ({
    pageType: 'admin',
    title: '用户管理',
    searchFields: searchFields.value.map((f) => ({ field: f.prop, title: f.label, type: f.type })),
    tableColumns: columns.map((c) => ({ field: (c as TableColumn).prop, title: (c as TableColumn).label })).filter((c) => c.field),
    formFields: formConfig.value.rule.map((r) => ({ field: (r as any).field, title: (r as any).title, required: !!(r as any).validate?.length })),
    buttons: ['search', 'reset', 'open-create', 'open-edit', 'submit'],
    notes: 'set-query 即时生效并刷新列表；新增/编辑弹窗先 open-create/open-edit 再 set-value 填字段，最后 submit 提交',
    layer: 'L2',
  }),
  handlers: {
    'set-query': async (a) => {
      const f = String(a.field ?? a.target ?? '')
      if (!QUERY_FIELDS.includes(f)) return { ok: false, error: `查询字段不存在「${f}」（可用：${QUERY_FIELDS.join('/')}）` }
      await searchTableRef.value?.setQuery({ [f]: a.value })
      return { ok: true, data: `${f}=${JSON.stringify(a.value)}，已刷新列表` }
    },
    search: async () => { await searchTableRef.value?.fetchList(); return { ok: true, data: '已刷新列表' } },
    reset: async () => { await searchTableRef.value?.resetQuery(); return { ok: true, data: '查询条件已重置' } },
    'open-create': () => { searchTableRef.value?.openFormDialog(); return { ok: true, data: '已打开新增用户弹窗' } },
    'open-edit': (a) => {
      const idx = Number(a.target ?? a.value ?? NaN)
      const row = (searchTableRef.value?.getList?.() ?? [])[idx]
      if (!row) return { ok: false, error: `行序号 ${a.target} 不存在（先 get-state 查看当前页）` }
      searchTableRef.value?.openEdit(row)
      return { ok: true, data: `已打开编辑弹窗：${row.username}` }
    },
    'set-value': (a) => {
      const st = searchTableRef.value?.dialogState?.()
      if (!st?.visible) return { ok: false, error: '表单弹窗未打开（先 open-create 或 open-edit）' }
      const f = String(a.field ?? a.target ?? '')
      searchTableRef.value?.setFormField(f, a.value)
      return { ok: true, data: `弹窗表单 ${f}=${JSON.stringify(a.value)}` }
    },
    submit: async () => {
      const st = searchTableRef.value?.dialogState?.()
      if (!st?.visible) return { ok: false, error: '表单弹窗未打开（先 open-create 或 open-edit 再 set-value）' }
      const passed = await searchTableRef.value?.validateForm?.()
      if (passed === false) return { ok: false, error: '表单校验未通过，请检查必填项（get-state 查看 form）' }
      await searchTableRef.value?.submitDialog()
      return { ok: true, data: st.isEdit ? '用户已更新' : '用户已创建' }
    },
    'get-state': () => {
      const st = searchTableRef.value?.dialogState?.()
      return {
        ok: true,
        data: {
          query: searchTableRef.value?.getQuery?.() ?? {},
          rows: aiRows(),
          dialog: st,
          form: st?.visible ? searchTableRef.value?.getFormValues?.() : null,
        },
      }
    },
    'read-table': (a) => {
      const limit = Number((a.params as any)?.limit ?? 10) || 10
      return { ok: true, data: { rows: aiRows(limit), total: searchTableRef.value?.getQuery?.()?.total } }
    },
    expect: (a) => {
      const p = (a.params ?? {}) as { type?: string; expected?: unknown; comparator?: string }
      let actual: unknown
      if (p.type === 'rowCount') actual = (searchTableRef.value?.getList?.() ?? []).length
      else if (p.type === 'value') actual = searchTableRef.value?.getFormValues?.()?.[a.field ?? a.target ?? '']
      else if (p.type === 'query') actual = searchTableRef.value?.getQuery?.()?.[a.field ?? a.target ?? '']
      const pass = p.comparator === 'contains'
        ? String(actual ?? '').includes(String(p.expected ?? ''))
        : String(actual ?? '') === String(p.expected ?? '')
      return pass
        ? { ok: true, data: { actual, expected: p.expected, pass } }
        : { ok: false, data: { actual, expected: p.expected, pass }, error: `断言失败：actual=${JSON.stringify(actual)}` }
    },
  },
})
onUnmounted(unregisterAi)
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  >
    <!-- 角色列：ID → 名称映射 -->
    <template #roles="{ row }">
      {{ row.roleIds?.map((id: number) => roleList.find(r => r.id === id)?.roleName || id).join(' / ') }}
    </template>
    <!-- 状态列：用 Switch -->
    <template #status="{ row }">
      <el-switch :model-value="row.status === 1" @change="handleStatusChange(row)" />
    </template>
  </SearchTable>

  <!-- A4 端身份抽屉（行操作「端身份」，system:user:identity 管控入口） -->
  <ClientIdentityDrawer v-model="identityVisible" :user="identityUser" />
</template>
