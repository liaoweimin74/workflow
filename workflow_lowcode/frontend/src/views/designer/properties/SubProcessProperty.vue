<template>
  <el-form label-width="90px" size="small" :disabled="readOnly">
    <el-divider content-position="left">基本信息</el-divider>
    <el-form-item label="节点ID"><el-input v-model="config.id" disabled /></el-form-item>
    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：入职处理" @change="updateBpmn" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="config.description" type="textarea" :rows="3" @change="saveConfig" />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'

defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()
const config = reactive({ id: '', name: '', description: '' })

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return
  const bo = element.businessObject
  config.id = element.id
  config.name = bo.name || ''
  config.description = designerStore.getNodeConfig(element.id)?.basic?.description || ''
}

function updateBpmn() {
  const modeler = getModeler()
  const modeling = (modeler as any).get('modeling')
  const element = (modeler as any).get('elementRegistry').get(designerStore.selectedNodeId)
  if (element) modeling.updateProperties(element, { name: config.name })
  saveConfig()
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  designerStore.setNodeConfig(designerStore.selectedNodeId, {
    basic: { name: config.name, description: config.description },
  })
}

onMounted(loadConfig)
watch(() => designerStore.selectedNodeId, (n, o) => { if (n && n !== o) loadConfig() })
</script>