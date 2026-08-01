<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig, FormField } from '@/components/business/types'
import { getMenuTree, createMenu, updateMenu, deleteMenu } from '@/api/menu'
import type { MenuTree } from '@/types/menu'

const searchTableRef = ref()
const list = ref<MenuTree[]>([])
const currentMenuType = ref(1)
const currentParentId = ref<number | undefined>()

const menuTypeMap: Record<number, string> = { 0: '目录', 1: '菜单', 2: '按钮' }
const menuTypeOptions = [
  { label: '目录', value: 0 }, { label: '菜单', value: 1 }, { label: '按钮', value: 2 },
]

// ---------- 搜索字段（空，树形不搜索） ----------
const searchFields: SearchField[] = []

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'menuName', label: '菜单名称', minWidth: 180 },
  { label: '图标', width: 80, slotName: 'icon' },
  { label: '类型', width: 80, align: 'center', slotName: 'menuType' },
  { prop: 'path', label: '路由', width: 160 },
  { prop: 'component', label: '组件路径', width: 200 },
  { prop: 'permission', label: '权限标识', width: 180 },
  { prop: 'sortOrder', label: '排序', width: 70, align: 'center' },
]

// ---------- fetchApi（树形无分页） ----------
async function fetchApi(_params: any) {
  const res = await getMenuTree()
  list.value = res.data
  return { rows: res.data, total: res.data.length }
}

// ---------- 新增子菜单 ----------
function handleAddChild(parentId: number) {
  currentParentId.value = parentId
  currentMenuType.value = 1
  searchTableRef.value?.openFormDialog({ parentId, menuType: 1, sortOrder: 0, visible: 1 })
}

function handleAddRoot() {
  currentParentId.value = undefined
  currentMenuType.value = 1
  searchTableRef.value?.openFormDialog({ menuType: 1, sortOrder: 0, visible: 1 })
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '新增子菜单', size: 'small', type: 'text', visible: (row: MenuTree) => row.menuType !== 2, onClick: (row: MenuTree) => handleAddChild(row.id) },
]

// ---------- 动态表单配置（按 menuType） ----------
const formConfig = computed<FormConfig<MenuTree>>(() => {
  const fields: FormField[] = [
    {
      type: 'tree-select', label: '上级菜单', prop: 'parentId', placeholder: '选择上级（空=根菜单）',
      treeProps: { data: list.value, props: { label: 'menuName', value: 'id', children: 'children' } },
    },
    {
      type: 'select', label: '菜单类型', prop: 'menuType', options: menuTypeOptions,
      rules: [{ required: true }],
      onChange: (val: number) => { currentMenuType.value = val },
    },
    { type: 'input', label: '菜单名称', prop: 'menuName', rules: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }] },
  ]

  // 目录(0) or 菜单(1): path + icon + visible
  if (currentMenuType.value === 0 || currentMenuType.value === 1) {
    fields.push(
      { type: 'input', label: '路由路径', prop: 'path' },
      { type: 'input', label: '图标', prop: 'icon', placeholder: 'Element Plus 图标名' },
      { type: 'radio', label: '可见', prop: 'visible', options: [{ label: '显示', value: 1 }, { label: '隐藏', value: 0 }] },
    )
  }

  // 菜单(1): component
  if (currentMenuType.value === 1) {
    fields.push({ type: 'input', label: '组件路径', prop: 'component', placeholder: 'views/system/user/UserPage' })
  }

  // 菜单(1) or 按钮(2): permission
  if (currentMenuType.value === 1 || currentMenuType.value === 2) {
    fields.push({ type: 'input', label: '权限标识', prop: 'permission', placeholder: 'system:user:add' })
  }

  fields.push({ type: 'input-number', label: '排序', prop: 'sortOrder' })

  return {
    fields,
    createApi: createMenu,
    updateApi: (id, data) => updateMenu(id as number, data),
    deleteApi: deleteMenu,
    getApi: async (id) => findNode(list.value, id),
  }
})

// 从树递归查找
function findNode(tree: MenuTree[], id: number): MenuTree | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

onMounted(async () => {
  const res = await getMenuTree()
  list.value = res.data
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
    :tree-props="{ rowKey: 'id', children: 'children', defaultExpandAll: true }"
    :show-search="false"
  >
    <template #icon="{ row }">
      <el-icon><component :is="row.icon || 'Menu'" /></el-icon>
    </template>
    <template #menuType="{ row }">
      <el-tag :type="row.menuType === 0 ? '' : row.menuType === 1 ? 'success' : 'warning'" size="small">
        {{ menuTypeMap[row.menuType] }}
      </el-tag>
    </template>
  </SearchTable>
</template>