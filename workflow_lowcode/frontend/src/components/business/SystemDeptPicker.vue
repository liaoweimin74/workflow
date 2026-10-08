<template>
  <el-tree-select
    :model-value="modelValue"
    :data="treeData"
    node-key="id"
    :props="{ label: 'label', children: 'children' }"
    :multiple="multiple"
    :disabled="disabled"
    :clearable="clearable"
    check-strictly
    filterable
    :render-after-expand="false"
    :loading="loading"
    :placeholder="placeholder"
    style="width: 100%"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * 系统组件·部门选择（Task 143）。
 *
 * 基于系统组织机构接口（GET /orgs/tree）封装的部门树选择组件，
 * 作为表单设计器 / 页面设计器「系统组件」分组的部门字段组件：
 * - 值语义：部门 id（number），多选为 id 数组（number[]）
 * - check-strictly：任意层级部门均可独立选中（父子不联动）
 * - 仅展示「启用」状态的部门节点（status === 1，与组织管理页语义一致）
 * - 业务表单列映射：id 为数字，VARCHAR 序列化回显类型不匹配 → 统一 JSON 保真
 *   （对齐 elTreeSelect 策略，见 ColumnConfigDialog / ColumnTypeMapper）
 */
import { ref, onMounted } from 'vue'
import { getOrgTree } from '@/api/org'
import type { TreeNode } from '@/types/org'

const props = withDefaults(defineProps<{
  /** 选中值（单选部门 id，多选 id 数组） */
  modelValue?: number | number[]
  /** 是否多选 */
  multiple?: boolean
  /** 禁用 */
  disabled?: boolean
  /** 占位提示 */
  placeholder?: string
  /** 是否可清空 */
  clearable?: boolean
}>(), {
  multiple: false,
  disabled: false,
  placeholder: '请选择部门',
  clearable: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | number[]): void
  (e: 'change', value: number | number[]): void
}>()

const loading = ref(false)
const treeData = ref<TreeNode[]>([])

/** 递归过滤停用节点（status===1 启用；与组织管理页「启用/停用」语义一致） */
function filterEnabled(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((n) => n.status === 1)
    .map((n) => (n.children?.length ? { ...n, children: filterEnabled(n.children) } : { ...n, children: [] }))
}

async function loadTree() {
  loading.value = true
  try {
    const res = await getOrgTree()
    treeData.value = filterEnabled(res.data || [])
  } catch {
    treeData.value = []
  } finally {
    loading.value = false
  }
}

function handleChange(value: number | number[]) {
  emit('update:modelValue', value)
  emit('change', value)
}

onMounted(loadTree)
</script>
