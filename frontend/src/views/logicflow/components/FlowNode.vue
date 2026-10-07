<template>
  <div class="lf-node-card" :class="[`type-${data.nodeType.toLowerCase()}`, { 'is-selected': selected }]">
    <!-- 类型色条 -->
    <span class="type-bar" :style="typeColorStyle" />

    <!-- 删除小按钮（hover 显示，连带删除关联边由父组件处理） -->
    <span
      v-if="deletable"
      class="node-delete"
      title="删除节点"
      @click.stop="emit('delete', id)"
    >
      <el-icon><Close /></el-icon>
    </span>

    <div class="node-head">
      <span class="node-icon" :style="typeColorStyle">{{ badge }}</span>
      <span class="node-name" :title="data.name">{{ data.name }}</span>
    </div>

    <div v-if="summary" class="node-summary" :title="summary">{{ summary }}</div>

    <div v-if="data.resultVar || data.errorAction === 'IGNORE_CONTINUE'" class="node-tags">
      <span v-if="data.resultVar" class="node-tag var-tag" :title="`结果写入变量：${data.resultVar}`">
        {{ data.resultVar }}
      </span>
      <span v-if="data.errorAction === 'IGNORE_CONTINUE'" class="node-tag ignore-tag" title="出错时忽略并继续">
        忽略继续
      </span>
    </div>

    <!-- 连接点：CONDITION 两个出边（真/假）上下排布标注；其余上入下出 -->
    <template v-if="data.nodeType === 'CONDITION'">
      <Handle id="in" type="target" :position="Position.Top" />
      <Handle id="true" type="source" :position="Position.Bottom" class="handle-branch branch-true" :style="{ left: '28%' }" />
      <Handle id="false" type="source" :position="Position.Bottom" class="handle-branch branch-false" :style="{ left: '72%' }" />
      <span class="branch-label label-true">真</span>
      <span class="branch-label label-false">假</span>
    </template>
    <template v-else>
      <Handle v-if="data.nodeType !== 'START'" id="in" type="target" :position="Position.Top" />
      <Handle v-if="data.nodeType !== 'END'" id="out" type="source" :position="Position.Bottom" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Close } from '@element-plus/icons-vue'
import { NODE_COLOR_VAR, nodeMeta } from '../utils/nodeMeta'
import type { FlowNodeData } from '../utils/dsl'

const props = withDefaults(
  defineProps<{
    id: string
    data: FlowNodeData
    selected?: boolean
    deletable?: boolean
  }>(),
  { selected: false, deletable: true }
)

const emit = defineEmits<{ delete: [id: string] }>()

const meta = computed(() => nodeMeta(props.data.nodeType))
const badge = computed(() => meta.value.badge)

const typeColorStyle = computed(() => {
  const colorVar = NODE_COLOR_VAR[props.data.nodeType]
  return {
    color: `var(${colorVar})`,
    backgroundColor: `color-mix(in srgb, var(${colorVar}) 12%, transparent)`,
    borderColor: `color-mix(in srgb, var(${colorVar}) 45%, transparent)`,
  }
})

/** 节点副标题：类型 + 配置摘要 */
const summary = computed(() => {
  const cfg = props.data.config as Record<string, unknown> | undefined
  switch (props.data.nodeType) {
    case 'HTTP': {
      const method = String(cfg?.method ?? 'GET').toUpperCase()
      const url = String(cfg?.url ?? '')
      return url ? `${method} ${url}` : '未配置 URL'
    }
    case 'BEAN': {
      const bean = String(cfg?.beanName ?? '')
      const method = String(cfg?.methodName ?? '')
      return bean || method ? `${bean || '?'}#${method || '?'}` : '未配置 Bean'
    }
    case 'SCRIPT':
      return 'Groovy 脚本'
    case 'CONDITION': {
      const variable = String(cfg?.variable ?? '')
      const op = String(cfg?.operator ?? '')
      const value = cfg?.value
      const showValue = op !== 'EMPTY' && op !== 'NOT_EMPTY' && value !== undefined && value !== ''
      return [variable, op, showValue ? String(value) : ''].filter(Boolean).join(' ') || '未配置条件'
    }
    case 'START':
      return '流程起点'
    case 'END':
      return '流程终点'
    default:
      return ''
  }
})
</script>

<style scoped>
.lf-node-card {
  position: relative;
  min-width: 168px;
  max-width: 220px;
  padding: 9px 12px 10px 15px;
  background: var(--el-bg-color);
  border: 1.5px solid var(--el-border-color-light);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(31, 36, 55, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  font-size: 13px;
}

.lf-node-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(31, 36, 55, 0.12);
}

/* 选中高亮：主色描边（vue-flow 侧 .selected .lf-node-card 规则兜底双保险） */
.lf-node-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--el-color-primary) 28%, transparent),
    0 6px 18px rgba(0, 0, 0, 0.1);
}

/* 类型色条 */
.type-bar {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3.5px;
  border-radius: 0 3px 3px 0;
  background: currentColor;
  opacity: 0.9;
}

/* 中性类型（START/END）色条弱化 */
.type-start .type-bar,
.type-end .type-bar {
  opacity: 0.55;
}

.node-delete {
  position: absolute;
  top: -9px;
  right: -9px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  z-index: 5;
}

.lf-node-card:hover .node-delete {
  display: flex;
}

.node-delete:hover {
  transform: scale(1.1);
}

.node-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.node-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 700;
}

.node-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-summary {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.node-tag {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 16px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-tag {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

.ignore-tag {
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-color-warning) 25%, transparent);
}

/* CONDITION 真/假分支标注 */
.handle-branch {
  cursor: crosshair;
}

.branch-label {
  position: absolute;
  bottom: -17px;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1;
  padding: 1px 5px;
  border-radius: 4px;
  pointer-events: none;
}

.label-true {
  left: 28%;
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
}

.label-false {
  left: 72%;
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
}
</style>
