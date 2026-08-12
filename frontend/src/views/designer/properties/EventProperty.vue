<template>
  <el-form label-width="80px" size="small" :disabled="readOnly">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="节点ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="节点名称">
      <el-input v-model="config.name" disabled />
    </el-form-item>

    <el-form-item label="节点描述">
      <el-input
        v-model="config.description"
        type="textarea"
        :rows="2"
        placeholder="请输入节点描述"
        @change="updateBpmn"
      />
    </el-form-item>

    <!-- 表单配置（开始事件） -->
    <FormPropertyTab :read-only="readOnly" />
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, computed } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import FormPropertyTab from './FormPropertyTab.vue'

defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()

const config = reactive({
  id: '',
  name: '',
  description: ''
})

/** 开始/结束事件名称固定，不可编辑 */
const fixedName = computed(() => {
  const type = designerStore.selectedNodeType || ''
  if (type === 'StartEvent') return '开始'
  if (type === 'EndEvent') return '结束'
  return null
})

onMounted(() => {
  loadConfig()
})

// 切换同类型节点时重新加载配置
watch(() => designerStore.selectedNodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadConfig()
  }
})

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  const bo = element.businessObject
  config.id = element.id
  config.name = fixedName.value ?? bo.name ?? ''
  config.description = ''

  const docs = bo.documentation
  if (Array.isArray(docs) && docs.length > 0) {
    config.description = docs[0].text || ''
  }
}

function updateBpmn() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const moddle = (modeler as any).get('moddle')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  const props: any = { name: fixedName.value ?? config.name }
  if (config.description) {
    const doc = moddle.create('bpmn:Documentation', { text: config.description })
    props.documentation = [doc]
  }
  modeling.updateProperties(element, props)
}
</script>
