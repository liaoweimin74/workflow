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

        <!-- 发起节点（nodeRole=initiator，精简面板） -->
        <initiator-task-property
          v-else-if="selectedNodeType === 'UserTask' && isSelectedInitiator"
          :read-only="readOnly"
        />

        <!-- 办理节点（nodeRole=handler） -->
        <handler-task-property
          v-else-if="selectedNodeType === 'UserTask' && isSelectedHandler"
          :read-only="readOnly"
        />

        <!-- 审批节点（nodeRole=approver，旧数据无 nodeRole 也按审批处理） -->
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
import HandlerTaskProperty from './HandlerTaskProperty.vue'
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
/** 当前选中 userTask 的 wf:nodeRole（initiator/approver/handler），ProcessDesigner selectNode 时写入 store */
const selectedNodeRole = computed(() => designerStore.selectedNodeRole)

const isEventNode = computed(() => {
  const type = selectedNodeType.value || ''
  return type.includes('Event')
})

const isGatewayNode = computed(() => {
  const type = selectedNodeType.value || ''
  return type.includes('Gateway')
})

/** 发起节点：nodeRole=initiator（store 由画布选中事件同步，异常时兜底查询） */
const isSelectedInitiator = computed(() => {
  if (selectedNodeType.value !== 'UserTask') return false
  return selectedNodeRole.value === 'initiator' || resolveNodeRole() === 'initiator'
})

/** 办理节点：nodeRole=handler，其余（含旧数据无 nodeRole）均按审批节点处理 */
const isSelectedHandler = computed(() => {
  if (selectedNodeType.value !== 'UserTask') return false
  return selectedNodeRole.value === 'handler' || (selectedNodeRole.value === null && resolveNodeRole() === 'handler')
})

/** store 无 role 时（如面板先于选中事件渲染）直接从 modeler 兜底取 businessObject 的 wf:nodeRole */
function resolveNodeRole(): string | null {
  if (!selectedNodeId.value) return null
  try {
    const modeler = getModeler()
    const elementRegistry = modeler.get<{ get(id: string): Element | undefined }>('elementRegistry')
    const element = elementRegistry.get(selectedNodeId.value)
    if (!element) return null
    const bo = element.businessObject
    return (bo.get('wf:nodeRole') as string | undefined) || null
  } catch {
    return null
  }
}

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
  let label = labels[selectedNodeType.value || ''] || selectedNodeType.value || ''
  if (selectedNodeType.value === 'UserTask') {
    const role = selectedNodeRole.value ?? resolveNodeRole()
    if (role === 'initiator') label = '发起节点'
    else if (role === 'handler') label = '办理节点'
    else label = '审批节点'
  }
  return label
})
</script>

<style scoped>
/* 悬浮卡片：浮于画布之上，阴影与圆角强化与画布的边界（与左侧节点面板对称） */
.property-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  box-shadow:
    0 6px 24px rgba(31, 36, 55, 0.14),
    0 1px 4px rgba(31, 36, 55, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.property-panel:not(.collapsed) {
  width: 420px;
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

/* 分组标题左对齐：is-left 默认 left:20px 缩进改 0，与表单内容左缘平齐（Task 78） */
.panel-body :deep(.el-divider--horizontal .el-divider__text.is-left) {
  left: 0;
}

/* 属性表单在浅底色上以白卡片呈现，结构更清晰 */
.panel-body :deep(.el-form) {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter, #eef1fc);
  border-radius: 10px;
  padding: 4px 12px 12px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}
</style>
