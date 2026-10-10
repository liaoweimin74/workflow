<template>
  <div class="stree" :class="{ 'is-scroll': scroll }">
    <div
      v-for="row in rows"
      :key="row.key"
      class="stree-row"
      :style="{ paddingLeft: 2 + row.depth * 14 + 'px' }"
    >
      <span class="stree-branch" :class="{ 'has-kids': row.kids }">{{ row.kids ? '▾' : '·' }}</span>
      <span class="stree-path">{{ row.node.path }}</span>
      <span v-if="row.node.type" class="stree-type">{{ row.node.type }}</span>
    </div>
    <div v-if="!rows.length" class="stree-empty">（空结构）</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 字段结构树只读查看器（FieldNode[] 缩进树：路径 + 类型徽标，任意深度）。
 * 使用场景：JSON 实例导入对话框「当前已导入结构」、formData 一键导入查看。
 * 规模上限与推断一致（总量 ≤300 节点），滚动容器内平铺即可，无需虚拟滚动。
 */
import { computed } from 'vue'
import type { FieldNode } from '../utils/dsl'

interface Row {
  key: string
  node: FieldNode
  depth: number
  kids: boolean
}

const props = withDefaults(
  defineProps<{
    /** 字段结构树（FieldNode 与变量选择器共用模型） */
    nodes?: FieldNode[] | null
    /** 超高滚动（默认开：外层不限高时传 false 交给父容器） */
    scroll?: boolean
  }>(),
  { nodes: null, scroll: true }
)

/** 行扁平化（前序遍历，任意深度；key 用完整点路径保证唯一） */
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const walk = (list: FieldNode[], depth: number, prefix: string): void => {
    for (const n of list || []) {
      if (!n?.path) continue
      const key = prefix + n.path
      out.push({ key, node: n, depth, kids: !!n.children?.length })
      if (n.children?.length) walk(n.children, depth + 1, key + '.')
    }
  }
  walk(props.nodes || [], 0, '')
  return out
})
</script>

<style scoped>
.stree {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light);
  padding: 6px 8px;
}
.stree.is-scroll {
  max-height: 260px;
  overflow-y: auto;
}
.stree.is-scroll::-webkit-scrollbar {
  width: 6px;
}
.stree.is-scroll::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}
.stree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 22px;
  min-width: 0;
}
.stree-branch {
  flex: none;
  width: 12px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 10px;
}
.stree-branch.has-kids {
  color: var(--el-color-primary);
}
.stree-path {
  font-family: var(--el-font-family, monospace);
  font-size: 12px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
/* 类型徽标：右对齐轻量 pill（与变量选择器 vp-type 同风格） */
.stree-type {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
.stree-empty {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding: 4px 2px;
}
</style>
