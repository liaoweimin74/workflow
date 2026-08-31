<template>
  <div class="delivery-log">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>发送记录</span>
        </div>
      </template>
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="recipientId" label="收件人ID" width="120" />
        <el-table-column prop="channel" label="渠道" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'SENT' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="retryCount" label="重试次数" width="100" />
        <el-table-column prop="lastError" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button v-if="row.status === 'FAILED'" type="warning" link @click="handleRetry(row)">重发</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="20"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="fetchLogs"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDeliveryLogs, retryDelivery } from '../../api/admin'
import { ElMessage } from 'element-plus'

const logs = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const currentPage = ref(1)

onMounted(() => {
  fetchLogs()
})

async function fetchLogs(page = 1) {
  loading.value = true
  try {
    const res = await getDeliveryLogs({ page: page - 1, size: 20 })
    const data = res.data as any
    logs.value = data?.rows || []
    total.value = data?.total || 0
  } finally {
    loading.value = false
  }
}

async function handleRetry(row: any) {
  await retryDelivery(row.id)
  ElMessage.success('重发已触发')
  fetchLogs(currentPage.value)
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
