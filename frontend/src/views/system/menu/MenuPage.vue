<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getMenuTree, createMenu, updateMenu, deleteMenu } from '@/api/menu'
import type { MenuTree } from '@/types/menu'

const searchTableRef = ref()
const list = ref<MenuTree[]>([])

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
  searchTableRef.value?.openFormDialog({ parentId, menuType: 1, sortOrder: 0, visible: 1 })
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '新增子菜单', size: 'small', link: true, show: (row: MenuTree) => row.menuType !== 2, onClick: (row: MenuTree) => handleAddChild(row.id) },
]

// ---------- 表单配置（form-create rule） ----------
const formConfig = computed<FormConfig<MenuTree>>(() => {
  const rule: Rule[] = [
    {
      type: 'treeSelect', field: 'parentId', title: '上级菜单',
      props: { data: list.value, props: { label: 'menuName', value: 'id', children: 'children' } },
    },
    {
      type: 'select', field: 'menuType', title: '菜单类型', options: menuTypeOptions,
      value: 1,
      validate: [{ required: true }],
      update: (val: number, _rule: any, fApi: any) => {
        const isDir = val === 0
        const isMenu = val === 1
        const isButton = val === 2
        fApi.updateRule('path', { hidden: isButton })
        fApi.updateRule('icon', { hidden: isButton })
        fApi.updateRule('visible', { hidden: isButton })
        fApi.updateRule('component', { hidden: !isMenu })
        fApi.updateRule('permission', { hidden: isDir })
      },
    },
    {
      type: 'input', field: 'menuName', title: '菜单名称',
      validate: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
    },
    {
      type: 'input', field: 'path', title: '路由路径',
    },
    {
      type: 'input', field: 'icon', title: '图标',
      props: { placeholder: 'Element Plus 图标名' },
    },
    {
      type: 'radio', field: 'visible', title: '可见',
      options: [{ label: '显示', value: 1 }, { label: '隐藏', value: 0 }],
    },
    {
      type: 'input', field: 'component', title: '组件路径',
      props: { placeholder: 'views/system/user/UserPage' },
    },
    {
      type: 'input', field: 'permission', title: '权限标识',
      props: { placeholder: 'system:user:add' },
    },
    {
      type: 'inputNumber', field: 'sortOrder', title: '排序',
    },
  ]

  return {
    rule,
    createApi: createMenu,
    updateApi: (id, data) => updateMenu(id as number, data),
    deleteApi: async (id) => { await deleteMenu(id as number) },
    getApi: async (id) => findNode(list.value, Number(id)) as MenuTree,
    createPermission: 'system:menu:create',
    editPermission: 'system:menu:update',
    deletePermission: 'system:menu:delete',
  } as FormConfig<MenuTree>
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