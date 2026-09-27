<template>
  <el-tabs v-model="activeTab" class="initiator-task-property-tabs">
    <!-- 发起人设置 -->
    <el-tab-pane label="发起人设置" name="initiator">
      <el-form label-width="80px" size="small" :disabled="readOnly">
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

        <el-divider content-position="left">发起人设置</el-divider>

        <el-form-item label="撤销撤回">
          <div class="switch-row">
            <el-switch v-model="initiator.disallowRecall" @change="saveConfig" />
            <span class="switch-label">不允许撤销/撤回</span>
          </div>
          <div class="hint-text">开启后，审批中的流程将不允许员工撤销/撤回</div>
        </el-form-item>

        <el-form-item label="审批催办">
          <div class="switch-row">
            <el-switch v-model="initiator.urgeEnabled" @change="saveConfig" />
            <span class="switch-label">审批催办</span>
          </div>
          <div class="hint-text">发起人可以催办审批人/办理人</div>
          <div v-if="initiator.urgeEnabled" class="urge-row">
            <span class="urge-text">每隔</span>
            <el-input-number
              v-model="initiator.urgeInterval"
              :min="1"
              :step="1"
              controls-position="right"
              size="small"
              style="width: 88px"
              @change="saveConfig"
            />
            <el-select
              v-model="initiator.urgeUnit"
              size="small"
              style="width: 72px"
              @change="saveConfig"
            >
              <el-option label="分钟" value="minute" />
              <el-option label="小时" value="hour" />
              <el-option label="天" value="day" />
            </el-select>
            <span class="urge-text">后可再次催办</span>
          </div>
        </el-form-item>

        <el-form-item label="再次发起">
          <div class="switch-row">
            <el-switch v-model="initiator.reInitiate" @change="saveConfig" />
            <span class="switch-label">再次发起</span>
          </div>
          <div class="hint-text">取消后，此审批将不再支持再次发起</div>
        </el-form-item>

        <el-form-item label="结束短信">
          <div class="switch-row">
            <el-switch v-model="initiator.smsOnEnd" @change="saveConfig" />
            <span class="switch-label">流程结束后发送短信给发起人</span>
          </div>
        </el-form-item>
      </el-form>
    </el-tab-pane>

    <!-- 字段权限设置 -->
    <el-tab-pane label="字段权限设置" name="form">
      <FormPropertyTab :read-only="readOnly" />
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

defineProps<{ readOnly?: boolean }>()

type ElementRegistryLike = { get(id: string): Element | undefined }

const designerStore = useDesignerStore()

const activeTab = ref('initiator')

let isLoading = false

const config = reactive({
  id: '',
  name: '',
  description: ''
})

/** 发起人设置（initiator 块）， urge 拍平为 UI 态 */
const initiator = reactive({
  disallowRecall: false,
  urgeEnabled: true,
  urgeInterval: 1,
  urgeUnit: 'hour' as 'minute' | 'hour' | 'day',
  reInitiate: true,
  smsOnEnd: false,
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

  // 重置默认值，避免残留上一节点
  initiator.disallowRecall = false
  initiator.urgeEnabled = true
  initiator.urgeInterval = 1
  initiator.urgeUnit = 'hour'
  initiator.reInitiate = true
  initiator.smsOnEnd = false

  // 加载已有 designerStore 配置覆盖（basic.name / basic.description / initiator 块）
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing?.basic) {
    if (existing.basic.name) config.name = existing.basic.name
    if (existing.basic.description) config.description = existing.basic.description
  }
  if (existing?.initiator) {
    initiator.disallowRecall = existing.initiator.disallowRecall ?? false
    initiator.urgeEnabled = existing.initiator.urge?.enabled ?? true
    initiator.urgeInterval = existing.initiator.urge?.interval ?? 1
    initiator.urgeUnit = existing.initiator.urge?.unit ?? 'hour'
    initiator.reInitiate = existing.initiator.reInitiate ?? true
    initiator.smsOnEnd = existing.initiator.smsOnEnd ?? false
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

  // 与现有写法一致：在已有配置上合并，不丢 form 等其他块
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!) || {}

  const nodeConfig: NodeConfigData = {
    ...existing,
    basic: {
      name: config.name,
      description: config.description
    },
    initiator: {
      disallowRecall: initiator.disallowRecall,
      urge: {
        enabled: initiator.urgeEnabled,
        interval: initiator.urgeInterval,
        unit: initiator.urgeUnit,
      },
      reInitiate: initiator.reInitiate,
      smsOnEnd: initiator.smsOnEnd,
    }
  }

  designerStore.setNodeConfig(designerStore.selectedNodeId, nodeConfig)
}

watch([config, initiator], () => {
  saveConfig()
}, { deep: true })
</script>

<style scoped>
.initiator-task-property-tabs {
  padding: 0;
}

.initiator-task-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.initiator-task-property-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
}

/* 开关行：switch + 说明标题同行 */
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.switch-label {
  font-size: 12px;
  color: var(--el-text-color-regular, #4b5169);
  font-weight: 600;
}

/* 开关下方灰色说明文字 */
.hint-text {
  width: 100%;
  font-size: 11px;
  color: var(--el-text-color-secondary, #8b91ab);
  line-height: 1.4;
  margin-top: 2px;
}

/* 催办频率行内编辑 */
.urge-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-top: 6px;
}

.urge-text {
  font-size: 12px;
  color: var(--el-text-color-regular, #4b5169);
  white-space: nowrap;
}
</style>
