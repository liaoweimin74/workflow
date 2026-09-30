<template>
  <!--
    Task 105：布局改版——左侧分类树表 → 顶部「分类胶囊条」（内联维护）。
    分类扁平无层级，点击胶囊筛选流程，「＋」新建 / 双击改名 / hover ✕ 删除。
  -->
  <!-- 高度用 100% 撑满 main（p-4 唯一决定四周留白），对齐用户管理 SearchTable 的布局标准 -->
  <div class="process-list-page" style="display: flex; gap: 12px; height: 100%">
    <el-card style="flex: 1; overflow: hidden">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">流程定义</span>
      </template>
      <CategoryChips
        v-model="selectedCategoryId"
        :categories="categories"
        @changed="onCategoriesChanged"
      />
      <div style="height: 12px" aria-hidden="true" />
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :form-config="formConfig"
        :default-page-size="20"
        :max-visible-buttons="6"
        table-size="small"
        @row-click="handleRowClick"
      >
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #category="{ row }">
          <el-tag v-if="categoryName(row.categoryId)" size="small" type="info" effect="plain">
            {{ categoryName(row.categoryId) }}
          </el-tag>
          <span v-else class="uncategorized">未分类</span>
        </template>
        <template #lastDeployedAt="{ row }">
          {{ row.lastDeployedAt ? formatDate(row.lastDeployedAt) : '—' }}
        </template>
      </SearchTable>
    </el-card>
  </div>

  <!-- 调整分类弹窗（Task 106）：saveDesign 仅传分类字段，其余保留原值；
       不选分类确认 = 清空（clearCategory，后端置 null） -->
  <el-dialog
    v-model="moveVisible"
    title="调整分类"
    width="420px"
    :close-on-click-modal="false"
  >
    <el-form label-width="80px" @submit.prevent>
      <el-form-item label="流程">
        <span style="font-weight: 600; word-break: break-all">{{ moveRow?.name || '—' }}</span>
      </el-form-item>
      <el-form-item label="分类">
        <el-select
          v-model="moveTarget"
          clearable
          placeholder="不归类（未分类）"
          style="width: 100%"
        >
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="moveVisible = false">取消</el-button>
      <el-button type="primary" :loading="moveSubmitting" @click="confirmMove">确定</el-button>
    </template>
  </el-dialog>

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
defineOptions({ name: 'ProcessDefinition' })

import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Upload, CopyDocument, Delete, Clock, FolderOpened } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { processDesignApi, deployedProcessApi, type ProcessDraft, type ProcessVersion } from '@/api/processDefinition'
import { categoryApi, type Category } from '@/api/category'
import { validateProcessXml } from '@/views/designer/utils/bpmnValidation'
import CategoryChips from './components/CategoryChips.vue'

const router = useRouter()
const tableRef = ref()

// ========== 分类胶囊（Task 105：扁平结构，无树形） ==========
const categories = ref<Category[]>([])
const selectedCategoryId = ref<string | null>(null)

async function loadCategories() {
  const res = await categoryApi.list()
  categories.value = res.data || []
}

onMounted(() => {
  loadCategories()
})

/** 切换分类胶囊 → 重新拉取流程表（SearchTable 不会因外部状态变化自动刷新） */
watch(selectedCategoryId, () => {
  tableRef.value?.fetchList()
})

/** 分类增删改后：重拉分类列表（流程表刷新由 selectedCategoryId 的 watch 兜底——
 *  删除当前选中分类时胶囊组件会回置为「全部」并触发 watch） */
function onCategoriesChanged() {
  loadCategories()
}

// ========== 版本历史抽屉 ==========
const versionDrawerVisible = ref(false)
const versionLoading = ref(false)
const versionRows = ref<ProcessVersion[]>([])
const versionDrawerTitle = ref('')

// ========== 流程定义 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '流程名称', prop: 'name', placeholder: '搜索流程名称', style: 'width: 200px' },
])

const columns: TableColumn[] = [
  { prop: 'name', label: '流程名称', minWidth: 180 },
  { prop: 'key', label: '流程标识', width: 180 },
  { prop: 'categoryId', label: '分类', width: 120, slotName: 'category' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'version', label: '发布版本', width: 90, align: 'center' },
  { prop: 'lastDeployedAt', label: '发布时间', width: 180, slotName: 'lastDeployedAt' },
]

/** 分类 id → 名称（表格分类列展示） */
const categoryNameMap = computed(() => {
  const m = new Map<string, string>()
  categories.value.forEach(c => m.set(c.id, c.name))
  return m
})

function categoryName(id?: string | null): string {
  return (id && categoryNameMap.value.get(id)) || ''
}

async function fetchApi(params: any) {
  const res = await processDesignApi.listDrafts({
    page: params.page || 1,
    size: params.size || 20,
    name: params.name || undefined,
    categoryId: selectedCategoryId.value || undefined,
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
      type: 'select',
      field: 'categoryId',
      title: '分类',
      props: { placeholder: '不选则为未分类', clearable: true },
      options: [],
    },
  ],
  dialogTitle: { create: '新建流程' },
  createPermission: 'process:definition:create',
  beforeCreate: async () => {
    await loadCategories()
    const r = formConfig.rule.find(r => r.field === 'categoryId')
    if (r) {
      r!.options = categories.value.map(c => ({ label: c.name, value: c.id }))
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
    onClick: async (row: any) => {
      try {
        // 发布前预校验（与设计器同一套规则）：阻断性错误直接拦截，
        // 避免后端引擎返回内部节点 ID 等不可读报错（如「没有出边，流程会走死」）
        const editorRes = await processDesignApi.loadEditor(row.id)
        const { error, warnings } = validateProcessXml(editorRes.data.bpmnXml, editorRes.data.nodeConfigs || {})
        if (error) {
          await ElMessageBox.alert(error, '无法部署，请先在流程设计器中修正', {
            type: 'error',
            confirmButtonText: '知道了',
            customStyle: { whiteSpace: 'pre-line' } as any
          })
          return
        }
        const tips = warnings.length
          ? `发现以下问题：\n${warnings.join('\n')}\n\n是否仍要继续部署？`
          : '确定要部署此流程吗？部署后将创建新的流程定义版本。'
        await ElMessageBox.confirm(tips, warnings.length ? '部署警告' : '确认部署', {
          type: 'warning'
        })
        await processDesignApi.deploy(row.id)
        ElMessage.success('部署成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出后端返回的具体错误消息；ElMessageBox 取消时静默
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
    label: '移动',
    icon: FolderOpened,
    size: 'small',
    permission: 'process:definition:create',
    onClick: openMove,
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

// ========== 调整分类弹窗（Task 106） ==========
const moveVisible = ref(false)
const moveRow = ref<ProcessDraft | null>(null)
const moveTarget = ref('')
const moveSubmitting = ref(false)

async function openMove(row: any) {
  moveRow.value = row
  moveTarget.value = row.categoryId || ''
  moveVisible.value = true
  // 弹窗选项与胶囊同源刷新（新建分类后无需刷新页面）
  await loadCategories()
}

async function confirmMove() {
  if (!moveRow.value || moveSubmitting.value) return
  moveSubmitting.value = true
  try {
    // 只传分类字段：saveDesign 对未传字段一律保留原值（不会碰 XML/名称）
    await processDesignApi.saveDesign(
      moveRow.value.id,
      moveTarget.value ? { categoryId: moveTarget.value } : { clearCategory: true },
    )
    ElMessage.success('分类已调整')
    moveVisible.value = false
    tableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    moveSubmitting.value = false
  }
}

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

<style scoped>
.uncategorized {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
