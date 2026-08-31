<script setup lang="ts">
defineOptions({ name: 'MessageDeliveryLog' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { RefreshRight } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton } from '@/components/business/types'
import { getDeliveryLogs, retryDelivery } from '../../api/admin'
import { ElMessage } from 'element-plus'

const columns: TableColumn[] = [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'recipientId', label: '收件人ID', width: 120 },
  {
    prop: 'channel', label: '渠道', width: 120,
    render: (row: any) => {
      const m: Record<string, string> = {
        IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信', WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
      }
      return m[row.channel] || row.channel || '--'
    },
  },
  { prop: 'status', label: '状态', width: 100 },
  { prop: 'retryCount', label: '重试次数', width: 100 },
  { prop: 'lastError', label: '错误信息', minWidth: 200, showOverflowTooltip: true },
  { prop: 'createdAt', label: '创建时间', width: 180 },
]

async function fetchApi(params: any) {
  const res = await getDeliveryLogs({
    page: (params.page || 1) - 1,
    size: params.size || 20,
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
    :show-search="false"
    :show-create-button="false"
  />
</template>
