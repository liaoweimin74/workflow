<script setup lang="ts">
defineOptions({ name: 'MessageChannelConfig' })

import { ref } from 'vue'
import { SearchTable } from '@/components/business'
import { Aim, Setting } from '@element-plus/icons-vue'
import type { TableColumn, ActionButton } from '@/components/business/types'
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

// ========== 自定义配置对话框（按渠道类型动态字段） ==========
const configVisible = ref(false)
const configSaving = ref(false)
const currentChannel = ref<any>(null)

/** 各渠道的配置字段定义 */
const channelFieldDefs: Record<string, { key: string; label: string; type?: 'password'; placeholder?: string }[]> = {
  SMS: [
    { key: 'url', label: '网关地址', placeholder: 'https://sms-gateway.example.com/send' },
    { key: 'apiKey', label: 'API Key' },
    { key: 'apiSecret', label: 'API Secret', type: 'password' },
    { key: 'signName', label: '签名名称', placeholder: '如：工作流平台' },
  ],
  WECHAT_WORK: [
    { key: 'corpId', label: '企业 ID (CorpId)' },
    { key: 'corpSecret', label: '企业密钥 (CorpSecret)', type: 'password' },
    { key: 'agentId', label: '应用 ID (AgentId)' },
  ],
  WECHAT_MINIPROGRAM: [
    { key: 'appId', label: '小程序 AppID' },
    { key: 'appSecret', label: '小程序 AppSecret', type: 'password' },
    { key: 'templateId', label: '订阅消息模板 ID' },
  ],
  IN_APP: [],
  APP: [],
}

const configValues = ref<Record<string, string>>({})

function openConfig(row: any) {
  currentChannel.value = row
  configValues.value = {}
  configVisible.value = true
}

async function handleConfigSave() {
  if (!currentChannel.value) return
  configSaving.value = true
  try {
    // 只提交非空字段
    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(configValues.value)) {
      if (v) payload[k] = v
    }
    await updateChannelConfig(currentChannel.value.id, payload)
    ElMessage.success('渠道配置已保存')
    configVisible.value = false
  } finally {
    configSaving.value = false
  }
}

const actionButtons: ActionButton[] = [
  {
    label: '配置', icon: Setting, size: 'small', link: true,
    show: (row: any) => row.type !== 'IN_APP' && row.type !== 'APP',
    onClick: openConfig,
  },
  {
    label: '测试', icon: Aim, size: 'small', link: true,
    onClick: async (row: any) => {
      try {
        await testChannel(row.id)
        ElMessage.success('渠道测试通过')
      } catch {
        // http 拦截器已弹出错误消息（渠道未配置/测试失败）
      }
    },
  },
]
</script>

<template>
  <div>
    <SearchTable
      :columns="columns"
      :action-buttons="actionButtons"
      :fetch-api="fetchApi"
      :show-search="false"
      :show-create-button="false"
    />

    <!-- 渠道配置对话框：按渠道类型动态渲染字段 -->
    <el-dialog
      v-model="configVisible"
      :title="`${currentChannel?.name || ''} 渠道配置`"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="140px">
        <el-form-item
          v-for="field in channelFieldDefs[currentChannel?.type] || []"
          :key="field.key"
          :label="field.label"
        >
          <el-input
            v-model="configValues[field.key]"
            :type="field.type || 'text'"
            :placeholder="field.placeholder || '请输入'"
            show-password
          />
        </el-form-item>
        <el-form-item v-if="(channelFieldDefs[currentChannel?.type] || []).length === 0">
          <span style="color: #909399">该渠道无需配置</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" :loading="configSaving" @click="handleConfigSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
