<template>
  <div class="demo-board">
    <el-card shadow="never">
      <template #header>
        <div class="hd">
          <span>示例物料看板</span>
          <el-tag size="small" type="info">material:demo-board</el-tag>
        </div>
      </template>

      <p class="who">当前用户：{{ user ? user.username : '未登录' }}</p>

      <div class="row">
        <el-button type="primary" :loading="loading" @click="loadCount">查询物料数量</el-button>
        <span v-if="count !== null" class="num">平台物料数：{{ count }}</span>
      </div>

      <div class="row">
        <el-button @click="n++">本地计数（验证单 Vue 实例响应式）：{{ n }}</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { http, auth } from '@platform/sdk'

const user = auth.currentUser()
const loading = ref(false)
const count = ref<number | null>(null)
const n = ref(0)

async function loadCount() {
  loading.value = true
  try {
    const res = await http.get('/materials', { params: { page: 1, size: 1 } })
    count.value = res.data?.totalElements ?? res.data?.content?.length ?? 0
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.demo-board {
  padding: 4px;
}
.hd {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.who {
  color: var(--el-text-color-secondary);
  margin: 0 0 12px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.num {
  font-weight: 600;
}
</style>
