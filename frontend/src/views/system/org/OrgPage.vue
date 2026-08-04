<script setup lang="ts">
import { ref, computed } from 'vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getOrgTree, createOrg, updateOrg, deleteOrg } from '@/api/org'
import type { TreeNode } from '@/types/org'

const searchTableRef = ref()
const list = ref<TreeNode[]>([])

// ---------- 搜索字段（空） ----------
const searchFields: SearchField[] = []

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'label', label: '组织名称', minWidth: 200 },
  { prop: 'code', label: '组织编码', width: 180 },
  { prop: 'sortOrder', label: '排序', width: 80, align: 'center' },
  { label: '状态', width: 80, align: 'center', formatter: (_r: any, _c: any, v: number) => v === 1 ? '启用' : '停用' },
]

// ---------- fetchApi（树形无分页） ----------
async function fetchApi(_params: any) {
  const res = await getOrgTree()
  list.value = res.data
  return { rows: res.data, total: res.data.length }
}

// ---------- 新增子组织 ----------
function handleAddChild(parentId: number) {
  searchTableRef.value?.openFormDialog({ parentId, sortOrder: 0 })
}

function handleAddRoot() {
  searchTableRef.value?.openFormDialog({ sortOrder: 0 })
}

// ---------- 操作按钮 ----------
const actionButtons: ActionButton[] = [
  { label: '新增子组织', size: 'small', link: true, onClick: (row: TreeNode) => handleAddChild(row.id) },
]

// ---------- 表单配置（字段映射 name→orgName, code→orgCode） ----------
const formConfig = computed<FormConfig<TreeNode>>(() => ({
  rule: [
    {
      type: 'treeSelect', field: 'parentId', title: '上级组织',
      props: { placeholder: '选择上级（空=根组织）', data: list.value, props: { label: 'label', value: 'id', children: 'children' } },
    } as Rule,
    { type: 'input', field: 'name', title: '组织名称', validate: [{ required: true, message: '请输入组织名称', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'code', title: '组织编码', validate: [{ required: true, message: '请输入组织编码', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'sortOrder', title: '排序' } as Rule,
  ],
  createApi: (data: any) => createOrg({ ...data, orgName: data.name, orgCode: data.code }),
  updateApi: (id, data: any) => updateOrg(id as number, { ...data, orgName: data.name, orgCode: data.code }),
  deleteApi: deleteOrg,
  getApi: async (id: number | string) => {
    const res = await getOrgTree()
    const node = findNode(res.data, Number(id))
    if (!node) return null
    return { ...node, name: node.label }
  },
  dialogTitle: { create: '新增组织', edit: '编辑组织' },
  createPermission: 'system:org:create',
  editPermission: 'system:org:update',
  deletePermission: 'system:org:delete',
}))

function findNode(tree: TreeNode[], id: number): TreeNode | null {
  for (const node of tree) {
    if (Number(node.id) === Number(id)) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}
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
  />
</template>