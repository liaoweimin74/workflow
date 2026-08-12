<template>
  <div class="task-done-detail-page">
    <el-page-header @back="$router.back()">
      <template #content>
        <span class="header-title">已办详情 — {{ taskDetail?.processName ?? '加载中…' }}</span>
      </template>
      <template #extra>
        <el-button @click="trackingDrawer = true">
          <el-icon><View /></el-icon>
          流程跟踪
        </el-button>
      </template>
    </el-page-header>

    <div v-loading="loading" class="detail-body">
      <!-- 顶部：流程基本信息 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">流程基本信息</span></template>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="流程名称">{{ taskDetail?.processName }}</el-descriptions-item>
          <el-descriptions-item label="版本">v{{ taskDetail?.processVersion ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="流程编号">{{ taskDetail?.businessKey || '—' }}</el-descriptions-item>
          <el-descriptions-item label="处理节点">{{ taskDetail?.name }}</el-descriptions-item>
          <el-descriptions-item label="发起人">{{ taskDetail?.initiatorName || taskDetail?.initiator }}</el-descriptions-item>
          <el-descriptions-item label="接收时间">{{ formatDateTime(taskDetail?.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="办理人">{{ taskDetail?.assigneeName || taskDetail?.assignee }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 中部：审批表单（只读） -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">审批表单</span></template>
        <template v-if="taskDetail?.formKey">
          <FormRenderer
            :form-def-id="taskDetail.formKey"
            :process-instance-id="taskDetail.processInstanceId"
            :task-id="taskDetail.taskId"
            readonly
          />
        </template>
        <template v-else>
          <el-descriptions :column="2" border size="small" title="流程变量">
            <el-descriptions-item
              v-for="(value, key) in taskDetail?.variables"
              :key="key"
              :label="String(key)"
            >
              {{ formatValue(value) }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </el-card>
    </div>

    <!-- 流程跟踪 Drawer -->
    <ProcessTrackDrawer
      v-model="trackingDrawer"
      :process-instance-id="taskDetail?.processInstanceId ?? ''"
      :process-definition-id="taskDetail?.processDefinitionId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import type { TaskDetailVO } from '@/api/task'
import FormRenderer from '@/views/form/components/FormRenderer.vue'
import { ProcessTrackDrawer } from '@/components/business'

const route = useRoute()
const taskId = route.params.taskId as string

const loading = ref(true)
const taskDetail = ref<TaskDetailVO | null>(null)
const trackingDrawer = ref(false)

function formatDateTime(dt?: string): string {
  if (!dt) return '—'
  return dt.replace('T', ' ').slice(0, 19)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await taskApi.getDetail(taskId)
    taskDetail.value = res.data
  } catch {
    ElMessage.error('加载详情失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.task-done-detail-page {
  padding: 16px;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
}

.detail-body {
  max-width: 900px;
}
</style>
