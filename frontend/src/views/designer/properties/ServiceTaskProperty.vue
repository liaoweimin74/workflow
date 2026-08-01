<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="节点ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：发送通知" @change="updateBpmn" />
    </el-form-item>

    <el-divider content-position="left">服务配置</el-divider>

    <el-form-item label="服务类型">
      <el-select v-model="config.serviceType" placeholder="请选择" style="width: 100%">
        <el-option label="Java 服务调用" value="java" />
        <el-option label="表达式" value="expression" />
        <el-option label="HTTP 调用" value="http" />
      </el-select>
    </el-form-item>

    <el-form-item v-if="config.serviceType === 'java'" label="Bean 名称">
      <el-input v-model="config.beanName" placeholder="如：notifyService" />
    </el-form-item>

    <el-form-item v-if="config.serviceType === 'java'" label="方法名">
      <el-input v-model="config.methodName" placeholder="如：sendNotification" />
    </el-form-item>

    <el-form-item v-if="config.serviceType === 'expression'" label="表达式">
      <el-input
        v-model="config.expression"
        type="textarea"
        :rows="2"
        placeholder="如：${notifyService.sendNotification(execution)}"
      />
    </el-form-item>

    <el-form-item v-if="config.serviceType === 'http'" label="URL">
      <el-input v-model="config.url" placeholder="https://..." />
    </el-form-item>

    <el-form-item v-if="config.serviceType === 'http'" label="请求方法">
      <el-select v-model="config.httpMethod" style="width: 100%">
        <el-option label="GET" value="GET" />
        <el-option label="POST" value="POST" />
        <el-option label="PUT" value="PUT" />
        <el-option label="DELETE" value="DELETE" />
      </el-select>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

const config = reactive({
  id: '',
  name: '',
  serviceType: 'java',
  beanName: '',
  methodName: '',
  expression: '',
  url: '',
  httpMethod: 'POST'
})

onMounted(() => {
  loadConfig()
})

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  const bo = element.businessObject
  config.id = element.id
  config.name = bo.name || ''

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing) {
    // 加载已有配置
    Object.assign(config, existing)
  }
}

function updateBpmn() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (element) {
    modeling.updateProperties(element, { name: config.name })
  }
}
</script>
