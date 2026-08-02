<template>
  <div class="process-list-page">
    <SearchTable
      ref="tableRef"
      :search-fields="searchFields"
      :columns="columns"
      :action-buttons="actionButtons"
      :fetch-api="fetchApi"
      :form-config="formConfig"
      :default-page-size="20"
      :max-visible-buttons="4"
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { processDesignApi, type ProcessDraft } from '@/api/processDefinition'
import { categoryApi, type Category } from '@/api/category'

const router = useRouter()
const tableRef = ref()

const categoryOptions = ref<Category[]>([])

onMounted(async () => {
  try {
    const res = await categoryApi.list()
    categoryOptions.value = buildTree(res.data || [])
  } catch {
    // ignore
  }
})

function buildTree(items: Category[]): any[] {
  const map = new Map<string, any>()
  const roots: any[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

// ========== 搜索字段 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '流程名称', prop: 'name', placeholder: '搜索流程名称', style: 'width: 200px' },
  {
    type: 'tree-select',
    label: '分类',
    prop: 'categoryId',
    placeholder: '选择分类',
    style: 'width: 200px',
    treeProps: {
      data: categoryOptions.value,
      props: { label: 'name', value: 'id', children: 'children' }
    }
  }
])

// ========== 表格列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '流程名称', minWidth: 180 },
  { prop: 'key', label: '流程标识', width: 180 },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '发布版本', width: 90, align: 'center' },
  { prop: 'lastDeployedAt', label: '发布时间', width: 180, slotName: 'lastDeployedAt' }
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await processDesignApi.listDrafts({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    name: params.name || undefined,
    categoryId: params.categoryId || undefined
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0
  }
}

// ========== 新建流程表单 ==========
const formConfig: FormConfig<ProcessDraft> = {
  fields: [
    { type: 'input', label: '流程名称', prop: 'name', rules: [{ required: true, message: '请输入流程名称', trigger: 'blur' }] },
    {
      type: 'input',
      label: '流程标识',
      prop: 'key',
      rules: [
        { required: true, message: '请输入流程标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' }
      ]
    },
    {
      type: 'tree-select',
      label: '分类',
      prop: 'categoryId',
      treeProps: { data: [], props: { label: 'name', value: 'id', children: 'children' } }
    }
  ],
  dialogTitle: { create: '新建流程' },
  createPermission: 'process:definition:create',
  beforeCreate: async () => {
    // 刷新分类树
    const f = formConfig.fields.find(f => f.prop === 'categoryId')
    if (f && f.treeProps) {
      f.treeProps.data = categoryOptions.value
    }
    return true
  },
  createApi: async (data: any) => {
    const res = await processDesignApi.createDraft(data.name, data.key, data.categoryId || undefined)
    // 创建后直接跳转设计器
    router.push({ path: '/designer', query: { id: res.data.id } })
    return res
  }
}

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '设计',
    size: 'small',
    onClick: (row: any) => {
      router.push({ path: '/designer', query: { id: row.id } })
    }
  },
  {
    label: '部署',
    size: 'small',
    confirm: '确定要部署此流程吗？部署后将创建新的流程定义版本。',
    onClick: async (row: any) => {
      try {
        await processDesignApi.deploy(row.id)
        ElMessage.success('部署成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出后端返回的具体错误消息
      }
    }
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
    }
  },
  {
    label: '删除',
    size: 'small',
    confirm: '确定要删除此流程吗？',
    onClick: async (row: any) => {
      try {
        await processDesignApi.deleteDraft(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    }
  }
]

function handleRowClick(_row: any) {
  // 可扩展：点击行跳转详情
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 状态标签文字 */
function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return '草稿'
    case 'MODIFIED': return '已修改'
    case 'DEPLOYED': return '已部署'
    default: return status
  }
}

/** 状态标签类型 */
function statusTagType(status: string): 'info' | 'success' | 'warning' {
  switch (status) {
    case 'DRAFT': return 'info'
    case 'MODIFIED': return 'warning'
    case 'DEPLOYED': return 'success'
    default: return 'info'
  }
}
</script>

