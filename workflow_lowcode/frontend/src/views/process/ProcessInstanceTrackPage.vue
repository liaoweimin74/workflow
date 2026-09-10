<template>
  <div class="instance-track-page">
    <el-page-header @back="router.back()">
      <template #content>
        <span class="header-title">流程跟踪 — {{ instance?.processDefinitionName ?? '加载中…' }}</span>
      </template>
      <template #extra>
        <el-button
          v-if="instance && !instance.ended"
          type="warning"
          :loading="reminding"
          @click="handleRemind"
        >
          <el-icon><Bell /></el-icon>
          催办
        </el-button>
      </template>
    </el-page-header>

    <div v-loading="loading" class="track-body">
      <!-- 顶部：流程实例基本信息 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">流程基本信息</span></template>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="流程名称">{{ instance?.processDefinitionName }}</el-descriptions-item>
          <el-descriptions-item label="流程编号">{{ instance?.businessKey || '—' }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="statusTagType(instance?.status)" size="small">
              {{ statusLabel(instance?.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="当前节点">{{ instance?.currentNode || '—' }}</el-descriptions-item>
          <el-descriptions-item label="流程定义Key">{{ instance?.processDefinitionKey }}</el-descriptions-item>
          <el-descriptions-item label="实例ID">{{ instance?.id }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 中部：流程图高亮 -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">流程图</span></template>
        <div class="bpmn-container">
          <BpmnViewer
            v-if="bpmnXml"
            :xml="bpmnXml"
            :highlights="highlightIds"
          />
          <el-empty v-else-if="!loading" description="流程图加载失败" :image-size="80" />
        </div>
      </el-card>

      <!-- 底部：任务执行列表（已执行 + 活跃 + 预测） -->
      <el-card shadow="never" style="margin-top: 16px">
        <template #header><span style="font-weight: bold">任务执行列表</span></template>
        <ProcessTaskExecutionList :nodes="executionNodes" />
      </el-card>

      <!-- 折叠区：审批记录时间线 -->
      <el-collapse style="margin-top: 16px">
        <el-collapse-item title="审批记录（历史时间线）" name="approval-history">
          <ApprovalTimeline :records="approvalRecords" />
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProcessInstanceTrack' })

import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell } from '@element-plus/icons-vue'
import { processInstanceApi } from '@/api/processInstance'
import { deployedProcessApi } from '@/api/processDefinition'
import { taskRemindApi } from '@/api/taskRemind'
import type { ProcessInstanceVO, ExecutionNodeVO } from '@/api/processInstance'
import type { ApprovalRecordVO } from '@/api/task'
import { BpmnViewer, ApprovalTimeline, ProcessTaskExecutionList } from '@/components/business'

const route = useRoute()
const router = useRouter()
const instanceId = route.params.instanceId as string

const loading = ref(true)
const reminding = ref(false)
const instance = ref<ProcessInstanceVO | null>(null)
const bpmnXml = ref('')
const highlightIds = ref<string[]>([])
const approvalRecords = ref<ApprovalRecordVO[]>([])
const executionNodes = ref<ExecutionNodeVO[]>([])

function statusLabel(status?: string): string {
  const map: Record<string, string> = {
    running: '进行中',
    suspended: '已挂起',
    completed: '已结束',
  }
  return status ? (map[status] ?? status) : '—'
}

function statusTagType(status?: string): 'primary' | 'warning' | 'success' | 'info' {
  const map: Record<string, 'primary' | 'warning' | 'success' | 'info'> = {
    running: 'primary',
    suspended: 'warning',
    completed: 'success',
  }
  return status ? (map[status] ?? 'info') : 'info'
}

async function handleRemind() {
  reminding.value = true
  try {
    await taskRemindApi.remindByInstance(instanceId)
    ElMessage.success('催办通知已发送')
  } catch (err) {
    const msg = err instanceof Error ? err.message : '催办失败'
    if (msg.includes('24') || msg.includes('频率') || msg.includes('frequency')) {
      ElMessage.warning('催办频率限制：24小时内已催办过，请稍后再试')
    } else {
      ElMessage.error('催办失败')
    }
  } finally {
    reminding.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    // 先获取流程实例信息
    const instanceRes = await processInstanceApi.get(instanceId)
    instance.value = instanceRes.data

    // 并行加载 XML + 高亮 + 审批记录 + 执行预测
    const [xmlRes, highlightRes, historyRes, predictionRes] = await Promise.all([
      deployedProcessApi.getXml(instance.value.processDefinitionId),
      processInstanceApi.highlight(instanceId),
      processInstanceApi.history(instanceId),
      processInstanceApi.prediction(instanceId),
    ])

    bpmnXml.value = xmlRes.data

    const highlight = highlightRes.data
    const completed = (highlight.completedActivityIds as string[]) ?? []
    const active = (highlight.activeActivityIds as string[]) ?? []
    highlightIds.value = [...completed, ...active]

    approvalRecords.value = historyRes.data
    executionNodes.value = predictionRes.data
  } catch {
    ElMessage.error('加载流程跟踪信息失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.instance-track-page {
  padding: 16px;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
}

.track-body {
  max-width: 1000px;
}

.bpmn-container {
  height: 400px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
}
</style>
