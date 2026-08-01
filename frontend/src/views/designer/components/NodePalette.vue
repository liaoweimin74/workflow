<template>
  <div class="node-palette">
    <div class="palette-header">
      <span>节点面板</span>
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
            <el-icon class="item-icon">
              <component :is="node.icon" />
            </el-icon>
            <span class="item-label">{{ node.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CircleCheck,
  Switch,
  Share,
  Connection,
  Memo,
  Timer,
  Minus,
  Finished,
  WarnTriangleFilled,
  Document
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

interface PaletteNode {
  type: string
  label: string
  description: string
  icon: Component
}

interface PaletteGroup {
  title: string
  items: PaletteNode[]
}

const nodeGroups: PaletteGroup[] = [
  {
    title: '事件',
    items: [
      { type: 'bpmn:StartEvent', label: '开始事件', description: '流程开始', icon: CircleCheck },
      { type: 'bpmn:EndEvent', label: '结束事件', description: '流程结束', icon: Finished },
      { type: 'bpmn:IntermediateThrowEvent', label: '中间事件', description: '中间抛出事件', icon: WarnTriangleFilled }
    ]
  },
  {
    title: '活动',
    items: [
      { type: 'bpmn:UserTask', label: '用户任务', description: '需要人工审批的任务', icon: Memo },
      { type: 'bpmn:ServiceTask', label: '服务任务', description: '自动执行的任务', icon: Document },
      { type: 'bpmn:CallActivity', label: '调用活动', description: '调用子流程', icon: Connection }
    ]
  },
  {
    title: '网关',
    items: [
      { type: 'bpmn:ExclusiveGateway', label: '排他网关', description: '条件分支（XOR）', icon: Switch },
      { type: 'bpmn:ParallelGateway', label: '并行网关', description: '并行执行（AND）', icon: Share },
      { type: 'bpmn:InclusiveGateway', label: '包含网关', description: '包含分支（OR）', icon: Minus }
    ]
  },
  {
    title: '其他',
    items: [
      { type: 'bpmn:BoundaryEvent', label: '边界事件', description: '附在活动上的事件', icon: Timer }
    ]
  }
]

function handleDragStart(event: DragEvent, node: PaletteNode) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('node-type', node.type)
  event.dataTransfer.effectAllowed = 'copy'
}

function handleClick(_node: PaletteNode) {
  // 点击模式：暂不实现，依赖拖拽
}
</script>

<style scoped>
.node-palette {
  width: 200px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-header {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f0f0;
}

.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.palette-group {
  margin-bottom: 16px;
}

.group-title {
  font-size: 12px;
  color: #909399;
  padding: 4px 8px;
  margin-bottom: 4px;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: grab;
  transition: background 0.2s;
  font-size: 13px;
  color: #606266;
}

.palette-item:hover {
  background: #ecf5ff;
  color: #409eff;
}

.palette-item:active {
  cursor: grabbing;
}

.item-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.item-label {
  white-space: nowrap;
}
</style>
