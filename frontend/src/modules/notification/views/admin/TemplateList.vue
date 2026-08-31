<script setup lang="ts">
defineOptions({ name: 'MessageTemplateList' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { Switch } from '@element-plus/icons-vue'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getTemplates, createTemplate, updateTemplate, toggleTemplate } from '../../api/admin'
import { ElMessage } from 'element-plus'

const tableRef = ref()

const searchFields: SearchField[] = [
  { type: 'input', label: '模板名称', prop: 'name', placeholder: '输入模板名称' },
  { type: 'input', label: '模板编码', prop: 'templateCode', placeholder: '输入模板编码' },
]

const columns: TableColumn[] = [
  { prop: 'templateCode', label: '模板编码', width: 180 },
  { prop: 'name', label: '模板名称', minWidth: 200 },
  {
    prop: 'channel', label: '渠道', width: 120,
    render: (row: any) => channelLabel(row.channel),
  },
  {
    prop: 'priority', label: '优先级', width: 100,
    render: (row: any) => row.priority || '--',
  },
  {
    prop: 'isSystem', label: '系统模板', width: 100,
    render: (row: any) => (row.isSystem ? '是' : '否'),
  },
]

function channelLabel(channel: string) {
  const map: Record<string, string> = {
    IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信',
    WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
  }
  return map[channel] || channel || '--'
}

async function fetchApi(params: any) {
  const res = await getTemplates()
  let list = (res.data as any[]) || []
  if (params.name) list = list.filter((t: any) => t.name?.includes(params.name))
  if (params.templateCode) list = list.filter((t: any) => t.templateCode?.includes(params.templateCode))
  const total = list.length
  const page = params.page || 1
  const size = params.size || 10
  return { rows: list.slice((page - 1) * size, page * size), total }
}

const channelOptions = [
  { value: 'IN_APP', label: '站内信' },
  { value: 'SMS', label: '短信' },
  { value: 'WECHAT_WORK', label: '企业微信' },
  { value: 'WECHAT_MINIPROGRAM', label: '小程序' },
  { value: 'APP', label: 'APP' },
]
const priorityOptions = [
  { value: 'NORMAL', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'URGENT', label: '紧急' },
  { value: 'LOW', label: '低' },
]
const categoryOptions = [
  { value: 'WORKFLOW', label: '流程' },
  { value: 'TASK', label: '任务' },
  { value: 'APPROVAL', label: '审批' },
  { value: 'NOTIFICATION', label: '通知' },
  { value: 'SYSTEM', label: '系统' },
]

const formConfig: FormConfig = {
  rule: [
    {
      type: 'input', field: 'templateCode', title: '模板编码',
      validate: [{ required: true, message: '请输入模板编码', trigger: 'blur' }],
    },
    {
      type: 'input', field: 'name', title: '模板名称',
      validate: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
    },
    {
      type: 'input', field: 'title', title: '标题模板',
      props: { placeholder: '支持变量：${变量名}' },
      update: (val: any, _r: any, fApi: any) => fApi.setValue('titlePreview', previewText(val)),
    },
    {
      type: 'input', field: 'content', title: '内容模板',
      props: { type: 'textarea', rows: 6, placeholder: '支持变量：${变量名}' },
      update: (val: any, _r: any, fApi: any) => fApi.setValue('contentPreview', previewText(val)),
    },
    { type: 'select', field: 'channel', title: '渠道', options: channelOptions, value: 'IN_APP' },
    { type: 'select', field: 'priority', title: '优先级', options: priorityOptions, value: 'NORMAL' },
    { type: 'select', field: 'category', title: '类别', options: categoryOptions, value: 'WORKFLOW' },
    { type: 'switch', field: 'isSystem', title: '系统模板', value: false },
    { type: 'input', field: 'titlePreview', title: '标题预览', props: { readonly: true, placeholder: '输入标题模板后自动预览' } },
    { type: 'input', field: 'contentPreview', title: '内容预览', props: { type: 'textarea', readonly: true, rows: 4, placeholder: '输入内容模板后自动预览' } },
  ] as Rule[],
  createApi: (data: any) => createTemplate(stripPreview(data)) as any,
  updateApi: (id: number | string, data: any) => updateTemplate(id as number, stripPreview(data)) as any,
  dialogTitle: { create: '新建模板', edit: '编辑模板' },
  dialogWidth: '640px',
}

/** 提交前剥离只读预览字段 */
function stripPreview(data: any) {
  const { titlePreview, contentPreview, ...rest } = data || {}
  return rest
}

/** 将 ${变量} 转为 [变量] 展示，模拟渲染效果 */
function previewText(text?: string) {
  if (!text) return ''
  return text.replace(/\$\{(\w+)\}/g, '[$1]')
}

const actionButtons: ActionButton[] = [
  {
    label: '启用/停用', icon: Switch, size: 'small', link: true,
    onClick: async (row: any) => {
      await toggleTemplate(row.id)
      ElMessage.success('操作成功')
      tableRef.value?.fetchList()
    },
  },
]
</script>

<template>
  <SearchTable
    ref="tableRef"
    :search-fields="searchFields"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />
</template>
