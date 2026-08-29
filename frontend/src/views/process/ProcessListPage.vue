<template>
  <div class="process-list-page" style="display: flex; gap: 12px; height: calc(100vh - 140px)">
    <!-- 左侧：流程分类（可折叠） -->
    <el-card class="category-card" :style="categoryCardStyle" style="flex-shrink: 0; overflow: hidden">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span v-show="!categoryCollapsed" style="font-weight: bold; font-size: 14px">流程分类</span>
          <el-button
            class="category-collapse-btn"
            link
            :icon="categoryCollapsed ? Expand : Fold"
            :title="categoryCollapsed ? '展开分类' : '折叠分类'"
            @click="categoryCollapsed = !categoryCollapsed"
          />
        </div>
      </template>
      <SearchTable
        v-show="!categoryCollapsed"
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
      <!-- 折叠后的展开按钮 -->
      <div v-if="categoryCollapsed" class="category-expand-btn" style="display: flex; justify-content: center; padding-top: 4px">
        <el-button link :icon="Expand" title="展开分类" @click="categoryCollapsed = false" />
      </div>
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
        :max-visible-buttons="5"
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

  <!-- 版本历史抽屉 -->
  <el-drawer
    v-model="versionDrawerVisible"
    :title="`${versionDrawerTitle} · 版本历史`"
    size="420px"
  >
    <div v-loading="versionLoading">
      <el-table :data="versionRows" size="small" @row-click="openVersionViewer" style="cursor: pointer">
        <el-table-column prop="version" label="版本" width="70" align="center">
          <template #default="{ row }">
            <span>v{{ row.version }}</span>
            <el-tag v-if="row.latest" size="small" type="success" style="margin-left: 4px">最新</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deploymentTime" label="部署时间" min-width="140">
          <template #default="{ row }">
            {{ row.deploymentTime ? formatDate(row.deploymentTime) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default>
            <el-button link type="primary" size="small">查看</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无历史版本" :image-size="60" />
        </template>
      </el-table>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Upload, CopyDocument, Delete, Fold, Expand, Clock } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { processDesignApi, deployedProcessApi, type ProcessDraft, type ProcessVersion } from '@/api/processDefinition'
import { categoryApi, type Category } from '@/api/category'

const router = useRouter()
const tableRef = ref()
const categoryTableRef = ref()
const selectedCategory = ref<Category | null>(null)

// ========== 流程分类折叠 ==========
const categoryCollapsed = ref(false)
const categoryCardStyle = computed(() => ({
  width: categoryCollapsed.value ? '40px' : '480px',
}))

// ========== 版本历史抽屉 ==========
const versionDrawerVisible = ref(false)
const versionLoading = ref(false)
const versionRows = ref<ProcessVersion[]>([])
const versionDrawerTitle = ref('')

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

const categoryFormConfig = reactive<FormConfig<Category>>({
  rule: [
    {
      type: 'treeSelect',
      field: 'parentId',
      title: '父分类',
      props: { data: [] as any[], props: { label: 'name', value: 'id', children: 'children' }, placeholder: '不选则为顶级分类', checkStrictly: true, clearable: true },
    },
    { type: 'input', field: 'name', title: '名称', validate: [{ required: true, message: '请输入分类名称', trigger: 'blur' }] },
    { type: 'input', field: 'sortOrder', title: '排序' },
  ],
  dialogTitle: { create: '新建分类', edit: '编辑分类' },
  createPermission: 'process:category:create',
  editPermission: 'process:category:update',
  deletePermission: 'process:category:delete',
  beforeCreate: async () => {
    const res = await categoryApi.list()
    const r = categoryFormConfig.rule.find(r => r.field === 'parentId')
    if (r) {
      r!.props!.data = buildTree(res.data || [])
    }
    return true
  },
  beforeEdit: async (row: Category) => {
    const res = await categoryApi.list()
    const r = categoryFormConfig.rule.find(r => r.field === 'parentId')
    if (r) {
      r!.props!.data = buildTree(res.data?.filter((c: Category) => c.id !== row.id) || [])
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
})

const categoryActionButtons: ActionButton[] = [
  {
    label: '添加子分类',
    icon: Plus,
    link: true,
    permission: 'process:category:create',
    show: (row: any) => !!row.id,
    onClick: (row: any) => {
      categoryTableRef.value?.openFormDialog({ parentId: row.id })
    },
  },
]

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

const formConfig = reactive<FormConfig<ProcessDraft>>({
  rule: [
    { type: 'input', field: 'name', title: '流程名称', validate: [{ required: true, message: '请输入流程名称', trigger: 'blur' }] },
    {
      type: 'input',
      field: 'key',
      title: '流程标识',
      validate: [
        { required: true, message: '请输入流程标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' },
      ],
    },
    {
      type: 'treeSelect',
      field: 'categoryId',
      title: '分类',
      props: { data: [] as any[], props: { label: 'name', value: 'id', children: 'children' }, checkStrictly: true, clearable: true },
    },
  ],
  dialogTitle: { create: '新建流程' },
  createPermission: 'process:definition:create',
  beforeCreate: async () => {
    const res = await categoryApi.list()
    const r = formConfig.rule.find(r => r.field === 'categoryId')
    if (r) {
      r!.props!.data = buildTree(res.data || [])
    }
    return true
  },
  createApi: async (data: any) => {
    const res = await processDesignApi.createDraft(data.name, data.key, data.categoryId || undefined)
    router.push({ path: '/designer', query: { id: res.data.id } })
    return res
  },
})

const actionButtons: ActionButton[] = [
  {
    label: '设计',
    icon: Edit,
    size: 'small',
    permission: 'process:definition:create',
    onClick: (row: any) => {
      router.push({ path: '/designer', query: { id: row.id } })
    },
  },
  {
    label: '部署',
    icon: Upload,
    size: 'small',
    type: 'primary',
    permission: 'process:definition:deploy',
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
    icon: CopyDocument,
    size: 'small',
    permission: 'process:definition:create',
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
    label: '版本',
    icon: Clock,
    size: 'small',
    show: (row: any) => !!row.deployId,
    onClick: (row: any) => {
      openVersionHistory(row)
    },
  },
  {
    label: '删除',
    icon: Delete,
    size: 'small',
    type: 'danger',
    permission: 'process:definition:delete',
    confirm: '确定要删除此流程吗？',
    show: (row: any) => !row.version,
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

/** 打开版本历史抽屉，加载该流程 key 的全部已部署版本 */
async function openVersionHistory(row: any) {
  versionDrawerTitle.value = row.name || row.key || ''
  versionDrawerVisible.value = true
  versionLoading.value = true
  versionRows.value = []
  try {
    const res = await deployedProcessApi.getVersions(row.key)
    versionRows.value = res.data || []
  } catch {
    versionRows.value = []
  } finally {
    versionLoading.value = false
  }
}

/** 点击某版本 → 跳转只读设计器查看该版本的流程图与配置快照 */
function openVersionViewer(row: ProcessVersion) {
  router.push({ path: '/designer', query: { procDefId: row.procDefId, readonly: '1' } })
}

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
