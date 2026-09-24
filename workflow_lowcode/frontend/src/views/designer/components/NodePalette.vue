<template>
  <div class="node-palette" :class="{ collapsed }">
    <!-- 折叠态：顶部展开按钮 + 节点图标列表 -->
    <template v-if="collapsed">
      <div class="collapse-bar-top" @click="collapsed = false" title="展开节点面板">
        <el-icon class="expand-toggle"><Expand /></el-icon>
      </div>
      <div class="collapsed-icons">
        <div
          v-for="node in allNodes"
          :key="node.type + (node.nodeRole || '')"
          class="collapsed-item"
          draggable="true"
          @dragstart="handleDragStart($event, node)"
          :title="node.description"
        >
          <i class="bpmn-font-icon" :class="node.iconClass" :style="chipStyle(node)"></i>
        </div>
      </div>
    </template>

    <!-- 展开态：完整面板 -->
    <template v-else>
      <div class="palette-header">
        <div class="palette-heading">
          <el-icon class="heading-icon"><Menu /></el-icon>
          <span>节点面板</span>
        </div>
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
              :key="node.type + (node.nodeRole || '')"
              class="palette-item"
              draggable="true"
              @dragstart="handleDragStart($event, node)"
              @click="handleClick(node)"
              :title="node.description"
            >
              <span class="item-chip" :style="chipStyle(node)">
                <i class="item-icon bpmn-font-icon" :class="node.iconClass"></i>
              </span>
              <span class="item-label">{{ node.label }}</span>
              <el-icon class="item-drag"><Rank /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Fold, Expand, Menu, Rank } from '@element-plus/icons-vue'

interface PaletteNode {
  type: string
  label: string
  description: string
  iconClass: string
  nodeRole?: string
  category: 'event' | 'activity' | 'gateway'
}

interface PaletteGroup {
  title: string
  items: PaletteNode[]
}

/* 节点类别 → 图标 chip 配色（柔和填充 + 同色文字，X6 BPMN 风格）
   全部走语义变量/半透明洗底：四态（青墨/经典 × 明暗）自动适配 */
const CATEGORY_STYLES: Record<string, { bg: string; color: string }> = {
  event: { bg: 'color-mix(in srgb, var(--brand-bright, #2ca7b5) 13%, transparent)', color: 'var(--brand-bright, #2ca7b5)' },      // 青瓷 — 事件
  activity: { bg: 'var(--ds-industrial-50)', color: 'var(--ds-industrial-600)' },   // 主题色 — 活动
  gateway: { bg: 'color-mix(in srgb, var(--el-color-warning) 14%, transparent)', color: 'var(--el-color-warning)' },    // 琥珀 — 网关
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
      { type: 'bpmn:StartEvent', label: '开始事件', description: '流程开始', iconClass: 'bpmn-icon-start-event-none', category: 'event' },
      { type: 'bpmn:EndEvent', label: '结束事件', description: '流程结束', iconClass: 'bpmn-icon-end-event-none', category: 'event' }
    ]
  },
  {
    title: '活动',
    items: [
      { type: 'bpmn:UserTask', label: '发起节点', description: '发起人填报节点', iconClass: 'bpmn-icon-initiator-node', nodeRole: 'initiator', category: 'activity' },
      { type: 'bpmn:UserTask', label: '用户任务', description: '需要人工审批的任务', iconClass: 'bpmn-icon-user-task', category: 'activity' },
      { type: 'bpmn:ServiceTask', label: '服务任务', description: '自动执行的任务', iconClass: 'bpmn-icon-service-task', category: 'activity' },
      { type: 'bpmn:CallActivity', label: '调用活动', description: '调用子流程', iconClass: 'bpmn-icon-call-activity', category: 'activity' },
      { type: 'bpmn:SubProcess', label: '内嵌子流程', description: '子流程容器，双击进入编辑', iconClass: 'bpmn-icon-subprocess-collapsed', category: 'activity' }
    ]
  },
  {
    title: '网关',
    items: [
      { type: 'bpmn:ExclusiveGateway', label: '排他网关', description: '条件分支（XOR）', iconClass: 'bpmn-icon-gateway-xor', category: 'gateway' },
      { type: 'bpmn:ParallelGateway', label: '并行网关', description: '并行执行（AND）', iconClass: 'bpmn-icon-gateway-parallel', category: 'gateway' },
      { type: 'bpmn:InclusiveGateway', label: '包含网关', description: '包含分支（OR）', iconClass: 'bpmn-icon-gateway-or', category: 'gateway' }
    ]
  }
]

/** 折叠态：所有节点扁平化 */
const allNodes = computed(() =>
  nodeGroups.flatMap(g => g.items)
)

function chipStyle(node: PaletteNode) {
  const s = CATEGORY_STYLES[node.category] || CATEGORY_STYLES.activity
  return { backgroundColor: s.bg, color: s.color }
}

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
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

/* 展开态宽度 */
.node-palette:not(.collapsed) {
  width: 216px;
}

/* 折叠态竖条 */
.node-palette.collapsed {
  width: 40px;
}

/* ===== 折叠态 ===== */
.collapse-bar-top {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  cursor: pointer;
  color: var(--el-text-color-regular, #4b5169);
  border-bottom: 1px solid var(--el-border-color-light, #e9edfa);
  transition: background 0.2s, color 0.2s;
}

.collapse-bar-top:hover {
  background: var(--el-fill-color-lighter, #f8f9fe);
  color: var(--ds-industrial-500, #5755ee);
}

.expand-toggle {
  font-size: 18px;
}

.collapsed-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 6px;
  overflow-y: auto;
}

.collapsed-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: grab;
  border-radius: 8px;
  transition: background 0.2s, transform 0.1s;
}

.collapsed-item:hover {
  background: var(--ds-selected, #e9eaff);
}

.collapsed-item:active {
  cursor: grabbing;
}

.collapsed-item .bpmn-font-icon {
  font-size: 18px;
  padding: 4px;
  border-radius: 6px;
}

/* ===== 头部 ===== */
.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-light, #e9edfa);
}

.palette-heading {
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

.collapse-toggle {
  cursor: pointer;
  color: var(--el-text-color-secondary, #8b91ab);
  font-size: 16px;
  transition: color 0.2s, transform 0.15s;
}

.collapse-toggle:hover {
  color: var(--ds-industrial-500, #5755ee);
}

/* ===== 主体 ===== */
.palette-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: var(--el-bg-color-page, #f1f4fe);
}

.palette-group {
  margin-bottom: 14px;
}

.group-title {
  padding: 0 4px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #8b91ab);
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter, #eef1fc);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  cursor: grab;
  border-radius: 8px;
  background: transparent;
  transition: background 0.18s, transform 0.1s;
  box-shadow: 0 0 0 0 transparent;
}

.palette-item:hover {
  background: var(--ds-selected, #e9eaff);
}

.palette-item:active {
  cursor: grabbing;
  transform: scale(0.98);
  background: #e0e1ff;
}

.item-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  font-size: 18px;
}

.item-icon {
  font-size: 17px;
}

.item-label {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular, #4b5169);
  font-weight: 500;
}

.item-drag {
  color: var(--el-text-color-placeholder, #b0b5c9);
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.18s;
}

.palette-item:hover .item-drag {
  opacity: 1;
}
</style>
