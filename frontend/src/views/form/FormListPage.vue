<template>
  <div class="form-list-page">
    <el-card style="overflow: hidden">
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :form-config="formConfig"
        :default-page-size="20"
        :max-visible-buttons="5"
      >
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #type="{ row }">
          <el-tag :type="row.type === 'BUSINESS' ? 'primary' : ''" size="small">
            {{ row.type === 'BUSINESS' ? '业务' : '工作流' }}
          </el-tag>
        </template>
        <template #publishedVersion="{ row }">
          {{ row.publishedVersion != null ? 'v' + row.publishedVersion : '—' }}
        </template>
        <template #referenced="{ row }">
          <el-tag
            v-if="row.type === 'BUSINESS' && referencedMap[row.key]?.count > 0"
            type="warning"
            size="small"
          >被 {{ referencedMap[row.key].count }} 个表单引用</el-tag>
          <span v-else>—</span>
        </template>
        <template #createdAt="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </SearchTable>
    </el-card>

    <!-- 版本历史弹窗 -->
    <el-dialog v-model="versionDialogVisible" title="版本历史" width="600px">
      <el-table :data="versionList" border size="small" v-loading="versionLoading">
        <el-table-column prop="version" label="版本" width="80" align="center">
          <template #default="{ row }">
            v{{ row.version }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="创建人" width="120" />
        <el-table-column prop="createdAt" label="创建时间" min-width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="versionDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'FormList' })

import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus as _Plus, EditPen, Grid, Promotion, Clock, Delete } from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { formApi, type FormDefinitionDTO, type FormVersionDTO } from '@/api/form'
import { bizDataApi } from '@/api/bizData'

const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 引用感知：{ formKey: { count, referencedBy } }，供徽标与删除警告 */
const referencedMap = ref<Record<string, { count: number; referencedBy: string[] }>>({})

onMounted(async () => {
  try {
    const res = await bizDataApi.referencedCount()
    referencedMap.value = res.data || {}
  } catch {
    // 统计失败不阻断列表
  }
})

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '表单名称', prop: 'name', placeholder: '搜索表单名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '工作流表单', value: 'WORKFLOW' },
      { label: '业务表单', value: 'BUSINESS' },
    ],
    style: 'width: 140px',
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '全部',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
      { label: '已归档', value: 'ARCHIVED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '表单名称', minWidth: 180 },
  { prop: 'key', label: '表单标识', width: 180 },
  { prop: 'type', label: '类型', width: 100, align: 'center', slotName: 'type' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'publishedVersion', label: '发布版本', width: 100, align: 'center', slotName: 'publishedVersion' },
  { prop: 'referenced', label: '被引用', width: 150, align: 'center', slotName: 'referenced' },
  { prop: 'version', label: '当前版本', width: 90, align: 'center' },
  { prop: 'createdAt', label: '创建时间', width: 180, slotName: 'createdAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await formApi.getFormDefinitions({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 创建表单 ==========
const formConfig = reactive<FormConfig<FormDefinitionDTO>>({
  rule: [
    {
      type: 'select',
      field: 'type',
      title: '表单类型',
      options: [
        { label: '工作流表单', value: 'WORKFLOW' },
        { label: '业务表单', value: 'BUSINESS' },
      ],
      value: 'WORKFLOW',
    },
    { type: 'input', field: 'name', title: '表单名称', validate: [{ required: true, message: '请输入表单名称', trigger: 'blur' }] },
    {
      type: 'input',
      field: 'key',
      title: '表单标识',
      validate: [
        { required: true, message: '请输入表单标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' },
      ],
    },
  ],
  dialogTitle: { create: '新建表单' },
  createPermission: 'form:create',
  createApi: async (data: any) => {
    const res = await formApi.createForm(data.name, data.key, data.type || 'WORKFLOW')
    router.push({ path: '/form/designer', query: { id: res.data.id } })
    return res
  },
})

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '设计',
    icon: EditPen,
    size: 'small',
    permission: 'form:edit',
    onClick: (row: any) => {
      router.push({ path: '/form/designer', query: { id: row.id } })
    },
  },
  {
    label: '管理数据',
    icon: Grid,
    size: 'small',
    type: 'primary',
    link: true,
    permission: 'form:list',
    show: (row: any) => row.type === 'BUSINESS' && row.status === 'PUBLISHED',
    onClick: (row: any) => {
      router.push({ path: `/biz-data/${row.key}` })
    },
  },
  {
    label: '发布',
    icon: Promotion,
    size: 'small',
    type: 'primary',
    permission: 'form:publish',
    confirm: '确定要发布此表单吗？',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      try {
        await formApi.publishFormDefinition(row.id)
        ElMessage.success('发布成功')
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
    permission: 'form:list',
    onClick: async (row: any) => {
      versionDialogVisible.value = true
      versionLoading.value = true
      try {
        const res = await formApi.getFormVersions(row.id)
        versionList.value = res.data || []
      } catch {
        // http 拦截器已弹出错误消息
      } finally {
        versionLoading.value = false
      }
    },
  },
  {
    label: '删除',
    icon: Delete,
    size: 'small',
    type: 'danger',
    permission: 'form:delete',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      const refInfo = referencedMap.value[row.key]
      const msg = refInfo && refInfo.count > 0
        ? `该表单被 ${refInfo.count} 个表单引用，删除后引用将无法解析。确定删除吗？`
        : '确定要删除此表单吗？'
      try {
        await ElMessageBox.confirm(msg, '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await formApi.deleteFormDefinition(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
]

// ========== 版本历史 ==========
const versionDialogVisible = ref(false)
const versionLoading = ref(false)
const versionList = ref<FormVersionDTO[]>([])

// ========== 工具函数 ==========
function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    DRAFT: 'warning',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>
