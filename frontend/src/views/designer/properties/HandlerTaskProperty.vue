<template>
  <div class="handler-task-property">
    <!-- 顶部（tab 外）：节点名称 -->
    <el-form label-width="7em" label-position="left" size="small" :disabled="readOnly" class="top-form">
      <el-form-item label="节点名称">
        <el-input v-model="config.name" placeholder="如：行政办理" @change="updateBpmnName" />
      </el-form-item>
    </el-form>

    <el-tabs v-model="activeTab" class="handler-task-property-tabs">
      <!-- 办理人设置 -->
      <el-tab-pane label="办理人设置" name="assignee">
        <div class="tab-inner">
          <AssigneeSelector
            v-model="ui.approval.type"
            :user-ids="ui.approval.userIds"
            :role-codes="ui.approval.roleCodes"
            :allow-adjust="ui.assignee.allowInitiatorAdjust"
            :form-user-field="ui.approval.formUserField"
            :external-resolver="ui.approval.externalResolver"
            :external-params="ui.approval.externalParams"
            kind="handler"
            :disabled="readOnly"
            @update:user-ids="(ids: number[]) => (ui.approval.userIds = ids)"
            @update:role-codes="(codes: string[]) => (ui.approval.roleCodes = codes)"
            @update:allow-adjust="(v: boolean) => (ui.assignee.allowInitiatorAdjust = v)"
            @update:form-user-field="(v: string) => (ui.approval.formUserField = v)"
            @update:external-resolver="(v: string) => (ui.approval.externalResolver = v)"
            @update:external-params="(p: Record<string, unknown>) => (ui.approval.externalParams = p)"
          />

          <template v-if="ui.approval.type === 'expression'">
            <div class="section-title">流程表达式</div>
            <el-input
              v-model="ui.approval.expression"
              type="textarea"
              :rows="2"
              placeholder="如：${initiator.deptManager}"
              :disabled="readOnly"
              @change="saveConfig"
            />
          </template>

          <div class="section-title">找不到办理人时</div>
          <el-radio-group
            v-model="ui.assignee.noAssigneePolicy"
            class="v-radio-group"
            :disabled="readOnly"
            @change="saveConfig"
          >
            <el-radio value="auto_pass">自动通过</el-radio>
            <el-radio value="block">禁止提交流程</el-radio>
            <el-radio value="to_admin">转交审批管理员</el-radio>
            <el-radio value="to_user">转交指定用户</el-radio>
            <el-radio value="skip">跳过此办理节点</el-radio>
            <el-radio value="supervisor">由发起人主管代审批</el-radio>
          </el-radio-group>
          <ApproverPicker
            v-if="ui.assignee.noAssigneePolicy === 'to_user'"
            v-model="ui.assignee.toUserIds"
            :multiple="false"
            :disabled="readOnly"
            placeholder="选择转交用户"
            class="to-user-picker"
            @change="saveConfig"
          />

          <div class="section-title">多人办理时采用的处理方式为</div>
          <el-radio-group
            v-model="ui.approval.multiMode"
            class="v-radio-group"
            :disabled="readOnly"
            @change="saveConfig"
          >
            <el-radio value="countersign">会签（需要所有人全部处理）</el-radio>
            <el-radio value="or_sign">或签（仅需其中一人处理）</el-radio>
            <el-radio value="sequential">依次处理</el-radio>
          </el-radio-group>

          <div class="section-title">消息通知</div>
          <el-checkbox v-model="ui.notifySms" :disabled="readOnly" @change="saveConfig">
            发送短信给办理人
          </el-checkbox>
        </div>
      </el-tab-pane>

      <!-- 高级设置 -->
      <el-tab-pane label="高级设置" name="advanced">
        <div class="tab-inner">
          <div class="section-title">办理人可进行的操作</div>
          <!-- 主选项横向一行：提交固定开启且只读 -->
          <div class="checkbox-row">
            <el-checkbox :model-value="true" disabled>提交</el-checkbox>
            <el-checkbox v-model="ui.operations.allowTransfer" :disabled="readOnly">转派</el-checkbox>
            <el-checkbox v-model="ui.operations.allowReturn" :disabled="readOnly">退回</el-checkbox>
            <el-checkbox v-model="ui.operations.allowAddSign" :disabled="readOnly">加签</el-checkbox>
          </div>

          <div class="section-title">处理意见必填</div>
          <div class="switch-row">
            <el-switch v-model="ui.commentRequired" :disabled="readOnly" />
            <span class="switch-label">处理意见必填</span>
          </div>
          <div class="hint-text">开启后，办理人必须填写处理意见</div>

          <div class="section-title">禁止撤销/撤回</div>
          <div class="switch-row">
            <el-switch v-model="ui.blockRecall" :disabled="readOnly" />
            <span class="switch-label">流程到达此节点后禁止撤销/撤回</span>
          </div>

          <div class="section-title">超时处理</div>
          <div class="switch-row">
            <el-switch v-model="ui.timeout.enabled" :disabled="readOnly" />
            <span class="switch-label">超时处理</span>
          </div>
          <div class="hint-text">支持办理超时自动提醒、转派</div>
          <template v-if="ui.timeout.enabled">
            <div class="inline-row">
              <span class="inline-label">时长</span>
              <el-input-number
                v-model="ui.timeout.duration"
                :min="1"
                :step="1"
                controls-position="right"
                size="small"
                style="width: 100px"
                :disabled="readOnly"
                @change="saveConfig"
              />
              <span class="inline-label">小时</span>
            </div>
            <div class="inline-row">
              <span class="inline-label">动作</span>
              <el-select
                v-model="ui.timeout.action"
                size="small"
                style="width: 140px"
                :disabled="readOnly"
                @change="saveConfig"
              >
                <el-option label="自动提醒" value="remind" />
                <el-option label="自动转派" value="escalate" />
              </el-select>
            </div>
          </template>

          <div class="section-title">手写签名</div>
          <div class="switch-row">
            <el-switch v-model="ui.signature.enabled" :disabled="readOnly" />
            <span class="switch-label">手写签名</span>
          </div>
        </div>
      </el-tab-pane>

      <!-- 字段权限设置 -->
      <el-tab-pane label="字段权限设置" name="form">
        <FormPropertyTab :read-only="readOnly" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, watch } from 'vue'
import { useDesignerStore, type NodeConfigData } from '@/stores/designerStore'
import { getModeler } from '../utils/bpmnModeler'
import { ApproverPicker } from '@/components/business'
import FormPropertyTab from './FormPropertyTab.vue'
import AssigneeSelector from './shared/AssigneeSelector.vue'

defineProps<{ readOnly?: boolean }>()

/** approval.type 可选值（取自冻结 schema） */
type ApprovalTypeValue = NonNullable<NonNullable<NodeConfigData['approval']>['type']>

const designerStore = useDesignerStore()

const activeTab = ref('assignee')

// 加载标志：loadConfig 期间禁止 watch 触发 saveConfig
let isLoading = false

const config = reactive({
  name: ''
})

/** 面板 UI 态（保存时映射为冻结 schema 的 nodeConfigs 结构） */
const ui = reactive({
  approval: {
    type: '' as string,
    userIds: [] as number[],
    roleCodes: [] as string[],
    expression: '',
    formUserField: '',
    externalResolver: '',
    externalParams: {} as Record<string, unknown>,
    multiMode: '' as 'countersign' | 'or_sign' | 'sequential' | '',
  },
  assignee: {
    allowInitiatorAdjust: false,
    noAssigneePolicy: '' as '' | 'auto_pass' | 'block' | 'to_admin' | 'to_user' | 'skip' | 'supervisor',
    toUserIds: [] as number[],
  },
  operations: {
    allowReturn: true,
    allowTransfer: true,
    allowAddSign: false,
  },
  commentRequired: false,
  blockRecall: false,
  timeout: {
    enabled: false,
    duration: 24,
    action: 'remind' as 'remind' | 'escalate',
  },
  signature: {
    enabled: false,
  },
  notifySms: false,
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
  config.name = bo.name || ''

  // 重置为默认值，避免残留上一节点
  ui.approval.type = ''
  ui.approval.userIds = []
  ui.approval.roleCodes = []
  ui.approval.expression = ''
  ui.approval.formUserField = ''
  ui.approval.externalResolver = ''
  ui.approval.externalParams = {}
  ui.approval.multiMode = ''
  ui.assignee.allowInitiatorAdjust = false
  ui.assignee.noAssigneePolicy = ''
  ui.assignee.toUserIds = []
  ui.operations.allowReturn = true
  ui.operations.allowTransfer = true
  ui.operations.allowAddSign = false
  ui.commentRequired = false
  ui.blockRecall = false
  ui.timeout.enabled = false
  ui.timeout.duration = 24
  ui.timeout.action = 'remind'
  ui.signature.enabled = false
  ui.notifySms = false

  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing) {
    if (existing.approval) {
      ui.approval.type = existing.approval.type || ''
      ui.approval.userIds = (existing.approval.userIds || []).map((id) => Number(id))
      ui.approval.roleCodes = (existing.approval.roleCodes || []).map((c) => String(c))
      ui.approval.expression = existing.approval.expression || ''
      ui.approval.formUserField = existing.approval.formUserField || ''
      ui.approval.externalResolver = existing.approval.external?.resolver || ''
      ui.approval.externalParams = { ...(existing.approval.external?.params ?? {}) }
      ui.approval.multiMode = existing.approval.multiMode || ''
    }
    if (existing.assigneeOptions) {
      ui.assignee.allowInitiatorAdjust = existing.assigneeOptions.allowInitiatorAdjust ?? false
      ui.assignee.noAssigneePolicy = existing.assigneeOptions.noAssigneePolicy || ''
      ui.assignee.toUserIds = existing.assigneeOptions.toUserId
        ? [Number(existing.assigneeOptions.toUserId)].filter((n) => !Number.isNaN(n))
        : []
    }
    if (existing.operations) {
      ui.operations.allowTransfer = existing.operations.allowTransfer ?? true
      ui.operations.allowReturn = existing.operations.allowReturn ?? true
      ui.operations.allowAddSign = existing.operations.allowAddSign ?? false
    }
    ui.commentRequired = existing.commentRequired ?? false
    ui.blockRecall = existing.blockRecall ?? false
    if (existing.timeout) {
      ui.timeout.enabled = existing.timeout.enabled ?? false
      ui.timeout.duration = existing.timeout.duration || 24
      ui.timeout.action = (existing.timeout.action as typeof ui.timeout.action) || 'remind'
    }
    if (existing.signature) {
      ui.signature.enabled = existing.signature.enabled ?? false
    }
    if (existing.notify) {
      ui.notifySms = existing.notify.sms ?? false
    }
  }

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

  // 在已有配置上合并，保留 form 等未在本面板编辑的块
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!) || {}

  const nodeConfig: NodeConfigData = {
    ...existing,
    basic: {
      ...(existing.basic || {}),
      name: config.name
    },
    taskRole: 'handler',
    approval: {
      type: (ui.approval.type || undefined) as ApprovalTypeValue | undefined,
      userIds: ui.approval.type === 'user' && ui.approval.userIds.length > 0 ? ui.approval.userIds : undefined,
      roleCodes: ui.approval.type === 'role' && ui.approval.roleCodes.length > 0 ? [...ui.approval.roleCodes] : undefined,
      expression: ui.approval.type === 'expression' ? ui.approval.expression || undefined : undefined,
      formUserField:
        ui.approval.type === 'form_user' ? ui.approval.formUserField || undefined : undefined,
      external:
        ui.approval.type === 'external' && ui.approval.externalResolver
          ? {
              resolver: ui.approval.externalResolver,
              // 函数参数值表（空对象不落盘，保持历史配置形状）
              ...(Object.keys(ui.approval.externalParams ?? {}).length > 0
                ? { params: { ...ui.approval.externalParams } }
                : {}),
            }
          : undefined,
      multiMode: ui.approval.multiMode,
    },
    assigneeOptions: {
      allowInitiatorAdjust: ui.assignee.allowInitiatorAdjust,
      noAssigneePolicy: ui.assignee.noAssigneePolicy,
      toUserId:
        ui.assignee.noAssigneePolicy === 'to_user' && ui.assignee.toUserIds.length > 0
          ? String(ui.assignee.toUserIds[0])
          : null,
    },
    operations: {
      ...(existing.operations || {}),
      // 提交固定允许（allowPass 语义：主按钮可执行）
      allowPass: true,
      allowTransfer: ui.operations.allowTransfer,
      allowReturn: ui.operations.allowReturn,
      allowAddSign: ui.operations.allowAddSign,
      // 办理节点无通过/拒绝语义，写 false 避免运行时误显示
      allowRefuse: false,
      allowReject: false,
      allowDelegate: false,
    },
    commentRequired: ui.commentRequired,
    blockRecall: ui.blockRecall,
    timeout: {
      enabled: ui.timeout.enabled,
      duration: ui.timeout.duration,
      action: ui.timeout.action,
    },
    signature: {
      enabled: ui.signature.enabled,
    },
    notify: {
      sms: ui.notifySms,
    },
  }

  designerStore.setNodeConfig(designerStore.selectedNodeId, nodeConfig)
}

watch(ui, () => {
  saveConfig()
}, { deep: true })
</script>

<style scoped>
.handler-task-property {
  display: flex;
  flex-direction: column;
}

.top-form {
  margin-bottom: 4px;
}

/* 分区标题：左竖条 + 加粗（截图风格『▎标题』） */
.section-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1f2437);
  padding-left: 8px;
  border-left: 3px solid #2e9e6e;
  margin: 14px 0 8px;
  line-height: 1.2;
}

.handler-task-property-tabs {
  padding: 0;
}

.handler-task-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.handler-task-property-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
}

.tab-inner {
  padding-bottom: 8px;
}

/* 竖排 radio 组 */
.v-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

.v-radio-group .el-radio {
  height: 26px;
  margin-right: 0;
}

.v-radio-group .el-radio :deep(.el-radio__label) {
  font-size: 12px;
}

/* 竖排 checkbox 组 */
.checkbox-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: 2px;
}

/* 主选项横向一行（办理人可进行的操作：提交只读 + 可勾选项） */
.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  gap: 0 14px;
}

.checkbox-row .el-checkbox {
  height: auto;
  margin-right: 0;
}

.checkbox-row .el-checkbox :deep(.el-checkbox__label) {
  font-size: 12px;
  white-space: nowrap;
}

.checkbox-col .el-checkbox {
  height: auto;
  margin-right: 0;
}

.checkbox-col .el-checkbox :deep(.el-checkbox__label) {
  font-size: 12px;
  white-space: normal;
  line-height: 1.35;
}

/* 开关行 */
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 12px;
  color: var(--el-text-color-regular, #4b5169);
}

/* 开关下方灰色说明 */
.hint-text {
  font-size: 11px;
  color: var(--el-text-color-secondary, #8b91ab);
  line-height: 1.4;
  margin: 2px 0 6px;
}

/* 行内编辑（超时时长/动作） */
.inline-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
}

.inline-label {
  font-size: 12px;
  color: var(--el-text-color-regular, #4b5169);
  white-space: nowrap;
}

.to-user-picker {
  margin: 8px 0 4px;
}
</style>
