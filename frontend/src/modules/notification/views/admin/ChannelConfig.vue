<template>
  <div class="channel-config">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>渠道管理</span>
        </div>
      </template>
      <el-table :data="channels" v-loading="loading" stripe>
        <el-table-column prop="name" label="渠道名称" width="180" />
        <el-table-column prop="type" label="渠道类型" width="160">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="successRate" label="成功率" width="120">
          <template #default="{ row }">
            <span :class="row.successRate >= 95 ? 'text-green-600' : 'text-red-600'">
              {{ row.successRate ?? '--' }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="avgLatency" label="平均延迟" width="120">
          <template #default="{ row }">
            {{ row.avgLatency ? row.avgLatency + 'ms' : '--' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleConfig(row)">配置</el-button>
            <el-button type="warning" link @click="handleTest(row)">测试</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 配置弹窗 -->
    <el-dialog v-model="configVisible" title="渠道配置" width="500px">
      <el-form v-if="currentChannel" label-width="120px">
        <el-form-item label="API Key">
          <el-input v-model="configForm.apiKey" placeholder="API Key" />
        </el-form-item>
        <el-form-item label="API Secret">
          <el-input v-model="configForm.apiSecret" type="password" show-password placeholder="API Secret" />
        </el-form-item>
        <el-form-item label="签名/应用ID">
          <el-input v-model="configForm.extra" placeholder="签名名称 或 Agent ID 或 App ID" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { getChannels, updateChannelConfig, testChannel } from '../../api/admin'
import { ElMessage } from 'element-plus'

interface Channel {
  id: number
  name: string
  type: string
  enabled: boolean
  successRate?: number
  avgLatency?: number
}

const channels = ref<Channel[]>([])
const loading = ref(false)
const configVisible = ref(false)
const currentChannel = ref<Channel | null>(null)
const configForm = reactive({ apiKey: '', apiSecret: '', extra: '' })

onMounted(() => { fetchChannels() })

async function fetchChannels() {
  loading.value = true
  try {
    const res = await getChannels()
    channels.value = (res.data as any) || []
  } finally {
    loading.value = false
  }
}

function handleConfig(row: Channel) {
  currentChannel.value = row
  configForm.apiKey = ''
  configForm.apiSecret = ''
  configForm.extra = ''
  configVisible.value = true
}

async function handleSaveConfig() {
  if (!currentChannel.value) return
  await updateChannelConfig(currentChannel.value.id, configForm)
  ElMessage.success('配置已保存')
  configVisible.value = false
}

async function handleTest(row: Channel) {
  try {
    await testChannel(row.id)
    ElMessage.success('渠道测试通过')
  } catch {
    ElMessage.error('渠道测试失败')
  }
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
