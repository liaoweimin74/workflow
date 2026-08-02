<template>
  <div class="process-list-page" style="display: flex; gap: 12px; height: calc(100vh - 140px)">
    <!-- 左侧：流程分类 -->
    <el-card style="width: 480px; flex-shrink: 0; overflow: hidden">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">流程分类</span>
      </template>
      <SearchTable
        ref="categoryTableRef"
        :search-fields="categorySearchFields"
        :columns="categoryColumns"
        :action-buttons="categoryActionButtons"
        :fetch-api="categoryFetchApi"
        :form-config="categoryFormConfig"
        :tree-props="{ rowKey: 'id', children: 'children', defaultExpandAll: true }"
        table-size="small"
        :max-visible-buttons="3"
        @row-click="handleCategoryClick"
      />
    </el-card>

    <!-- 右侧：流程列表 -->
    <el-card style="flex: 1; overflow: hidden">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">
          流程定义{{ selectedCategory ? ' - ' + selectedCategory.name : '' }}
        </span>
      </template>
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :form-config="formConfig"
        :default-page-size="20"
        :max-visible-buttons="4"
        table-size="small"
        @row-click="handleRowClick"
      >
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #lastDeployedAt="{ row }">
          {{ row.lastDeployedAt ? formatDate(row.lastDeployedAt) : '—' }}
        </template>
      </SearchTable>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { processDesignApi, type ProcessDraft } from '@/api/processDefinition'
import { categoryApi, type Category } from '@/api/category'

const router = useRouter()
const tableRef = ref()
const categoryTableRef = ref()
const selectedCategory = ref<Category | null>(null)

// ========== 流程分类 ==========
const categorySearchFields: SearchField[] = [
  { type: 'input', label: '名称', prop: 'name', placeholder: '搜索分类名称', style: 'width: 120px' },
]

const categoryColumns: TableColumn[] = [
  { prop: 'name', label: '分类名称', minWidth: 160 },
  { prop: 'sortOrder', label: '排序', width: 70, align: 'center' },
]

async function categoryFetchApi(params: any) {
  const res = await categoryApi.list()
  let list = res.data || []
  if (params.name) {
    list = list.filter((c: Category) => c.name?.includes(params.name))
  }
  return { rows: buildTree(list), total: list.length }
}

function buildTree(items: Category[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

const categoryFormConfig: FormConfig<Category> = {
  fields: [
    {
      type: 'tree-select',
      label: '父分类',
      prop: 'parentId',
      treeProps: { data: [], props: { label: 'name', value: 'id', children: 'children' } },
      placeholder: '不选则为顶级分类',
    },
    { type: 'input', label: '名称', prop: 'name', rules: [{ required: true, message: '请输入分类名称', trigger: 'blur' }] },
    { type: 'input', label: '排序', prop: 'sortOrder' } as any,
  ],
  dialogTitle: { create: '新建分类', edit: '编辑分类' },
  createPermission: 'process:category:create',
  editPermission: 'process:category:edit',
  deletePermission: 'process:category:delete',
  beforeCreate: async () => {
    const res = await categoryApi.list()
    const f = categoryFormConfig.fields.find(f => f.prop === 'parentId')
    if (f && f.treeProps) {
      f.treeProps.data = buildTree(res.data || [])
    }
    return true
  },
  beforeEdit: async (row: Category) => {
    const res = await categoryApi.list()
    const f = categoryFormConfig.fields.find(f => f.prop === 'parentId')
    if (f && f.treeProps) {
      // 排除自身及子节点，避免循环引用
      const tree = buildTree(res.data?.filter((c: Category) => c.id !== row.id) || [])
      f.treeProps.data = tree
    }
    return true
  },
  createApi: async (data: any) => {
    return await categoryApi.create({
      name: data.name,
      parentId: data.parentId || null,
      sortOrder: Number(data.sortOrder) || 0,
    })
  },
  updateApi: (id, data: any) => {
    return categoryApi.update(id as string, {
      name: data.name,
      parentId: data.parentId || null,
      sortOrder: Number(data.sortOrder) || 0,
    }) as any
  },
  deleteApi: (id) => categoryApi.delete(id as string) as any,
  getApi: async (id: any) => {
    const res = await categoryApi.list()
    return res.data?.find((c: Category) => c.id === id) ?? ({} as Category)
  },
  afterCreate: () => categoryTableRef.value?.fetchList(),
  afterUpdate: () => categoryTableRef.value?.fetchList(),
  afterDelete: () => {
    categoryTableRef.value?.fetchList()
    if (selectedCategory.value) {
      selectedCategory.value = null
      tableRef.value?.fetchList()
    }
  },
}

const categoryActionButtons: ActionButton[] = []

function handleCategoryClick(row: Category) {
  selectedCategory.value = row
  tableRef.value?.fetchList()
}

// ========== 流程定义 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '流程名称', prop: 'name', placeholder: '搜索流程名称', style: 'width: 200px' },
])

const columns: TableColumn[] = [
  { prop: 'name', label: '流程名称', minWidth: 180 },
  { prop: 'key', label: '流程标识', width: 180 },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '发布版本', width: 90, align: 'center' },
  { prop: 'lastDeployedAt', label: '发布时间', width: 180, slotName: 'lastDeployedAt' },
]

async function fetchApi(params: any) {
  const res = await processDesignApi.listDrafts({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    name: params.name || undefined,
    categoryId: selectedCategory.value?.id || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

const formConfig: FormConfig<ProcessDraft> = {
  fields: [
    { type: 'input', label: '流程名称', prop: 'name', rules: [{ required: true, message: '请输入流程名称', trigger: 'blur' }] },
    {
      type: 'input',
      label: '流程标识',
      prop: 'key',
      rules: [
        { required: true, message: '请输入流程标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' },
      ],
    },
    {
      type: 'tree-select',
      label: '分类',
      prop: 'categoryId',
      treeProps: { data: [], props: { label: 'name', value: 'id', children: 'children' } },
    },
  ],
  dialogTitle: { create: '新建流程' },
  createPermission: 'process:definition:create',
  beforeCreate: async () => {
    const res = await categoryApi.list()
    const f = formConfig.fields.find(f => f.prop === 'categoryId')
    if (f && f.treeProps) {
      f.treeProps.data = buildTree(res.data || [])
    }
    return true
  },
  createApi: async (data: any) => {
    const res = await processDesignApi.createDraft(data.name, data.key, data.categoryId || undefined)
    router.push({ path: '/designer', query: { id: res.data.id } })
    return res
  },
}

const actionButtons: ActionButton[] = [
  {
    label: '设计',
    size: 'small',
    onClick: (row: any) => {
      router.push({ path: '/designer', query: { id: row.id } })
    },
  },
  {
    label: '部署',
    size: 'small',
    type: 'primary',
    confirm: '确定要部署此流程吗？部署后将创建新的流程定义版本。',
    onClick: async (row: any) => {
      try {
        await processDesignApi.deploy(row.id)
        ElMessage.success('部署成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出后端返回的具体错误消息
      }
    },
  },
  {
    label: '复制',
    size: 'small',
    onClick: async (row: any) => {
      try {
        await processDesignApi.copyProcess(row.id)
        ElMessage.success('复制成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '删除',
    size: 'small',
    type: 'danger',
    confirm: '确定要删除此流程吗？',
    show: (row: any) => !row.deployId,
    onClick: async (row: any) => {
      try {
        await processDesignApi.deleteDraft(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
]

function handleRowClick(_row: any) {}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return '草稿'
    case 'MODIFIED': return '已修改'
    case 'DEPLOYED': return '已部署'
    default: return status
  }
}

function statusTagType(status: string): 'info' | 'success' | 'warning' {
  switch (status) {
    case 'DRAFT': return 'info'
    case 'MODIFIED': return 'warning'
    case 'DEPLOYED': return 'success'
    default: return 'info'
  }
}
</script>
