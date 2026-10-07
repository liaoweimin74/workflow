<script setup lang="ts">
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'

/**
 * BATCH 空循环自环边（loop_start → loop_end 同节点闭合连线）。
 *
 * 为什么不用内置 smoothstep：自环两端 handle 同在节点右侧（原左侧问题时
 * 默认 offset 仅 20px，路径紧贴节点边缘且被「循环起点/终点」标签遮挡，
 * 视觉上几乎不可见）。此处固定外凸 56px 画出醒目的右侧 U 形虚线，
 * 与 FlowNode 上的循环连接点标签、画布吸附近似（selfLoopApproxPoints）同侧。
 *
 * 中点渲染「循环」pill 标签（EdgeLabelRenderer 层），给虚线一个显眼的语义锚点。
 * BaseEdge 内部 path 带 vue-flow__edge-path 类，logicflow-theme.css 的
 * .lf-edge-loop 紫罗兰虚线样式自动生效；交互命中区（双击拦截）由 BaseEdge 维护。
 */
const props = defineProps<EdgeProps>()

const pathInfo = computed(() =>
  getSmoothStepPath({
    sourceX: props.sourceX ?? 0,
    sourceY: props.sourceY ?? 0,
    targetX: props.targetX ?? 0,
    targetY: props.targetY ?? 0,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 10,
    offset: 56,
  })
)

const path = computed(() => pathInfo.value[0])
const labelX = computed(() => pathInfo.value[1])
const labelY = computed(() => pathInfo.value[2])
</script>

<template>
  <BaseEdge :path="path" :marker-end="markerEnd" />
  <EdgeLabelRenderer>
    <span
      class="lf-loop-edge-label"
      :style="{ left: `${labelX}px`, top: `${labelY}px` }"
    >
      循环
    </span>
  </EdgeLabelRenderer>
</template>
