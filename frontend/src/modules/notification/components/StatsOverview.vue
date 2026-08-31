<template>
  <div class="stats-overview">
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalMessages }}</div>
            <div class="stat-label">消息总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value">{{ stats.totalRecipients }}</div>
            <div class="stat-label">投递总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="stat-value text-red-500">{{ stats.failedRetries }}</div>
            <div class="stat-label">失败重试</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '@/utils/http'

const stats = ref({ totalMessages: 0, totalRecipients: 0, failedRetries: 0 })

onMounted(async () => {
  try {
    const res = await http.get('/v1/admin/notification/stats/overview')
    stats.value = res.data as any
  } catch {
    // 统计接口不可用时显示默认值
  }
})
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 16px 0;
}
.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
}
.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 8px;
}
</style>
