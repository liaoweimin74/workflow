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
        <span>属性配置</span>
        <el-tag v-if="selectedNodeType" size="small" type="success">{{ nodeTypeLabel }}</el-tag>
        <el-icon class="collapse-toggle" @click="collapsed = true"><Fold /></el-icon>
      </div>

      <div class="panel-body">
        <!-- 只读模式：展示该版本节点的配置快照（基本信息 + 配置 JSON） -->
        <template v-if="readOnly">
          <el-descriptions v-if="selectedNodeType === 'Process'" :column="1" size="small" border>
            <el-descriptions-item label="对象">流程</el-descriptions-item>
            <el-descriptions-item label="配置">
              <pre class="readonly-config">{{ processConfigJson }}</pre>
            </el-descriptions-item>
          </el-descriptions>
          <el-empty v-else-if="!selectedNodeId" description="请选择节点查看配置" :image-size="80" />
          <el-descriptions v-else :column="1" size="small" border>
            <el-descriptions-item label="对象">{{ nodeTypeLabel }}：{{ selectedNodeName }}</el-descriptions-item>
            <el-descriptions-item label="配置">
              <pre class="readonly-config">{{ nodeConfigJson }}</pre>
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- 编辑模式：按节点类型渲染属性编辑组件 -->
        <template v-else>
          <!-- 流程属性（选中画布空白时） -->
          <process-property
            v-if="selectedNodeType === 'Process'"
          />

          <!-- 无选中节点 -->
          <el-empty v-else-if="!selectedNodeId" description="请选择节点查看属性" :image-size="80" />

          <!-- 开始/结束事件 -->
          <event-property
            v-else-if="isEventNode"
          />

          <!-- 发起人节点（精简面板） -->
          <initiator-task-property
            v-else-if="selectedNodeType === 'UserTask' && isInitiatorNode"
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
        </template>
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
    CallActivity: '调用活动'
  }
  return labels[selectedNodeType.value || ''] || selectedNodeType.value || ''
})

// ========== 只读模式：节点配置快照展示 ==========

/** 当前选中节点名称（只读展示用） */
const selectedNodeName = computed(() => {
  if (!selectedNodeId.value) return ''
  try {
    const modeler = getModeler()
    const elementRegistry = modeler.get<{ get(id: string): Element | undefined }>('elementRegistry')
    const element = elementRegistry.get(selectedNodeId.value)
    return (element?.businessObject as any)?.name || selectedNodeId.value
  } catch {
    return selectedNodeId.value
  }
})

/** 格式化节点配置 JSON（只读展示） */
function formatConfigJson(configJson: string | undefined): string {
  if (!configJson) return '（未配置）'
  try {
    return JSON.stringify(JSON.parse(configJson), null, 2)
  } catch {
    return configJson
  }
}

/** 当前选中节点的配置快照 JSON */
const nodeConfigJson = computed(() => {
  if (!selectedNodeId.value) return ''
  return formatConfigJson(designerStore.nodeConfigs[selectedNodeId.value])
})

/** 流程级配置（__PROCESS__）快照 JSON */
const processConfigJson = computed(() => {
  return formatConfigJson(designerStore.nodeConfigs['__PROCESS__'])
})
</script>

<style scoped>
.property-panel {
  background: #fff;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.property-panel:not(.collapsed) {
  width: 300px;
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
  color: #606266;
  transition: background 0.2s;
}

.collapse-bar:hover {
  background: #f5f7fa;
  color: #409eff;
}

.bar-icon {
  font-size: 18px;
}

.bar-text {
  font-size: 12px;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  color: #909399;
}

/* 只读模式：配置快照 JSON 展示 */
.readonly-config {
  margin: 0;
  padding: 8px;
  max-height: 420px;
  overflow: auto;
  background: #f8f9fb;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-all;
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

.collapse-toggle {
  cursor: pointer;
  color: #909399;
  font-size: 16px;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: #409eff;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 分组标题字体加粗 */
.panel-body :deep(.el-divider__text) {
  font-weight: 600;
}
</style>
