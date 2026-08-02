<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="连线ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="连线名称">
      <el-input v-model="config.name" placeholder="如：同意" @change="updateBpmn" />
    </el-form-item>

    <el-divider content-position="left">条件配置</el-divider>

    <el-form-item label="条件类型">
      <el-radio-group v-model="condition.type">
        <el-radio value="none">无条件</el-radio>
        <el-radio value="expression">条件表达式</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item v-if="condition.type === 'expression'" label="条件表达式">
      <el-input
        v-model="condition.expression"
        type="textarea"
        :rows="3"
        placeholder="如：${amount > 10000}"
        @change="updateCondition"
      />
      <div class="hint-text">
        Flowable UEL 表达式，支持变量比较、方法调用等
      </div>
    </el-form-item>

    <el-form-item v-if="condition.type === 'expression'" label="常用条件">
      <el-select
        v-model="condition.preset"
        placeholder="选择预设条件"
        clearable
        style="width: 100%"
        @change="applyPreset"
      >
        <el-option label="同意" value="${approved == true}" />
        <el-option label="拒绝" value="${approved == false}" />
        <el-option label="金额大于1万" value="${amount > 10000}" />
        <el-option label="金额大于10万" value="${amount > 100000}" />
      </el-select>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from 'vue'
import { useDesignerStore } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'

const designerStore = useDesignerStore()

const config = reactive({
  id: '',
  name: ''
})

const condition = reactive({
  type: 'none' as 'none' | 'expression',
  expression: '',
  preset: ''
})

onMounted(() => {
  loadConfig()
})

// 切换同类型连线时重新加载配置
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

  // 重置条件，避免残留上一连线
  condition.type = 'none'
  condition.expression = ''
  condition.preset = ''

  // 读取条件表达式
  const cond = bo.conditionExpression
  if (cond) {
    if (typeof cond === 'object') {
      condition.expression = cond.body || ''
    } else if (typeof cond === 'string') {
      condition.expression = cond
    }
    if (condition.expression) {
      condition.type = 'expression'
    }
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

function updateCondition() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const moddle = (modeler as any).get('moddle')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  if (condition.type === 'expression' && condition.expression) {
    const cond = moddle.create('bpmn:FormalExpression', { body: condition.expression })
    modeling.updateProperties(element, { conditionExpression: cond })
  } else {
    modeling.updateProperties(element, { conditionExpression: undefined })
  }
}

function applyPreset(value: string) {
  if (value) {
    condition.expression = value
    updateCondition()
  }
}
</script>

<style scoped>
.hint-text {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
