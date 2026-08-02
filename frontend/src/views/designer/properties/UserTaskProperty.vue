<template>
  <el-form label-width="90px" size="small">
    <el-divider content-position="left">基本信息</el-divider>

    <el-form-item label="节点ID">
      <el-input v-model="config.id" disabled />
    </el-form-item>

    <el-form-item label="节点名称">
      <el-input v-model="config.name" placeholder="如：部门经理审批" @change="updateBpmnName" />
    </el-form-item>

    <el-divider content-position="left">审批人配置</el-divider>

    <el-form-item label="审批类型">
      <el-radio-group v-model="approval.type" @change="saveConfig">
        <el-radio value="user">指定用户</el-radio>
        <el-radio value="dept_head">部门负责人</el-radio>
        <el-radio value="initiator_self">发起人自选</el-radio>
        <el-radio value="expression">流程表达式</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-form-item v-if="approval.type === 'user'" label="审批用户">
      <ApproverPicker
        v-model="approval.userIds"
        @change="saveConfig"
      />
    </el-form-item>

    <el-form-item v-if="approval.type === 'expression'" label="表达式">
      <el-input
        v-model="approval.expression"
        type="textarea"
        :rows="2"
        placeholder="如：${initiator.deptManager}"
        @change="saveConfig"
      />
    </el-form-item>

    <el-form-item v-if="approval.type && approval.type !== 'initiator_self'" label="多人模式">
      <el-radio-group v-model="approval.multiMode" @change="saveConfig">
        <el-radio value="countersign">会签</el-radio>
        <el-radio value="or_sign">或签</el-radio>
      </el-radio-group>
    </el-form-item>

    <el-divider content-position="left">操作权限</el-divider>

    <el-form-item label="允许驳回">
      <el-switch v-model="operations.allowReject" @change="saveConfig" />
    </el-form-item>

    <el-form-item label="允许加签">
      <el-switch v-model="operations.allowAddSign" @change="saveConfig" />
    </el-form-item>

    <el-form-item label="允许转办">
      <el-switch v-model="operations.allowTransfer" @change="saveConfig" />
    </el-form-item>

    <el-divider content-position="left">超时设置</el-divider>

    <el-form-item label="超时时间">
      <el-input-number
        v-model="timeout.duration"
        :min="0"
        :step="1"
        controls-position="right"
        style="width: 120px"
        @change="saveConfig"
      />
      <span style="margin-left: 8px; color: #909399;">小时</span>
    </el-form-item>

    <el-form-item label="超时动作">
      <el-select v-model="timeout.action" placeholder="请选择" style="width: 100%" @change="saveConfig">
        <el-option label="提醒" value="remind" />
        <el-option label="升级" value="escalate" />
      </el-select>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { reactive, onMounted, watch } from 'vue'
import { useDesignerStore, type NodeConfigData } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import { ApproverPicker } from '@/components/business'

const designerStore = useDesignerStore()

// 加载标志：loadConfig 期间禁止 watch 触发 saveConfig，避免把新节点值写回旧节点
let isLoading = false

const config = reactive({
  id: '',
  name: ''
})

const approval = reactive({
  type: '' as 'user' | 'dept_head' | 'initiator_self' | 'expression' | '',
  userIds: [] as number[],
  expression: '',
  multiMode: 'countersign' as 'countersign' | 'or_sign'
})

const operations = reactive({
  allowReject: true,
  allowAddSign: false,
  allowTransfer: true
})

const timeout = reactive({
  duration: 0,
  action: 'remind' as 'remind' | 'escalate'
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
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  isLoading = true

  const bo = element.businessObject
  config.id = element.id
  config.name = bo.name || ''

  // 重置为默认值，避免残留上一节点
  approval.type = ''
  approval.userIds = []
  approval.expression = ''
  approval.multiMode = 'countersign'
  operations.allowReject = true
  operations.allowAddSign = false
  operations.allowTransfer = true
  timeout.duration = 0
  timeout.action = 'remind'

  // 加载已有配置覆盖默认值
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing) {
    if (existing.approval) {
      approval.type = existing.approval.type || ''
      approval.userIds = existing.approval.userIds || []
      approval.expression = existing.approval.expression || ''
      approval.multiMode = existing.approval.multiMode || 'countersign'
    }
    if (existing.operations) {
      operations.allowReject = existing.operations.allowReject ?? true
      operations.allowAddSign = existing.operations.allowAddSign ?? false
      operations.allowTransfer = existing.operations.allowTransfer ?? true
    }
    if (existing.timeout) {
      timeout.duration = existing.timeout.duration || 0
      timeout.action = existing.timeout.action || 'remind'
    }
  }

  // nextTick 后恢复，确保 watch 不捕获加载期间的变更
  setTimeout(() => { isLoading = false }, 0)
}

function updateBpmnName() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const modeling = (modeler as any).get('modeling')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (element) {
    modeling.updateProperties(element, { name: config.name })
  }
}

function saveConfig() {
  if (!designerStore.selectedNodeId) return
  if (isLoading) return

  const nodeConfig: NodeConfigData = {
    basic: {
      name: config.name
    },
    approval: {
      type: approval.type || undefined,
      userIds: approval.userIds.length > 0 ? approval.userIds : undefined,
      expression: approval.expression || undefined,
      multiMode: approval.multiMode
    },
    operations: {
      allowReject: operations.allowReject,
      allowAddSign: operations.allowAddSign,
      allowTransfer: operations.allowTransfer
    },
    timeout: {
      duration: timeout.duration,
      action: timeout.action
    }
  }

  designerStore.setNodeConfig(designerStore.selectedNodeId, nodeConfig)
}

watch([config, approval, operations, timeout], () => {
  saveConfig()
}, { deep: true })
</script>
