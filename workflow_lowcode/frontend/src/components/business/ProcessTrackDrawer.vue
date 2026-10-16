<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="480px"
    :destroy-on-close="true"
    @open="loadData"
  >
    <div v-loading="loading" class="track-content">
      <!-- 任务执行列表（已执行 + 活跃 + 预测） -->
      <el-card shadow="never">
        <template #header><span style="font-weight: bold">任务执行列表</span></template>
        <ProcessTaskExecutionList :nodes="executionNodes" />
      </el-card>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { processInstanceApi } from '@/api/processInstance'
import type { ExecutionNodeVO } from '@/api/processInstance'
import { ProcessTaskExecutionList } from '@/components/business'

const props = defineProps<{
  modelValue: boolean
  processInstanceId: string
  processDefinitionId?: string
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const title = computed(() => props.title ?? '流程跟踪')

const loading = ref(false)
const executionNodes = ref<ExecutionNodeVO[]>([])

async function loadData() {
  if (!props.processInstanceId) return
  loading.value = true
  // 重置数据
  executionNodes.value = []

  try {
    // 加载执行预测
    const predictionRes = await processInstanceApi.prediction(props.processInstanceId)
    executionNodes.value = predictionRes.data
  } catch {
    ElMessage.warning('加载流程跟踪信息失败')
  } finally {
    loading.value = false
  }
}

// 暴露刷新方法
defineExpose({ refresh: loadData })
</script>

<style scoped>
.track-content {
  padding: 0 4px;
}
</style>
