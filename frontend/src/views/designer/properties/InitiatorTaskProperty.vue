<template>
  <el-tabs v-model="activeTab" class="initiator-task-property-tabs">
    <!-- 节点配置 -->
    <el-tab-pane label="节点配置" name="node">
      <el-form label-width="80px" size="small">
        <el-divider content-position="left">基本信息</el-divider>

        <el-form-item label="节点ID">
          <el-input v-model="config.id" disabled />
        </el-form-item>

        <el-form-item label="节点名称">
          <el-input v-model="config.name" placeholder="请输入节点名称" @change="updateBpmn" />
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
      </el-form>
    </el-tab-pane>

    <!-- 表单配置 -->
    <el-tab-pane label="表单配置" name="form">
      <FormPropertyTab />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, watch } from 'vue'
import type { Element } from 'bpmn-js/lib/model/Types'
import { useDesignerStore, type NodeConfigData } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import {
  getNodeName,
  getDocumentation,
} from '../utils/nodeConfigAdapter'
import FormPropertyTab from './FormPropertyTab.vue'

type ElementRegistryLike = { get(id: string): Element | undefined }

const designerStore = useDesignerStore()

const activeTab = ref('node')

let isLoading = false

const config = reactive({
  id: '',
  name: '',
  description: ''
})

onMounted(() => {
  loadConfig()
})

// 切换同类型节点时重新加载配置（组件不重建，onMounted 不触发）
watch(() => designerStore.selectedNodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadConfig()
  }
})

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = modeler.get<ElementRegistryLike>('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId!)
  if (!element) return

  isLoading = true

  config.id = element.id
  config.name = getNodeName(element) || '发起节点'
  config.description = getDocumentation(element)

  // 加载已有 designerStore 配置覆盖（basic.name / basic.description）
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing?.basic) {
    if (existing.basic.name) config.name = existing.basic.name
    if (existing.basic.description) config.description = existing.basic.description
  }

  // BPMN element 无名称时写入默认值，确保持久化
  if (!getNodeName(element) && config.name) {
    const modeling = (modeler as any).get('modeling')
    modeling.updateProperties(element, { name: config.name })
  }

  setTimeout(() => { isLoading = false }, 0)
}

function updateBpmn() {
  const modeler = getModeler()
  const elementRegistry = modeler.get<ElementRegistryLike>('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const moddle = (modeler as any).get('moddle')
  const element = elementRegistry.get(designerStore.selectedNodeId!)
  if (!element) return

  const props: any = { name: config.name }
  if (config.description) {
    const doc = moddle.create('bpmn:Documentation', { text: config.description })
    props.documentation = [doc]
  }
  modeling.updateProperties(element, props)
  saveConfig()
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  if (isLoading) return

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!) || {}

  const nodeConfig: NodeConfigData = {
    ...existing,
    basic: {
      name: config.name,
      description: config.description
    }
  }

  designerStore.setNodeConfig(designerStore.selectedNodeId, nodeConfig)
}
</script>

<style scoped>
.initiator-task-property-tabs {
  padding: 0 8px;
}

.initiator-task-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.initiator-task-property-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
}
</style>
