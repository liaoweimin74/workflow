<template>
  <div class="property-panel" :class="{ collapsed }">
    <!-- 折叠态：竖条 -->
    <div v-if="collapsed" class="collapse-bar" @click="collapsed = false">
      <span class="bar-text">属性</span>
      <el-icon class="bar-icon"><Setting /></el-icon>
    </div>

    <!-- 展开态：完整面板 -->
    <template v-else>
      <div class="panel-header">
        <div class="panel-heading">
          <el-icon class="heading-icon"><Setting /></el-icon>
          <span>属性配置</span>
        </div>
        <div class="panel-tags">
          <el-tag v-if="readOnly" size="small" type="info" effect="plain">只读</el-tag>
          <el-tag v-if="selectedNodeType" size="small" class="node-type-tag" effect="plain">{{ nodeTypeLabel }}</el-tag>
          <el-icon class="collapse-toggle" @click="collapsed = true"><Fold /></el-icon>
        </div>
      </div>

      <!-- 只读模式：复用同一套可视化属性组件，el-form disabled 禁编辑（tab 可切换、滚动正常） -->
      <div class="panel-body">
        <!-- 流程属性（选中画布空白时） -->
        <process-property
          v-if="selectedNodeType === 'Process'"
          :read-only="readOnly"
        />

        <!-- 无选中节点 -->
        <el-empty v-else-if="!selectedNodeId" description="请选择节点查看属性" :image-size="80" />

        <!-- 开始/结束事件 -->
        <event-property
          v-else-if="isEventNode"
          :read-only="readOnly"
        />

        <!-- 发起人节点（精简面板） -->
        <initiator-task-property
          v-else-if="selectedNodeType === 'UserTask' && isInitiatorNode"
          :read-only="readOnly"
        />

        <!-- 用户任务（审批节点） -->
        <user-task-property
          v-else-if="selectedNodeType === 'UserTask'"
          :read-only="readOnly"
        />

        <!-- 服务任务 -->
        <service-task-property
          v-else-if="selectedNodeType === 'ServiceTask'"
          :read-only="readOnly"
        />

        <!-- 调用活动（子流程） -->
        <call-activity-property
          v-else-if="selectedNodeType === 'CallActivity'"
          :read-only="readOnly"
        />

        <!-- 内嵌子流程 -->
        <sub-process-property
          v-else-if="selectedNodeType === 'SubProcess'"
          :read-only="readOnly"
        />

        <!-- 网关 -->
          <gateway-property
            v-else-if="isGatewayNode"
            :read-only="readOnly"
          />

          <!-- 连线 -->
          <sequence-flow-property
            v-else-if="selectedNodeType === 'SequenceFlow'"
            :read-only="readOnly"
          />

          <!-- 未知节点类型 -->
          <el-empty v-else description="该节点类型暂不支持属性配置" :image-size="80" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Element } from 'bpmn-js/lib/model/Types'
import { Fold, Setting } from '@element-plus/icons-vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import ProcessProperty from './ProcessProperty.vue'
import EventProperty from './EventProperty.vue'
import UserTaskProperty from './UserTaskProperty.vue'
import InitiatorTaskProperty from './InitiatorTaskProperty.vue'
import ServiceTaskProperty from './ServiceTaskProperty.vue'
import CallActivityProperty from './CallActivityProperty.vue'
import SubProcessProperty from './SubProcessProperty.vue'
import GatewayProperty from './GatewayProperty.vue'
import SequenceFlowProperty from './SequenceFlowProperty.vue'

const designerStore = useDesignerStore()

const props = defineProps<{ collapsed?: boolean; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean] }>()

const collapsed = computed({
  get: () => props.collapsed ?? false,
  set: (val) => emit('update:collapsed', val)
})

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

const isInitiatorNode = computed(() => {
  if (selectedNodeType.value !== 'UserTask') return false
  if (!selectedNodeId.value) return false
  try {
    const modeler = getModeler()
    const elementRegistry = modeler.get<{ get(id: string): Element | undefined }>('elementRegistry')
    const element = elementRegistry.get(selectedNodeId.value)
    if (!element) return false
    const bo = element.businessObject
    return bo.get('wf:nodeRole') === 'initiator'
  } catch {
    return false
  }
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
    CallActivity: '调用活动',
    SubProcess: '内嵌子流程'
  }
  return labels[selectedNodeType.value || ''] || selectedNodeType.value || ''
})
</script>

<style scoped>
.property-panel {
  background: #fff;
  border-left: 1px solid var(--color-industrial-300, #b9b9f9);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.property-panel:not(.collapsed) {
  width: 320px;
}

.property-panel.collapsed {
  width: 32px;
}

.collapse-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  cursor: pointer;
  gap: 6px;
  color: var(--el-text-color-regular, #4b5169);
  background: var(--el-bg-color-page, #f1f4fe);
  transition: background 0.2s, color 0.2s;
}

.collapse-bar:hover {
  background: var(--ds-selected, #e9eaff);
  color: var(--ds-industrial-500, #5755ee);
}

.bar-icon {
  font-size: 18px;
}

.bar-text {
  font-size: 12px;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  color: var(--el-text-color-secondary, #8b91ab);
}

/* 只读模式：视觉提示（inert 已禁用交互，此处仅弱化外观） */
.panel-body[inert] {
  opacity: 0.75;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-light, #e9edfa);
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1f2437);
}

.heading-icon {
  color: var(--ds-industrial-500, #5755ee);
  font-size: 16px;
}

.panel-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-type-tag {
  --el-tag-bg-color: var(--ds-industrial-50, #f3f3fe) !important;
  --el-tag-border-color: var(--ds-industrial-200, #d6d6fd) !important;
  --el-tag-text-color: var(--ds-industrial-600, #5452d3) !important;
  background: var(--ds-industrial-50, #f3f3fe) !important;
  border-color: var(--ds-industrial-200, #d6d6fd) !important;
  color: var(--ds-industrial-600, #5452d3) !important;
  font-weight: 600;
}

.collapse-toggle {
  cursor: pointer;
  color: var(--el-text-color-secondary, #8b91ab);
  font-size: 16px;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: var(--ds-industrial-500, #5755ee);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--el-bg-color-page, #f1f4fe);
}

/* 分组标题字体加粗 */
.panel-body :deep(.el-divider__text) {
  font-weight: 600;
  color: var(--el-text-color-regular, #4b5169);
}

/* 属性表单在浅底色上以白卡片呈现，结构更清晰 */
.panel-body :deep(.el-form) {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter, #eef1fc);
  border-radius: 10px;
  padding: 4px 12px 12px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}
</style>
