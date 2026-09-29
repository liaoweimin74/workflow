<script setup lang="ts">
defineOptions({ name: 'PostManagement' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getPostList, createPost, updatePost, deletePost } from '@/api/post'
import type { PostVO } from '@/types/post'

const searchTableRef = ref()
// ensure searchTableRef is "used" for template ref binding
void searchTableRef

// ---------- 搜索字段 ----------
const searchFields: SearchField[] = [
  { type: 'input', label: '关键词', prop: 'keyword', placeholder: '岗位名称/编码' },
  {
    type: 'select', label: '状态', prop: 'status', placeholder: '选择状态',
    options: [{ label: '全部', value: undefined }, { label: '启用', value: 1 }, { label: '停用', value: 0 }],
    style: 'width: 120px',
  },
]

// ---------- 表格列 ----------
const columns: TableColumn[] = [
  { prop: 'postName', label: '岗位名称', width: 160 },
  { prop: 'postCode', label: '岗位编码', width: 160 },
  { prop: 'description', label: '岗位说明', minWidth: 200 },
  { prop: 'sortOrder', label: '排序', width: 80, align: 'center' },
  { prop: 'status', label: '状态', width: 80, align: 'center', formatter: (_r: any, _c: any, v: any) => v === 1 ? '启用' : '停用' },
  { prop: 'createdAt', label: '创建时间', width: 170 },
]

// ---------- fetchApi ----------
async function fetchApi(params: any) {
  const res = await getPostList(params)
  return { rows: res.data.rows, total: res.data.total }
}

// ---------- 表单配置 ----------
const formConfig: FormConfig<PostVO> = {
  rule: [
    { type: 'input', field: 'postName', title: '岗位名称', validate: [{ required: true, message: '请输入岗位名称', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'postCode', title: '岗位编码', validate: [{ required: true, message: '请输入岗位编码', trigger: 'blur' }] } as Rule,
    { type: 'input', field: 'description', title: '岗位说明', props: { type: 'textarea', maxlength: 255, rows: 2, placeholder: '请输入岗位说明' } } as Rule,
    { type: 'inputNumber', field: 'sortOrder', title: '排序', value: 0, props: { min: 0, controlsPosition: 'right' } } as Rule,
    {
      type: 'select', field: 'status', title: '状态', value: 1,
      options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }],
    } as Rule,
  ],
  createApi: createPost,
  updateApi: (id, data) => updatePost(id as number, data),
  deleteApi: async (id) => { await deletePost(id as number) },
  getApi: async (id) => {
    const res = await getPostList({ page: 1, size: 999 })
    return res.data.rows.find((r: PostVO) => r.id === (id as number)) as PostVO
  },
  dialogTitle: { create: '新增岗位', edit: '编辑岗位' },
  createPermission: 'system:post:create',
  editPermission: 'system:post:update',
  deletePermission: 'system:post:delete',
}
</script>

<template>
  <SearchTable
    ref="searchTableRef"
    :search-fields="searchFields"
    :columns="columns"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />
</template>
