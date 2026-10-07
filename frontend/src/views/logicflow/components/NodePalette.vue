<template>
  <div class="node-palette" :class="{ collapsed }">
    <!-- 折叠态：展开按钮 + 类型色点列表 -->
    <template v-if="collapsed">
      <div class="collapse-bar-top" title="展开节点面板" @click="collapsed = false">
        <el-icon class="expand-toggle"><Expand /></el-icon>
      </div>
      <div class="collapsed-icons">
        <div
          v-for="node in allNodes"
          :key="node.type"
          class="collapsed-item"
          :title="`${node.label}：${node.description}`"
          draggable="true"
          @dragstart="handleDragStart($event, node)"
          @click="emit('add', node.type)"
        >
          <span class="mini-chip" :style="chipStyle(node)">{{ node.badge }}</span>
        </div>
      </div>
    </template>

    <!-- 展开态：分组面板 -->
    <template v-else>
      <div class="palette-header">
        <div class="palette-heading">
          <el-icon class="heading-icon"><Menu /></el-icon>
          <span>节点面板</span>
        </div>
        <el-icon class="collapse-toggle" title="折叠面板" @click="collapsed = true"><Fold /></el-icon>
      </div>
      <div class="palette-body">
        <div v-for="group in groups" :key="group.title" class="palette-group">
          <div class="group-title">{{ group.title }}</div>
          <div class="group-items">
            <div
              v-for="node in group.items"
              :key="node.type"
              class="palette-item"
              draggable="true"
              @dragstart="handleDragStart($event, node)"
              @click="emit('add', node.type)"
            >
              <span class="item-chip" :style="chipStyle(node)">{{ node.badge }}</span>
              <span class="item-text">
                <FieldLabel
                  :label="node.label"
                  :tip="`${node.description}。拖拽到画布，或点击添加到视口中心`"
                  clickable
                />
              </span>
              <el-icon class="item-drag"><Rank /></el-icon>
            </div>
          </div>
        </div>
        <div class="palette-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>拖拽或点击节点添加到画布；拖动节点边角连接点连线</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Expand, Fold, Menu, Rank, InfoFilled } from '@element-plus/icons-vue'
import FieldLabel from './FieldLabel.vue'
import { PALETTE_GROUPS } from '../utils/nodeMeta'
import type { PaletteNode } from '../utils/nodeMeta'
import type { LogicNodeType } from '../utils/dsl'

const props = defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  /** 点击添加：父组件落到视口中心偏移处 */
  add: [type: LogicNodeType]
}>()

const collapsed = computed({
  get: () => props.collapsed ?? false,
  set: (val) => emit('update:collapsed', val),
})

const groups = PALETTE_GROUPS
const allNodes = computed(() => groups.flatMap((g) => g.items))

/** 类型色 chip：同色柔和洗底（全部走 --lf-* 变量，四态自适应） */
function chipStyle(node: PaletteNode) {
  return {
    color: `var(${node.colorVar})`,
    backgroundColor: `color-mix(in srgb, var(${node.colorVar}) 13%, transparent)`,
    border: `1px solid color-mix(in srgb, var(${node.colorVar}) 30%, transparent)`,
  }
}

/** HTML5 拖拽：把节点类型写入 dataTransfer，画布 drop 时读取 */
function handleDragStart(event: DragEvent, node: PaletteNode) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('logic-node-type', node.type)
  event.dataTransfer.effectAllowed = 'copy'
}
</script>

<style scoped>
/* 悬浮卡片：浮于画布之上，与右侧属性面板对称 */
.node-palette {
  position: absolute;
  top: 12px;
  left: 12px;
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

.node-palette:not(.collapsed) {
  width: 240px;
}

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
  color: var(--el-text-color-regular);
  border-bottom: 1px solid var(--el-border-color-light);
  transition: background 0.2s, color 0.2s;
}

.collapse-bar-top:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}

.expand-toggle {
  font-size: 18px;
}

.collapsed-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 8px;
  overflow-y: auto;
}

.collapsed-item {
  cursor: grab;
  border-radius: 8px;
  transition: transform 0.1s;
}

.collapsed-item:active {
  cursor: grabbing;
  transform: scale(0.94);
}

.mini-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}

/* ===== 头部 ===== */
.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
}

.palette-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.heading-icon {
  color: var(--el-color-primary);
  font-size: 16px;
}

.collapse-toggle {
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  transition: color 0.2s;
}

.collapse-toggle:hover {
  color: var(--el-color-primary);
}

/* ===== 主体：分组列表，超高滚动 ===== */
.palette-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  background: var(--el-bg-color-page);
}

.palette-group {
  margin-bottom: 12px;
}

.group-title {
  padding: 0 4px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.04);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  cursor: grab;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.18s, border-color 0.18s, transform 0.1s, box-shadow 0.15s;
}

.palette-item:hover {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  border-color: color-mix(in srgb, var(--el-color-primary) 22%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(31, 36, 55, 0.08);
}

.palette-item:active {
  cursor: grabbing;
  transform: scale(0.98);
}

.item-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
}

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-weight: 600;
  line-height: 1.3;
}

.item-text :deep(.fl-label) {
  max-width: 100%;
}

.item-text :deep(.fl-label > span:first-child) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-drag {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.18s;
}

.palette-item:hover .item-drag {
  opacity: 1;
}

.palette-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.palette-tip .el-icon {
  margin-top: 1px;
  color: var(--el-color-primary);
}
</style>
