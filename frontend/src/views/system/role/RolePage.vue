<script setup lang="ts">
defineOptions({ name: 'RoleManagement' })

import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Key } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getRoleList, createRole, updateRole, deleteRole, getRoleMenus, assignRoleMenus } from '@/api/role'
import { getMenuTree } from '@/api/menu'
import type { RoleVO } from '@/types/role'
import type { MenuTree } from '@/types/menu'

const searchTableRef = ref()
// ensure searchTableRef is "used" for template ref binding
void searchTableRef
const menuTree = ref<MenuTree[]>([])
const menuDialogVisible = ref(false)
const currentRoleId = ref<number>(0)
const checkedMenuKeys = ref<number[]>([])
const menuTreeRef = ref<any>(null)

// ---------- 搜索字段 ----------
const searchFields: SearchField[] = [
  { type: 'input', label: '角色名称', prop: 'roleName', placeholder: '输入角色名称' },
  {
    type: 'select', label: '状态', prop: 'status', placeholder: '选择状态',
    options: [{ label: '全部', value: undefined }, { label: '启用', value: 1 }, { label: '停用', value: 0 }],
    style: 'width: 120px',
  },
]

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'roleName', label: '角色名称', width: 140 },
  { prop: 'roleCode', label: '角色编码', width: 160 },
  { prop: 'description', label: '描述', minWidth: 200 },
  { label: '状态', width: 80, align: 'center', formatter: (_r: any, _c: any, v: any) => v === 1 ? '启用' : '停用' },
  { prop: 'createdAt', label: '创建时间', width: 170 },
]

// ---------- 分配菜单 ----------
async function handleAssignMenu(row: RoleVO) {
  currentRoleId.value = row.id
  const res = await getRoleMenus(row.id)
  checkedMenuKeys.value = res.data || []
  menuDialogVisible.value = true
}

async function handleMenuSubmit() {
  const keys = menuTreeRef.value?.getCheckedKeys(true) || []
  await assignRoleMenus(currentRoleId.value, keys)
  ElMessage.success('分配菜单成功')
  menuDialogVisible.value = false
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '分配菜单', icon: Key, size: 'small', link: true, onClick: handleAssignMenu },
]

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await getRoleList(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 表单配置 ----------
const formConfig: FormConfig<RoleVO> = {
  rule: [
    { type: 'input', field: 'roleName', title: '角色名称', validate: [{ required: true, message: '请输入角色名称', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'roleCode', title: '角色编码', validate: [{ required: true, message: '请输入角色编码', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'description', title: '描述', props: { placeholder: '请输入描述' } } as Rule,
  ],
  createApi: createRole,
  updateApi: (id, data) => updateRole(id as number, { roleName: data.roleName, description: data.description }),
  deleteApi: async (id) => { await deleteRole(id as number) },
  getApi: async (id) => {
    const res = await getRoleList({ page: 1, size: 999 })
    return res.data.rows.find((r: RoleVO) => r.id === (id as number)) as RoleVO
  },
  dialogTitle: { create: '新增角色', edit: '编辑角色' },
  createPermission: 'system:role:create',
  editPermission: 'system:role:update',
  deletePermission: 'system:role:delete',
}

onMounted(async () => {
  const menuRes = await getMenuTree()
  menuTree.value = menuRes.data
})
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />

  <el-dialog v-model="menuDialogVisible" title="分配菜单权限" width="420px" :close-on-click-modal="false">
    <div class="menu-tree-container">
      <el-tree
        ref="menuTreeRef"
        :data="menuTree"
        show-checkbox
        node-key="id"
        :default-checked-keys="checkedMenuKeys"
        :props="{ label: 'menuName', children: 'children' }"
        default-expand-all
      />
    </div>
    <template #footer>
      <el-button @click="menuDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleMenuSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.menu-tree-container {
  height: 360px;
  overflow-y: auto;
}
</style>