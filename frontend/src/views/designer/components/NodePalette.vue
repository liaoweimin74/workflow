<template>
  <div class="node-palette" :class="{ collapsed }">
    <!-- 折叠态：竖条 -->
    <div v-if="collapsed" class="collapse-bar" @click="collapsed = false">
      <i class="bpmn-font-icon bpmn-icon-start-event-none bar-icon"></i>
      <span class="bar-text">节点</span>
    </div>

    <!-- 展开态：完整面板 -->
    <template v-else>
      <div class="palette-header">
        <span>节点面板</span>
        <el-icon class="collapse-toggle" @click="collapsed = true"><Fold /></el-icon>
      </div>
      <div class="palette-body">
        <div
          v-for="group in nodeGroups"
          :key="group.title"
          class="palette-group"
        >
          <div class="group-title">{{ group.title }}</div>
          <div class="group-items">
            <div
              v-for="node in group.items"
              :key="node.type"
              class="palette-item"
              draggable="true"
              @dragstart="handleDragStart($event, node)"
              @click="handleClick(node)"
              :title="node.description"
            >
              <i class="item-icon bpmn-font-icon" :class="node.iconClass"></i>
              <span class="item-label">{{ node.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Fold } from '@element-plus/icons-vue'

interface PaletteNode {
  type: string
  label: string
  description: string
  iconClass: string
  nodeRole?: string
}

interface PaletteGroup {
  title: string
  items: PaletteNode[]
}

const props = defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean] }>()

const collapsed = computed({
  get: () => props.collapsed ?? false,
  set: (val) => emit('update:collapsed', val)
})

const nodeGroups: PaletteGroup[] = [
  {
    title: '事件',
    items: [
      { type: 'bpmn:StartEvent', label: '开始事件', description: '流程开始', iconClass: 'bpmn-icon-start-event-none' },
      { type: 'bpmn:EndEvent', label: '结束事件', description: '流程结束', iconClass: 'bpmn-icon-end-event-none' }
    ]
  },
  {
    title: '活动',
    items: [
      { type: 'bpmn:UserTask', label: '用户任务', description: '需要人工审批的任务', iconClass: 'bpmn-icon-user-task' },
      { type: 'bpmn:ServiceTask', label: '服务任务', description: '自动执行的任务', iconClass: 'bpmn-icon-service-task' },
      { type: 'bpmn:CallActivity', label: '调用活动', description: '调用子流程', iconClass: 'bpmn-icon-call-activity' },
      { type: 'bpmn:UserTask', label: '发起人节点', description: '发起人填报节点', iconClass: 'bpmn-icon-user-task', nodeRole: 'initiator' }
    ]
  },
  {
    title: '网关',
    items: [
      { type: 'bpmn:ExclusiveGateway', label: '排他网关', description: '条件分支（XOR）', iconClass: 'bpmn-icon-gateway-xor' },
      { type: 'bpmn:ParallelGateway', label: '并行网关', description: '并行执行（AND）', iconClass: 'bpmn-icon-gateway-parallel' },
      { type: 'bpmn:InclusiveGateway', label: '包含网关', description: '包含分支（OR）', iconClass: 'bpmn-icon-gateway-or' }
    ]
  }
]

function handleDragStart(event: DragEvent, node: PaletteNode) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('node-type', node.type)
  if (node.nodeRole) {
    event.dataTransfer.setData('node-role', node.nodeRole)
  }
  event.dataTransfer.effectAllowed = 'copy'
}

function handleClick(_node: PaletteNode) {
  // 点击模式：暂不实现，依赖拖拽
}
</script>

<style scoped>
.node-palette {
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

/* 展开态宽度 */
.node-palette:not(.collapsed) {
  width: 200px;
}

/* 折叠态竖条 */
.node-palette.collapsed {
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
}

.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
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

.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.palette-group {
  margin-bottom: 8px;
}

.group-title {
  padding: 4px 16px;
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.group-items {
  display: flex;
  flex-direction: column;
}

.palette-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: grab;
  transition: background 0.2s;
}

.palette-item:hover {
  background: #f5f7fa;
}

.palette-item:active {
  cursor: grabbing;
}

.item-icon {
  font-size: 20px;
  color: #409eff;
  margin-right: 10px;
  width: 20px;
  text-align: center;
}

.item-label {
  font-size: 13px;
  color: #606266;
}
</style>
