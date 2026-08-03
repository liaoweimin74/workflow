<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Key } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { getUserList, createUser, updateUser, deleteUser, updateUserStatus, resetUserPassword, getUserById } from '@/api/user'
import { getOrgTree } from '@/api/org'
import { getRoleList } from '@/api/role'
import type { UserVO } from '@/types/user'
import type { TreeNode } from '@/types/org'
import type { RoleVO } from '@/types/role'

// ---------- 下拉/树数据 ----------
const orgTree = ref<TreeNode[]>([])
const roleList = ref<RoleVO[]>([])

onMounted(async () => {
  const [orgRes, roleRes] = await Promise.all([getOrgTree(), getRoleList({ page: 1, size: 999 })])
  orgTree.value = orgRes.data
  roleList.value = roleRes.data.rows
})

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

const actionButtons: ActionButton[] = [
  {
    label: '重置密码',
    icon: Key,
    size: 'small',
    type: 'text',
    confirm: '确定重置密码吗？',
    onClick: handleResetPassword,
  },
]

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await getUserList(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 表单配置 ----------
const formConfig = computed<FormConfig<UserVO>>(() => ({
  fields: [
    { type: 'input', label: '用户名', prop: 'username', placeholder: '请输入用户名', rules: [{ required: true, message: '请输入用户名', trigger: 'blur' }] },
    { type: 'input', label: '昵称', prop: 'nickname', placeholder: '请输入昵称', rules: [{ required: true, message: '请输入昵称', trigger: 'blur' }] },
    { type: 'input', label: '邮箱', prop: 'email', placeholder: '请输入邮箱' },
    { type: 'input', label: '手机号', prop: 'phone', placeholder: '请输入手机号' },
    {
      type: 'tree-select',
      label: '组织机构',
      prop: 'orgId',
      placeholder: '选择组织',
      treeProps: {
        data: orgTree.value,
        props: { label: 'label', value: 'id', children: 'children' },
      },
    },
    {
      type: 'select',
      label: '角色',
      prop: 'roleIds',
      placeholder: '选择角色',
      props: { multiple: true },
      options: roleList.value.map((r) => ({ label: r.roleName, value: r.id })),
    },
  ],
  createApi: createUser,
  updateApi: (id, data) => updateUser(id as number, data),
  deleteApi: deleteUser,
  getApi: (id) => getUserById(id as number).then((r) => r.data),
  dialogTitle: { create: '新增用户', edit: '编辑用户' },
  createPermission: 'system:user:add',
  editPermission: 'system:user:edit',
  deletePermission: 'system:user:delete',
}))
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
</template>
