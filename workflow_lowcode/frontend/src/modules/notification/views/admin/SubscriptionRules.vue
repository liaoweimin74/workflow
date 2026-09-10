<script setup lang="ts">
defineOptions({ name: 'MessageSubscriptionRules' })

import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getSubscriptionRules, createSubscriptionRule, updateSubscriptionRule, deleteSubscriptionRule } from '../../api/admin'
import { ElMessage } from 'element-plus'
import { ref, computed, onMounted } from 'vue'
import { getEventDefinitions } from '../../api/event'

const eventOptions = ref<{ value: string; label: string }[]>([])
onMounted(async () => {
  const res = await getEventDefinitions({ page: 1, size: 200, enabled: true })
  const data = res.data as any
  eventOptions.value = (data?.rows || []).map((e: any) => ({
    value: e.eventCode,
    label: `${e.eventCode} - ${e.eventName}`,
  }))
})

const searchFields = computed<SearchField[]>(() => [
  { type: 'select', label: '事件', prop: 'eventCode', placeholder: '全部事件', options: eventOptions.value },
])

const channelOptions = [
  { value: 'IN_APP', label: '站内信' },
  { value: 'SMS', label: '短信' },
  { value: 'WECHAT_WORK', label: '企业微信' },
  { value: 'WECHAT_MINIPROGRAM', label: '小程序' },
  { value: 'APP', label: 'APP' },
]
const priorityOptions = [
  { value: 'LOW', label: '低' },
  { value: 'NORMAL', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'URGENT', label: '紧急' },
]

const columns: TableColumn[] = [
  { prop: 'eventCode', label: '事件代码', minWidth: 180 },
  { prop: 'action', label: '动作', width: 100, render: (row: any) => actionLabel(row.action) },
  {
    prop: 'channel', label: '渠道', width: 140,
    render: (row: any) => {
      const m: Record<string, string> = {
        IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信', WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
      }
      return m[row.channel] || row.channel || '--'
    },
  },
  {
    prop: 'priority', label: '优先级', width: 100,
    render: (row: any) => {
      const m: Record<string, string> = { LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急' }
      return m[row.priority] || row.priority || '--'
    },
  },
  {
    prop: 'enable', label: '状态', width: 100,
    render: (row: any) => (row.enable ? '启用' : '停用'),
  },
  { prop: 'condition', label: '条件', minWidth: 200, showOverflowTooltip: true },
  { prop: 'createdBy', label: '创建人', width: 120 },
]

async function fetchApi(params: any) {
  const res = await getSubscriptionRules({
    page: params.page || 1,
    size: params.size || 10,
    eventCode: params.eventCode,
  })
  const data = res.data as any
  return { rows: data?.rows || [], total: data?.total || 0 }
}

const formConfig: FormConfig = {
  rule: [
    {
      type: 'select', field: 'eventCode', title: '事件代码', options: eventOptions,
      validate: [{ required: true, message: '请输入事件代码', trigger: 'blur' }],
    },
    { type: 'select', field: 'channel', title: '渠道', options: channelOptions, value: 'IN_APP' },
    { type: 'select', field: 'priority', title: '优先级', options: priorityOptions, value: 'NORMAL' },
    {
      type: 'input', field: 'condition', title: '条件表达式',
      props: { type: 'textarea', rows: 3, placeholder: '如 user.role == \'ADMIN\'' },
    },
    { type: 'switch', field: 'enable', title: '启用', value: true },
    { type: 'select', field: 'action', title: '动作', options: [
      { value: 'ALLOW', label: '允许发送' },
      { value: 'DENY', label: '拒绝发送' },
      { value: 'FORCE', label: '强制发送' },
    ], value: 'ALLOW' },
  ] as Rule[],
  createApi: (data: any) => createSubscriptionRule(data) as any,
  updateApi: (id: number | string, data: any) => updateSubscriptionRule(id as number, data) as any,
  deleteApi: async (id: number | string) => {
    await deleteSubscriptionRule(id as number)
    ElMessage.success('删除成功')
  },
  dialogTitle: { create: '新建规则', edit: '编辑规则' },
}

function actionLabel(action?: string) {
  const labels: Record<string, string> = { ALLOW: '允许发送', DENY: '拒绝发送', FORCE: '强制发送' }
  return (action && labels[action]) || action || '--'
}
</script>

<template>
  <SearchTable
    :search-fields="searchFields"
    :columns="columns"
    :fetch-api="fetchApi"
    :form-config="formConfig"
  />
</template>
