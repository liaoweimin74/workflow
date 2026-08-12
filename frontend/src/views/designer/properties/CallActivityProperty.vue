<template>
  <el-form label-width="90px" size="small" :disabled="readOnly">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="节点ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：调用审批子流程" @change="updateBpmn" />
    </el-form-item>

    <el-divider content-position="left">子流程配置</el-divider>

    <el-form-item label="调用子流程">
      <el-select
        v-model="config.calledElement"
        placeholder="请选择已部署的流程"
        filterable
        style="width: 100%"
        @change="updateBpmn"
      >
        <el-option
          v-for="item in subflowOptions"
          :key="item.key"
          :label="`${item.name} (v${item.version})`"
          :value="item.key"
        />
      </el-select>
    </el-form-item>

    <el-divider content-position="left">输入参数</el-divider>
    <div class="param-hint">父流程变量 → 子流程变量</div>
    <div
      v-for="(param, index) in config.inParams"
      :key="'in-' + index"
      class="param-row"
    >
      <el-input v-model="param.source" placeholder="父流程变量" size="small" style="width: 40%" />
      <el-icon class="param-arrow"><Right /></el-icon>
      <el-input v-model="param.target" placeholder="子流程变量" size="small" style="width: 40%" />
      <el-button type="danger" :icon="Delete" circle size="small" :disabled="readOnly" @click="removeInParam(index)" />
    </div>
    <el-button type="primary" link size="small" :disabled="readOnly" @click="addInParam">+ 添加输入参数</el-button>

    <el-divider content-position="left">输出参数</el-divider>
    <div class="param-hint">子流程变量 → 父流程变量</div>
    <div
      v-for="(param, index) in config.outParams"
      :key="'out-' + index"
      class="param-row"
    >
      <el-input v-model="param.source" placeholder="子流程变量" size="small" style="width: 40%" />
      <el-icon class="param-arrow"><Right /></el-icon>
      <el-input v-model="param.target" placeholder="父流程变量" size="small" style="width: 40%" />
      <el-button type="danger" :icon="Delete" circle size="small" :disabled="readOnly" @click="removeOutParam(index)" />
    </div>
    <el-button type="primary" link size="small" :disabled="readOnly" @click="addOutParam">+ 添加输出参数</el-button>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch, ref } from 'vue'
import { Delete, Right } from '@element-plus/icons-vue'
import { useDesignerStore, type ParamMapping } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import { processDesignApi, type ProcessDefinitionSummary } from '@/api/processDefinition'

defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()

const subflowOptions = ref<ProcessDefinitionSummary[]>([])

const config = reactive({
  id: '',
  name: '',
  calledElement: '',
  inParams: [] as ParamMapping[],
  outParams: [] as ParamMapping[]
})

onMounted(() => {
  loadConfig()
  loadSubflows()
})

watch(() => designerStore.selectedNodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadConfig()
  }
})

function loadSubflows() {
  processDesignApi.listSummaries().then(res => {
    subflowOptions.value = res.data || []
  }).catch(() => {
    // API 不可用时静默处理，下拉为空
  })
}

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  const bo = element.businessObject

  config.id = element.id
  config.name = bo.name || ''
  config.calledElement = bo.get('calledElement') || ''
  config.inParams = []
  config.outParams = []

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing?.callActivity) {
    config.calledElement = existing.callActivity.calledElement || config.calledElement
    config.inParams = (existing.callActivity.inParams || []).map(p => ({ ...p }))
    config.outParams = (existing.callActivity.outParams || []).map(p => ({ ...p }))
  }
}

function updateBpmn() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (element) {
    modeling.updateProperties(element, {
      name: config.name,
      calledElement: config.calledElement || undefined
    })
  }
  saveConfig()
}

function addInParam() {
  config.inParams.push({ source: '', target: '' })
  saveConfig()
}

function removeInParam(index: number) {
  config.inParams.splice(index, 1)
  saveConfig()
}

function addOutParam() {
  config.outParams.push({ source: '', target: '' })
  saveConfig()
}

function removeOutParam(index: number) {
  config.outParams.splice(index, 1)
  saveConfig()
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  designerStore.setNodeConfig(designerStore.selectedNodeId, {
    basic: { name: config.name },
    callActivity: {
      calledElement: config.calledElement || undefined,
      inParams: config.inParams.filter(p => p.source || p.target),
      outParams: config.outParams.filter(p => p.source || p.target)
    }
  })
}
</script>

<style scoped>
.param-hint {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.param-arrow {
  color: #909399;
  font-size: 14px;
  flex-shrink: 0;
}
</style>
