<script setup lang="ts">
defineOptions({ name: 'RoleManagement' })

import { ref, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, Lock } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { registerPageActions } from '@/utils/aiPageExecutor'
import { getRoleList, createRole, updateRole, deleteRole, getRoleMenus, assignRoleMenus } from '@/api/role'
import { getMenuTree } from '@/api/menu'
import type { RoleVO } from '@/types/role'
import type { MenuTree } from '@/types/menu'
import RoleDataPermissionDialog from './RoleDataPermissionDialog.vue'

const searchTableRef = ref()
// ensure searchTableRef is "used" for template ref binding
void searchTableRef
const menuTree = ref<MenuTree[]>([])
const menuDialogVisible = ref(false)
const currentRoleId = ref<number>(0)
const checkedMenuKeys = ref<number[]>([])
const menuTreeRef = ref<any>(null)

const dataPermissionDialogRef = ref<InstanceType<typeof RoleDataPermissionDialog> | null>(null)
const dataPermissionVisible = ref(false)
const dataPermissionRole = ref<RoleVO | null>(null)

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
let _menuTreeLoaded = false
async function ensureMenuTree() {
  if (_menuTreeLoaded) return
  _menuTreeLoaded = true
  const res = await getMenuTree()
  menuTree.value = res.data
}

async function handleAssignMenu(row: RoleVO) {
  currentRoleId.value = row.id
  await ensureMenuTree()
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

// ---------- 数据权限 ----------
function handleAssignDataPermission(row: RoleVO): void {
  dataPermissionRole.value = row
  dataPermissionVisible.value = true
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '分配菜单', icon: Key, size: 'small', link: true, onClick: handleAssignMenu },
  { label: '数据权限', icon: Lock, size: 'small', link: true, onClick: handleAssignDataPermission },
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

// ==================== AI 页面操作（L2 注册层：角色管理） ====================
const aiRoute = useRoute()

function aiRows(limit = 10) {
  const rows = (searchTableRef.value?.getList?.() ?? []) as RoleVO[]
  return rows.slice(0, limit).map((r) => ({ id: r.id, roleName: r.roleName, roleCode: r.roleCode, description: r.description, status: r.status }))
}

const QUERY_FIELDS = ['roleName', 'status']

/** 按 menuName 在菜单树中查找 id（支持部分匹配，返回全部命中叶子路径节点） */
function findMenuIds(names: string[]): number[] {
  const ids: number[] = []
  const walk = (nodes: MenuTree[]) => {
    for (const n of nodes) {
      if (names.some((x) => (n.menuName ?? '').includes(x))) ids.push(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(menuTree.value)
  return ids
}

const unregisterAi = registerPageActions({
  routePath: aiRoute.path,
  pageType: 'admin',
  manifest: () => ({
    pageType: 'admin',
    title: '角色管理',
    searchFields: searchFields.map((f) => ({ field: f.prop, title: f.label, type: f.type })),
    tableColumns: columns.map((c) => ({ field: (c as TableColumn).prop, title: (c as TableColumn).label })).filter((c) => c.field),
    formFields: formConfig.rule.map((r) => ({ field: (r as any).field, title: (r as any).title, required: !!(r as any).validate?.length })),
    buttons: ['search', 'reset', 'open-create', 'open-edit', 'submit', 'assign-menu', 'check-menu', 'submit-menu', 'assign-data-permission'],
    notes: 'set-query 即时生效并刷新列表；弹窗表单先 open-create/open-edit 再 set-value，最后 submit；分配菜单流程=assign-menu(行序号)→check-menu(菜单名数组)→submit-menu；数据权限流程=assign-data-permission(行序号) 打开勾选弹窗（人工勾选读写轴后保存）',
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
    'open-create': () => { searchTableRef.value?.openFormDialog(); return { ok: true, data: '已打开新增角色弹窗' } },
    'open-edit': (a) => {
      const idx = Number(a.target ?? a.value ?? NaN)
      const row = (searchTableRef.value?.getList?.() ?? [])[idx]
      if (!row) return { ok: false, error: `行序号 ${a.target} 不存在（先 get-state 查看当前页）` }
      searchTableRef.value?.openEdit(row)
      return { ok: true, data: `已打开编辑弹窗：${row.roleName}` }
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
      return { ok: true, data: st.isEdit ? '角色已更新' : '角色已创建' }
    },
    'assign-menu': async (a) => {
      const idx = Number(a.target ?? a.value ?? NaN)
      const row = (searchTableRef.value?.getList?.() ?? [])[idx]
      if (!row) return { ok: false, error: `行序号 ${a.target} 不存在（先 get-state 查看当前页）` }
      await handleAssignMenu(row)
      return { ok: true, data: `已打开「${row.roleName}」的分配菜单弹窗` }
    },
    'check-menu': (a) => {
      if (!menuDialogVisible.value) return { ok: false, error: '分配菜单弹窗未打开（先 assign-menu）' }
      const names = Array.isArray(a.value) ? (a.value as string[]) : String(a.value ?? '').split(',')
      const ids = findMenuIds(names.map((s) => s.trim()).filter(Boolean))
      if (!ids.length) return { ok: false, error: `菜单未匹配到任何节点：${names.join('、')}` }
      menuTreeRef.value?.setCheckedKeys(ids)
      return { ok: true, data: `已勾选 ${ids.length} 个节点` }
    },
    'submit-menu': () => handleMenuSubmit().then(() => ({ ok: true, data: '菜单分配已保存' })).catch((e) => ({ ok: false, error: `保存失败：${e?.message ?? e}` })),
    'assign-data-permission': (a) => {
      const idx = Number(a.target ?? a.value ?? NaN)
      const row = (searchTableRef.value?.getList?.() ?? [])[idx]
      if (!row) return { ok: false, error: `行序号 ${a.target} 不存在（先 get-state 查看当前页）` }
      handleAssignDataPermission(row)
      return { ok: true, data: `已打开「${row.roleName}」的数据权限弹窗` }
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
          menuDialog: { visible: menuDialogVisible.value, checked: checkedMenuKeys.value },
          dataPermissionDialog: dataPermissionDialogRef.value?.getState?.() ?? { visible: false, rows: [] },
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

  <RoleDataPermissionDialog
    ref="dataPermissionDialogRef"
    v-model="dataPermissionVisible"
    :role="dataPermissionRole"
  />
</template>

<style scoped>
.menu-tree-container {
  height: 360px;
  overflow-y: auto;
}
</style>