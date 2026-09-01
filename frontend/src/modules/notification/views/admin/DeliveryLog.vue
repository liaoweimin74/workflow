<script setup lang="ts">
defineOptions({ name: 'MessageDeliveryLog' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { RefreshRight } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton, SearchField } from '@/components/business/types'
import { getDeliveryLogs, retryDelivery } from '../../api/admin'
import { ElMessage } from 'element-plus'

const channelMap: Record<string, string> = {
  IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信', WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
}

const searchFields: SearchField[] = [
  { prop: 'keyword', label: '标题', type: 'input', placeholder: '标题关键字' },
  { prop: 'recipient', label: '收件人', type: 'input', placeholder: '收件人用户名', style: 'width: 124px' },
  {
    prop: 'channel', label: '渠道', type: 'select', placeholder: '全部渠道', style: 'width: 110px',
    options: Object.entries(channelMap).map(([value, label]) => ({ value, label })),
  },
  { prop: 'timeRange', label: '时间段', type: 'date-range', time: true, placeholder: '发送时间范围' },
]

const columns: TableColumn[] = [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'title', label: '标题', minWidth: 240, showOverflowTooltip: true },
  {
    prop: 'recipients', label: '收件人', width: 160,
    render: (row: any) => {
      const recs = row.recipients || []
      if (recs.length === 0) return '--'
      const names = recs.map((r: any) => r.username || `#${r.userId}`)
      return `${names.join('、')}（${recs.length}人）`
    },
  },
  {
    prop: 'channel', label: '渠道', width: 110,
    render: (row: any) => channelMap[row.channel] || row.channel || '--',
  },
  {
    prop: 'status', label: '状态', width: 100,
    render: (row: any) => {
      const m: Record<string, string> = { SENT: '已发送', FAILED: '投递失败', PENDING: '重试中' }
      return m[row.status] || row.status || '--'
    },
  },
  { prop: 'createdAt', label: '发送时间', width: 180 },
]

async function fetchApi(params: any) {
  const [start, end] = Array.isArray(params.timeRange) ? params.timeRange : [undefined, undefined]
  const res = await getDeliveryLogs({
    page: (params.page || 1) - 1,
    size: params.size || 20,
    keyword: params.keyword || undefined,
    recipient: params.recipient || undefined,
    channel: params.channel || undefined,
    start: start || undefined,
    end: end || undefined,
  })
  const data = res.data as any
  return { rows: data?.rows || [], total: data?.total || 0 }
}

const actionButtons: ActionButton[] = [
  {
    label: '重发', icon: RefreshRight, size: 'small', link: true,
    show: (row: any) => row.status === 'FAILED',
    onClick: async (row: any) => {
      await retryDelivery(row.id)
      ElMessage.success('重发已触发')
      tableRef.value?.fetchList()
    },
  },
]

const tableRef = ref()
</script>

<template>
  <SearchTable
    ref="tableRef"
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :search-fields="searchFields"
    :show-search="true"
    :show-create-button="false"
  />
</template>
