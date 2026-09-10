<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="55%"
    :destroy-on-close="true"
    @open="loadData"
  >
    <div v-loading="loading" class="track-content">
      <!-- 流程图 -->
      <el-card shadow="never" style="margin-bottom: 16px">
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
import { deployedProcessApi } from '@/api/processDefinition'
import type { ExecutionNodeVO } from '@/api/processInstance'
import { BpmnViewer, ProcessTaskExecutionList } from '@/components/business'

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
const bpmnXml = ref('')
const highlightIds = ref<string[]>([])
const executionNodes = ref<ExecutionNodeVO[]>([])

async function loadData() {
  if (!props.processInstanceId) return
  loading.value = true
  // 重置数据
  bpmnXml.value = ''
  highlightIds.value = []
  executionNodes.value = []

  try {
    // 先获取流程实例（拿到 processDefinitionId）
    const instanceRes = await processInstanceApi.get(props.processInstanceId)
    const defId = props.processDefinitionId || instanceRes.data.processDefinitionId

    // 并行加载 XML + 高亮 + 执行预测
    const [xmlRes, highlightRes, predictionRes] = await Promise.all([
      deployedProcessApi.getXml(defId),
      processInstanceApi.highlight(props.processInstanceId),
      processInstanceApi.prediction(props.processInstanceId),
    ])

    bpmnXml.value = xmlRes.data

    const highlight = highlightRes.data
    const completed = (highlight.completedActivityIds as string[]) ?? []
    const active = (highlight.activeActivityIds as string[]) ?? []
    highlightIds.value = [...completed, ...active]

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

.bpmn-container {
  min-height: 200px;
}
</style>
