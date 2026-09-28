<template>
  <div class="user-task-property">
    <!-- 顶部（tab 外）：节点名称 + 审批类型 -->
    <el-form label-width="7em" label-position="left" size="small" :disabled="readOnly" class="top-form">
      <el-form-item label="节点名称">
        <el-input v-model="config.name" placeholder="如：部门经理审批" @change="updateBpmnName" />
      </el-form-item>
    </el-form>

    <div class="section-title">审批类型</div>
    <el-radio-group
      :model-value="ui.approvalType"
      :disabled="readOnly"
      class="approval-type-group"
      @update:model-value="onApprovalTypeChange"
    >
      <el-radio value="artificial">人工审批</el-radio>
      <el-radio value="auto_pass">自动通过</el-radio>
      <el-radio value="auto_reject">自动拒绝</el-radio>
    </el-radio-group>

    <!-- 自动审批类型无需配置审批人：提示 + 禁用 tabs 内容 -->
    <el-alert
      v-if="isAutoType"
      class="auto-tip"
      type="info"
      :closable="false"
      show-icon
      title="自动审批类型无需配置审批人"
    />

    <el-alert
      v-else-if="!ui.approval.type"
      class="auto-tip"
      type="warning"
      :closable="false"
      show-icon
      title="请先选择审批人类型"
    />

    <el-tabs v-model="activeTab" class="user-task-property-tabs" :class="{ 'is-auto': isAutoType }">
      <!-- 审批人设置 -->
      <el-tab-pane label="审批人设置" name="assignee">
        <div class="tab-inner">
          <AssigneeSelector
            v-model="ui.approval.type"
            :user-ids="ui.approval.userIds"
            :role-codes="ui.approval.roleCodes"
            :allow-adjust="ui.assignee.allowInitiatorAdjust"
            :form-user-field="ui.approval.formUserField"
            :external-resolver="ui.approval.externalResolver"
            :external-params="ui.approval.externalParams"
            kind="approver"
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

          <div class="section-title">找不到审批人时</div>
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
            <el-radio value="skip">跳过此审批节点</el-radio>
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

          <div class="section-title">多人审批时采用审批方式</div>
          <el-radio-group
            v-model="ui.approval.multiMode"
            class="v-radio-group"
            :disabled="readOnly"
            @change="saveConfig"
          >
            <el-radio value="countersign">会签（需要所有人同意）</el-radio>
            <el-radio value="or_sign">或签（仅需其中一人同意）</el-radio>
            <el-radio value="sequential">依次审批</el-radio>
          </el-radio-group>

          <div class="section-title">消息通知</div>
          <el-checkbox v-model="ui.notifySms" :disabled="readOnly" @change="saveConfig">
            发送短信给审批人
          </el-checkbox>
        </div>
      </el-tab-pane>

      <!-- 高级设置 -->
      <el-tab-pane label="高级设置" name="advanced">
        <div class="tab-inner">
          <div class="section-title">审批人可进行的操作</div>
          <!-- 主选项横向一行：通过/拒绝固定开启且只读 -->
          <div class="checkbox-row">
            <el-checkbox :model-value="true" disabled>通过</el-checkbox>
            <el-checkbox :model-value="true" disabled>拒绝</el-checkbox>
            <el-checkbox v-model="ui.operations.allowTransfer" :disabled="readOnly">转派</el-checkbox>
            <el-checkbox v-model="ui.operations.allowReturn" :disabled="readOnly">退回</el-checkbox>
            <el-checkbox v-model="ui.operations.allowAddSign" :disabled="readOnly">加签</el-checkbox>
          </div>
          <!-- 二级选项：纵向展示在主选项下方 -->
          <template v-if="ui.operations.allowReturn">
            <div class="checkbox-col sub-items">
              <el-checkbox v-model="ui.returnOptions.restartFromHere" :disabled="readOnly">
                退回后，从此节点开始审批，已经通过的节点无需再次审批
              </el-checkbox>
              <el-checkbox v-model="ui.returnOptions.chooseStartNode" :disabled="readOnly">
                退回后，由审批人选择重审的起始节点
              </el-checkbox>
            </div>
          </template>
          <template v-if="ui.operations.allowAddSign">
            <div class="checkbox-col sub-items">
              <el-checkbox v-model="ui.returnOptions.mustAddSign" :disabled="readOnly">
                此节点必须加签
              </el-checkbox>
            </div>
          </template>

          <div class="section-title">审批意见必填</div>
          <div class="switch-row">
            <el-switch v-model="ui.commentRequired" :disabled="readOnly" />
            <span class="switch-label">审批意见必填</span>
          </div>
          <div class="hint-text">开启后，审批人必须填写审批意见</div>

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
          <div class="hint-text">支持审批超时的自动提醒、转派、通过、拒绝</div>
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
                <el-option label="自动通过" value="pass" />
                <el-option label="自动拒绝" value="refuse" />
              </el-select>
            </div>
          </template>

          <div class="section-title">审批人去重</div>
          <div class="switch-row">
            <el-switch v-model="ui.dedup.enabled" :disabled="readOnly" />
            <span class="switch-label">审批人去重</span>
          </div>
          <div class="hint-text">开启后，同一审批人不用重复审批</div>
          <div v-if="ui.dedup.enabled" class="checkbox-col sub-items">
            <div class="inline-row dedup-row">
              <el-checkbox
                v-model="ui.dedup.skipSameAsInitiator"
                :disabled="readOnly"
                @change="saveConfig"
              >
                审批人与
              </el-checkbox>
              <el-select
                size="small"
                disabled
                placeholder="发起人"
                style="width: 90px"
                class="dedup-select"
              />
              <span class="inline-label">相同时，此节点自动跳过</span>
            </div>
          </div>

          <div class="section-title">手写签名</div>
          <div class="switch-row">
            <el-switch v-model="ui.signature.enabled" :disabled="readOnly" />
            <span class="switch-label">手写签名</span>
          </div>
          <template v-if="ui.signature.enabled">
            <div class="checkbox-col sub-items">
              <el-checkbox v-model="ui.signature.useLast" :disabled="readOnly">默认使用上次签名</el-checkbox>
              <el-checkbox v-model="ui.signature.allowUpload" :disabled="readOnly">支持上传签名图片</el-checkbox>
              <el-checkbox v-model="ui.signature.required" :disabled="readOnly">必须签名</el-checkbox>
            </div>
          </template>
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
import { computed, reactive, ref, onMounted, watch } from 'vue'
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

// 加载标志：loadConfig 期间禁止 watch 触发 saveConfig，避免把新节点值写回旧节点
let isLoading = false

const config = reactive({
  name: ''
})

/** 面板 UI 态（保存时映射为冻结 schema 的 nodeConfigs 结构） */
const ui = reactive({
  /** 审批类型：artificial / auto_pass / auto_reject */
  approvalType: 'artificial' as 'artificial' | 'auto_pass' | 'auto_reject',
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
    allowRefuse: true,
    allowReturn: true,
    allowTransfer: true,
    allowAddSign: false,
    allowDelegate: false,
  },
  returnOptions: {
    restartFromHere: false,
    chooseStartNode: false,
    mustAddSign: false,
  },
  commentRequired: false,
  blockRecall: false,
  timeout: {
    enabled: false,
    duration: 24,
    action: 'remind' as 'remind' | 'escalate' | 'pass' | 'refuse',
  },
  dedup: {
    enabled: false,
    skipSameAsInitiator: false,
  },
  signature: {
    enabled: false,
    useLast: false,
    allowUpload: false,
    required: false,
  },
  notifySms: false,
})

/** 自动通过/自动拒绝：无需配置审批人，tabs 内容整体禁用 */
const isAutoType = computed(() => ui.approvalType === 'auto_pass' || ui.approvalType === 'auto_reject')

onMounted(() => {
  loadConfig()
})

// 切换同类型节点时重新加载配置（组件不重建，onMounted 不触发）
watch(() => designerStore.selectedNodeId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    loadConfig()
  }
})

function onApprovalTypeChange(value: string) {
  ui.approvalType = value as typeof ui.approvalType
  saveConfig()
}

function loadConfig() {
  const modeler = getModeler()
  const elementRegistry = (modeler as any).get('elementRegistry')
  const element = elementRegistry.get(designerStore.selectedNodeId)
  if (!element) return

  isLoading = true

  const bo = element.businessObject
  config.name = bo.name || ''

  // 重置为默认值，避免残留上一节点
  ui.approvalType = 'artificial'
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
  ui.operations.allowRefuse = true
  ui.operations.allowReturn = true
  ui.operations.allowTransfer = true
  ui.operations.allowAddSign = false
  ui.operations.allowDelegate = false
  ui.returnOptions.restartFromHere = false
  ui.returnOptions.chooseStartNode = false
  ui.returnOptions.mustAddSign = false
  ui.commentRequired = false
  ui.blockRecall = false
  ui.timeout.enabled = false
  ui.timeout.duration = 24
  ui.timeout.action = 'remind'
  ui.dedup.enabled = false
  ui.dedup.skipSameAsInitiator = false
  ui.signature.enabled = false
  ui.signature.useLast = false
  ui.signature.allowUpload = false
  ui.signature.required = false
  ui.notifySms = false

  // 加载已有配置覆盖默认值
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!)
  if (existing) {
    if (existing.approvalType) {
      ui.approvalType = existing.approvalType
    }
    if (existing.approval) {
      // 兼容旧配置：user / dept_head / expression 直接映射；发起人自己 initiator_self 恢复为合法选项
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
      // 兼容旧配置：旧 allowReject（驳回）映射到 allowReturn；
      // 拒绝/通过固定开启（UI 只读，allowRefuse 不再从存量配置读取）
      const legacyReject = existing.operations.allowReject
      ui.operations.allowRefuse = true
      ui.operations.allowReturn = existing.operations.allowReturn ?? legacyReject ?? true
      ui.operations.allowTransfer = existing.operations.allowTransfer ?? true
      ui.operations.allowAddSign = existing.operations.allowAddSign ?? false
      ui.operations.allowDelegate = existing.operations.allowDelegate ?? false
    }
    if (existing.returnOptions) {
      ui.returnOptions.restartFromHere = existing.returnOptions.restartFromHere ?? false
      ui.returnOptions.chooseStartNode = existing.returnOptions.chooseStartNode ?? false
      ui.returnOptions.mustAddSign = existing.returnOptions.mustAddSign ?? false
    }
    ui.commentRequired = existing.commentRequired ?? false
    ui.blockRecall = existing.blockRecall ?? false
    if (existing.timeout) {
      ui.timeout.enabled = existing.timeout.enabled ?? false
      ui.timeout.duration = existing.timeout.duration || 24
      ui.timeout.action = (existing.timeout.action as typeof ui.timeout.action) || 'remind'
    }
    if (existing.dedup) {
      ui.dedup.enabled = existing.dedup.enabled ?? false
      ui.dedup.skipSameAsInitiator = existing.dedup.skipSameAsInitiator ?? false
    }
    if (existing.signature) {
      ui.signature.enabled = existing.signature.enabled ?? false
      ui.signature.useLast = existing.signature.useLast ?? false
      ui.signature.allowUpload = existing.signature.allowUpload ?? false
      ui.signature.required = existing.signature.required ?? false
    }
    if (existing.notify) {
      ui.notifySms = existing.notify.sms ?? false
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

  // 在已有配置上合并，保留 form 等未在本面板编辑的块与旧 operations 键
  const existing = designerStore.getNodeConfig(designerStore.selectedNodeId!) || {}

  const nodeConfig: NodeConfigData = {
    ...existing,
    basic: {
      ...(existing.basic || {}),
      name: config.name
    },
    taskRole: 'approver',
    approvalType: ui.approvalType,
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
      allowPass: true,
      // 通过/拒绝固定开启（UI 只读，不随配置关闭）
      allowRefuse: true,
      allowReturn: ui.operations.allowReturn,
      allowAddSign: ui.operations.allowAddSign,
      allowTransfer: ui.operations.allowTransfer,
      allowDelegate: ui.operations.allowDelegate,
    },
    returnOptions: {
      restartFromHere: ui.returnOptions.restartFromHere,
      chooseStartNode: ui.returnOptions.chooseStartNode,
      mustAddSign: ui.returnOptions.mustAddSign,
    },
    commentRequired: ui.commentRequired,
    blockRecall: ui.blockRecall,
    timeout: {
      enabled: ui.timeout.enabled,
      duration: ui.timeout.duration,
      action: ui.timeout.action,
    },
    dedup: {
      enabled: ui.dedup.enabled,
      skipSameAsInitiator: ui.dedup.skipSameAsInitiator,
    },
    signature: {
      enabled: ui.signature.enabled,
      useLast: ui.signature.useLast,
      allowUpload: ui.signature.allowUpload,
      required: ui.signature.required,
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
.user-task-property {
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
  border-left: 3px solid var(--el-color-primary);
  margin: 14px 0 8px;
  line-height: 1.2;
}

.approval-type-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
}

.approval-type-group .el-radio {
  margin-right: 0;
}

.auto-tip {
  margin: 8px 0;
}

.auto-tip :deep(.el-alert__title) {
  font-size: 12px;
}

/* 自动审批类型：tabs 内容整体禁用（tab 仍可切换查看） */
.user-task-property-tabs.is-auto :deep(.el-tabs__content) {
  pointer-events: none;
  opacity: 0.55;
}

.user-task-property-tabs {
  padding: 0;
}

.user-task-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.user-task-property-tabs :deep(.el-tabs__content) {
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

/* 主选项横向一行（审批人可进行的操作：通过/拒绝只读 + 可勾选项） */
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

/* 允许 xx 勾选后显示的子项：缩进 */
.sub-items {
  margin: 4px 0 4px 16px;
  padding-left: 8px;
  border-left: 1px dashed var(--el-border-color-lighter, #eef1fc);
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

/* 行内编辑（超时时长/动作、去重条件） */
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

.dedup-row {
  flex-wrap: wrap;
}

.dedup-row .el-checkbox :deep(.el-checkbox__label) {
  white-space: nowrap;
}

.to-user-picker {
  margin: 8px 0 4px;
}
</style>
