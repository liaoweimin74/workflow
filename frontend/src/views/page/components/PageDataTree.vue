<template>
  <el-tree
    :data="treeData"
    v-loading="loading"
    v-bind="treeAttrs"
    @node-click="handleNodeClick"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/utils/http'

/** 动作总线（PageRendererPage provide）：dispatch(trigger, eventData) */
const actionBus = inject<{ dispatch: (trigger: string, eventData: any) => void } | undefined>('pageActionBus')

const props = defineProps<{
  /** 页面 key（数据源查询接口路径） */
  pageKey: string
  /** 数据源绑定 id */
  dataSourceId?: string
  /** 数据源 refId */
  refId?: string
  /** 树属性（node-key/props/highlightCurrent 等） */
  [key: string]: any
}>()

const emit = defineEmits<{
  (e: 'node-click', node: any): void
  (e: 'loaded', data: any[]): void
  (e: 'ready', instance: any): void
}>()

const treeData = ref<any[]>([])
const loading = ref(false)

const treeAttrs = computed(() => {
  const { pageKey, dataSourceId, refId, ...rest } = props as any
  return rest
})

async function fetchData() {
  const dsId = props.dataSourceId || props.refId
  // 设计器画布中无 pageKey（渲染页才注入），跳过加载避免无效请求
  if (!dsId || !props.pageKey) {
    treeData.value = []
    return
  }
  loading.value = true
  try {
    const res: any = await http.get(`/v1/pages/${props.pageKey}/ds/${dsId}/data`, {
    params: { page: 1, size: 200 },
    })
    const data = res?.data ?? res
    treeData.value = (data.records || []).map((r: any) => ({ ...(r.data || {}), id: r.id }))
    emit('loaded', treeData.value)
  } catch {
    treeData.value = []
    ElMessage.error('页面树数据源加载失败')
  } finally {
    loading.value = false
  }
}

function refresh() {
  fetchData()
}

function handleNodeClick(node: any) {
  // el-tree node-click 第一个参数是节点业务数据（data，含 id/name 等）
  emit('node-click', node)
  // 通过动作总线直接触发（不依赖 form-create 的 on 桥接）
  actionBus?.dispatch('node-click', { node, row: node })
}

defineExpose({ refresh, fetchData, treeData })

onMounted(() => {
  emit('ready', { refresh, fetchData, treeData })
  fetchData()
})
</script>
