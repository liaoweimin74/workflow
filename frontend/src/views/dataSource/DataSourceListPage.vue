<template>
  <div class="data-source-list-page">
    <el-card style="overflow: hidden">
      <template #header>
        <span style="font-weight: bold; font-size: 14px">数据源管理</span>
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
      >
        <template #type="{ row }">
          <el-tag :type="typeTagType(row.type)" size="small">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
        <template #bound="{ row }">
          <span>{{ row.formKey || row.sourceKey || '—' }}</span>
        </template>
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #updatedAt="{ row }">
          {{ formatDate(row.updatedAt) }}
        </template>
      </SearchTable>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import { formApi, type FormDefinitionDTO } from '@/api/form'

const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 已发布业务表单（FORM 类型数据源 formKey 下拉候选） */
const publishedForms = ref<FormDefinitionDTO[]>([])

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '数据源名称', prop: 'name', placeholder: '搜索数据源名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '业务表单', value: 'FORM' },
      { label: '系统结构', value: 'SYSTEM' },
      { label: '第三方 API', value: 'API' },
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
      { label: '已启用', value: 'ENABLED' },
      { label: '已禁用', value: 'DISABLED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '数据源名称', minWidth: 180 },
  { prop: 'type', label: '类型', width: 110, align: 'center', slotName: 'type' },
  { prop: 'bound', label: '绑定对象', minWidth: 160, slotName: 'bound' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'updatedAt', label: '最近更新时间', width: 170, slotName: 'updatedAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await dataSourceApi.getDataSources({
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

// ========== 创建/编辑弹窗 ==========
/** 类型联动：type 单选变化时通过 form-create control 显示对应字段组 */
const formConfig = reactive<FormConfig<DataSourceDTO>>({
  rule: [
    { type: 'input', field: 'name', title: '数据源名称', validate: [{ required: true, message: '请输入数据源名称', trigger: 'blur' }] },
    {
      type: 'radio',
      field: 'type',
      title: '数据源类型',
      options: [
        { label: '业务表单', value: 'FORM' },
        { label: '系统结构', value: 'SYSTEM' },
        { label: '第三方 API', value: 'API' },
      ],
      value: 'FORM',
      control: [
        {
          value: 'FORM',
          rule: [
            {
              type: 'select',
              field: 'formKey',
              title: '绑定表单',
              options: [] as { label: string; value: string }[],
              props: { clearable: true, placeholder: '选择已发布的业务表单' },
              validate: [{ required: true, message: '请选择绑定的业务表单', trigger: 'change' }],
            },
          ],
        },
        {
          value: 'SYSTEM',
          rule: [
            {
              type: 'select',
              field: 'sourceKey',
              title: '系统结构',
              options: [
                { label: '部门树', value: 'dept-tree' },
                { label: '用户树', value: 'user-tree' },
              ],
              validate: [{ required: true, message: '请选择系统结构', trigger: 'change' }],
            },
          ],
        },
        {
          value: 'API',
          rule: [
            { type: 'input', field: 'sourceKey', title: '接口标识', validate: [{ required: true, message: '请输入接口标识', trigger: 'blur' }] },
            {
              type: 'textarea',
              field: 'params',
              title: '静态参数 JSON',
              props: { rows: 4, placeholder: '可选，JSON 格式，如 {"apiKey":"xxx"}' },
            },
          ],
        },
      ],
    },
  ],
  dialogTitle: { create: '新建数据源', edit: '编辑数据源' },
  createPermission: 'data-source:manage',
  editPermission: 'data-source:manage',
  deletePermission: 'data-source:manage',
  getApi: async (id) => {
    const res = await dataSourceApi.getDataSource(String(id))
    return res.data
  },
  createApi: async (data: any) => {
    return dataSourceApi.createDataSource(normalizePayload(data))
  },
  updateApi: async (id, data: any) => {
    return dataSourceApi.updateDataSource(String(id), normalizePayload(data))
  },
})

/** 按类型归一化提交载荷：FORM→formKey；SYSTEM/API→sourceKey（+params） */
function normalizePayload(data: any): any {
  return {
    name: data.name,
    type: data.type || 'FORM',
    formKey: data.type === 'FORM' ? data.formKey || null : null,
    sourceKey: data.type !== 'FORM' ? data.sourceKey || null : null,
    params: data.params || null,
  }
}

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '启用',
    size: 'small',
    type: 'primary',
    permission: 'data-source:manage',
    show: (row: any) => row.status !== 'ENABLED',
    onClick: async (row: any) => {
      try {
        await dataSourceApi.enableDataSource(row.id)
        ElMessage.success('启用成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '禁用',
    size: 'small',
    permission: 'data-source:manage',
    show: (row: any) => row.status === 'ENABLED',
    onClick: async (row: any) => {
      try {
        await dataSourceApi.disableDataSource(row.id)
        ElMessage.success('禁用成功')
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
    permission: 'data-source:manage',
    onClick: async (row: any) => {
      try {
        await ElMessageBox.confirm('确定要删除此数据源吗？', '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await dataSourceApi.deleteDataSource(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息（如"请先禁用"）
      }
    },
  },
]

// ========== 工具函数 ==========
function typeTagType(type: string): '' | 'primary' | 'success' | 'warning' {
  const map: Record<string, '' | 'primary' | 'success' | 'warning'> = {
    FORM: 'primary',
    SYSTEM: 'success',
    API: 'warning',
  }
  return map[type] || ''
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    FORM: '业务表单',
    SYSTEM: '系统结构',
    API: '第三方 API',
  }
  return map[type] || type
}

function statusTagType(status: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
    DRAFT: 'warning',
    ENABLED: 'success',
    DISABLED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    ENABLED: '已启用',
    DISABLED: '已禁用',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ========== 初始化：加载已发布业务表单（FORM 类型 formKey 下拉候选） ==========
onMounted(async () => {
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    const data = res.data as any
    publishedForms.value = data.content || data.rows || []
    // formKey select 位于 type 字段 control 的 FORM 分支中
    const typeRule = formConfig.rule.find((r: any) => r.field === 'type') as any
    const formControl = (typeRule?.control || []).find((c: any) => c.value === 'FORM')
    const formKeyRule = (formControl?.rule || []).find((r: any) => r.field === 'formKey')
    if (formKeyRule) {
      formKeyRule.options = publishedForms.value.map((f) => ({ label: f.name, value: f.key }))
    }
  } catch {
    // 表单加载失败不阻断列表
  }
})
</script>