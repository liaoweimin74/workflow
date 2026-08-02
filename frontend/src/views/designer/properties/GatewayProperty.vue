<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="节点ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：金额判断" @change="updateBpmn" />
    </el-form-item>

    <el-divider content-position="left">
      网关说明<el-tooltip :content="gatewayTip" placement="top"><el-icon class="help-icon"><QuestionFilled /></el-icon></el-tooltip>
    </el-divider>

    <el-form-item label="描述">
      <el-input
        v-model="config.description"
        type="textarea"
        :rows="2"
        placeholder="请输入网关描述"
      />
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

const config = reactive({
  id: '',
  name: '',
  description: ''
})

const gatewayType = computed(() => {
  const type = designerStore.selectedNodeType || ''
  if (type.includes('Exclusive')) return 'exclusive'
  if (type.includes('Parallel')) return 'parallel'
  if (type.includes('Inclusive')) return 'inclusive'
  return ''
})

const gatewayTip = computed(() => {
  switch (gatewayType.value) {
    case 'exclusive': return '排他网关：根据条件选择一条路径执行（XOR）'
    case 'parallel': return '并行网关：所有路径同时执行（AND）'
    case 'inclusive': return '包含网关：满足条件的路径同时执行（OR）'
    default: return ''
  }
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
  config.name = bo.name || ''
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
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (element) {
    modeling.updateProperties(element, { name: config.name })
  }
}
</script>

<style scoped>
.help-icon {
  font-size: 13px;
  color: #c0c4cc;
  cursor: help;
  margin-left: 2px;
  vertical-align: super;
  display: inline-flex;
  align-items: center;
}
</style>
