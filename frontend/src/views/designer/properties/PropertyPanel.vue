<template>
  <div class="property-panel">
    <div class="panel-header">
      <span>属性配置</span>
      <el-tag v-if="selectedNodeType" size="small" type="success">{{ nodeTypeLabel }}</el-tag>
    </div>

    <div class="panel-body">
      <!-- 无选中节点 -->
      <el-empty v-if="!selectedNodeId" description="请选择节点查看属性" :image-size="80" />

      <!-- 流程属性（选中画布空白时） -->
      <process-property
        v-else-if="selectedNodeType === 'Process'"
      />

      <!-- 开始/结束事件 -->
      <event-property
        v-else-if="isEventNode"
      />

      <!-- 用户任务（审批节点） -->
      <user-task-property
        v-else-if="selectedNodeType === 'UserTask'"
      />

      <!-- 服务任务 -->
      <service-task-property
        v-else-if="selectedNodeType === 'ServiceTask'"
      />

      <!-- 调用活动（子流程） -->
      <call-activity-property
        v-else-if="selectedNodeType === 'CallActivity'"
      />

      <!-- 网关 -->
      <gateway-property
        v-else-if="isGatewayNode"
      />

      <!-- 连线 -->
      <sequence-flow-property
        v-else-if="selectedNodeType === 'SequenceFlow'"
      />

      <!-- 未知节点类型 -->
      <el-empty v-else description="该节点类型暂不支持属性配置" :image-size="80" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import ProcessProperty from './ProcessProperty.vue'
import EventProperty from './EventProperty.vue'
import UserTaskProperty from './UserTaskProperty.vue'
import ServiceTaskProperty from './ServiceTaskProperty.vue'
import CallActivityProperty from './CallActivityProperty.vue'
import GatewayProperty from './GatewayProperty.vue'
import SequenceFlowProperty from './SequenceFlowProperty.vue'

const designerStore = useDesignerStore()

const selectedNodeId = computed(() => designerStore.selectedNodeId)
const selectedNodeType = computed(() => designerStore.selectedNodeType)

const isEventNode = computed(() => {
  const type = selectedNodeType.value || ''
  return type.includes('Event')
})

const isGatewayNode = computed(() => {
  const type = selectedNodeType.value || ''
  return type.includes('Gateway')
})

const nodeTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    Process: '流程',
    StartEvent: '开始事件',
    EndEvent: '结束事件',
    UserTask: '用户任务',
    ServiceTask: '服务任务',
    ExclusiveGateway: '排他网关',
    ParallelGateway: '并行网关',
    InclusiveGateway: '包含网关',
    SequenceFlow: '连线',
    CallActivity: '调用活动'
  }
  return labels[selectedNodeType.value || ''] || selectedNodeType.value || ''
})
</script>

<style scoped>
.property-panel {
  width: 360px;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f0f0;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>
