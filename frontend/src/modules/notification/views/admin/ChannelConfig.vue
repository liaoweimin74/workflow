<script setup lang="ts">
defineOptions({ name: 'MessageChannelConfig' })

import { SearchTable } from '@/components/business'
import { Aim } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import type { Rule } from '@form-create/element-ui'
import { getChannels, updateChannelConfig, testChannel } from '../../api/admin'
import { ElMessage } from 'element-plus'

const columns: TableColumn[] = [
  { prop: 'name', label: '渠道名称', minWidth: 180 },
  {
    prop: 'type', label: '渠道类型', width: 160,
    render: (row: any) => channelTypeLabel(row.type),
  },
  {
    prop: 'enabled', label: '状态', width: 100,
    render: (row: any) => (row.enabled ? '启用' : '停用'),
  },
  {
    prop: 'successRate', label: '成功率', width: 120,
    render: (row: any) => (row.successRate != null ? `${row.successRate}%` : '--'),
  },
  {
    prop: 'avgLatency', label: '平均延迟', width: 120,
    render: (row: any) => (row.avgLatency ? `${row.avgLatency}ms` : '--'),
  },
]

function channelTypeLabel(type: string) {
  const m: Record<string, string> = {
    IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信', WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
  }
  return m[type] || type || '--'
}

async function fetchApi(params: any) {
  const res = await getChannels()
  const list = (res.data as any[]) || []
  // 本地分页（后端返回全量数组）
  const total = list.length
  const page = params.page || 1
  const size = params.size || 10
  return { rows: list.slice((page - 1) * size, page * size), total }
}

const formConfig: FormConfig = {
  rule: [
    { type: 'input', field: 'apiKey', title: 'API Key', props: { placeholder: 'API Key' } },
    { type: 'input', field: 'apiSecret', title: 'API Secret', props: { type: 'password', showPassword: true, placeholder: 'API Secret' } },
    { type: 'input', field: 'extra', title: '签名/应用ID', props: { placeholder: '签名名称 或 Agent ID 或 App ID' } },
  ] as Rule[],
  updateApi: (id: number | string, data: any) => updateChannelConfig(id as number, data) as any,
  dialogTitle: { edit: '渠道配置' },
}

const actionButtons: ActionButton[] = [
  {
    label: '测试', icon: Aim, size: 'small', link: true,
    onClick: async (row: any) => {
      try {
        await testChannel(row.id)
        ElMessage.success('渠道测试通过')
      } catch {
        ElMessage.error('渠道测试失败')
      }
    },
  },
]
</script>

<template>
  <SearchTable
    :columns="columns"
    :action-buttons="actionButtons"
    :fetch-api="fetchApi"
    :form-config="formConfig"
    :show-search="false"
    :show-create-button="false"
  />
</template>
