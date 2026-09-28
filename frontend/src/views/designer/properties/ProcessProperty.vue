<template>
  <el-tabs v-model="activeTab" class="process-property-tabs">
    <!-- 流程配置（审批策略 + 流程编号合并） -->
    <el-tab-pane label="流程配置" name="process">
      <el-form label-width="90px" size="small" :disabled="readOnly">
        <el-divider content-position="left">审批人去重规则</el-divider>

        <el-form-item label="去重规则">
          <el-switch v-model="config.approvalPolicy.deduplication.enabled" @change="syncToStore" />
        </el-form-item>

        <template v-if="config.approvalPolicy.deduplication.enabled">
          <el-form-item label="去重规则">
            <el-radio-group v-model="config.approvalPolicy.deduplication.mode" @change="syncToStore">
              <el-radio value="CONSECUTIVE">连续出现同一审批人时，仅需审批一次</el-radio>
              <el-radio value="FIRST">全流程出现同一审批人时，仅第一次需审批</el-radio>
              <el-radio value="LAST">全流程出现同一审批人时，仅最后需一次审批</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="发起人免审">
            <div class="switch-row">
              <el-switch
                v-model="config.approvalPolicy.deduplication.skipSameAsInitiator"
                @change="syncToStore"
              />
              <span class="switch-label">发起人与审批人为同一人时无需审批</span>
            </div>
          </el-form-item>

          <el-form-item label="命中动作">
            <el-radio-group v-model="config.approvalPolicy.deduplication.action" @change="syncToStore">
              <el-radio value="AUTO_PASS">自动通过</el-radio>
              <el-radio value="SKIP">跳过节点</el-radio>
              <el-radio value="ESCALATE">转交上级</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <el-divider content-position="left">审批设置</el-divider>

        <el-form-item label="自定义摘要">
          <el-switch v-model="config.summaryRule.enabled" @change="syncToStore" />
          <div class="hint-text">开启后，最多添加5个摘要；若不开启，系统将展示默认的摘要</div>
        </el-form-item>

        <el-form-item v-if="config.summaryRule.enabled" label="摘要字段">
          <el-input
            v-model="summaryFieldsText"
            placeholder="表单字段名用英文逗号分隔，最多 5 个"
            @change="syncToStore"
          />
        </el-form-item>

        <el-form-item v-if="config.summaryRule.enabled" label="短信摘要">
          <el-switch v-model="config.summaryRule.showInSms" @change="syncToStore" />
          <div class="hint-text">在短信中展示摘要</div>
        </el-form-item>

        <el-form-item label="自定义标题">
          <el-switch v-model="config.titleRule.enabled" @change="syncToStore" />
          <div class="hint-text">开启后，审批标题支持自定义模板；关闭时使用默认的审批标题</div>
        </el-form-item>

        <el-form-item v-if="config.titleRule.enabled" label="标题模板">
          <el-input
            v-model="config.titleRule.pattern"
            placeholder="{{processName}}-{{initiator}}-{{date}}"
            @change="syncToStore"
          />
          <!-- v-pre：提示文案里的 {{var}} 是字面量示例，不能交给 Vue 插值编译
               （插值分词器遇到字符串内部的 }} 会提前闭合导致 SFC 编译 500） -->
          <div class="hint-text" v-pre>可用变量：{{processName}}、{{initiator}}、{{date}}、表单字段名</div>
        </el-form-item>

        <el-form-item label="动态流程">
          <el-switch v-model="config.dynamicProcess" @change="syncToStore" />
          <div class="hint-text">将实时查找审批人与条件分支（引擎运行时动态解析）</div>
        </el-form-item>

        <el-form-item label="评论管理">
          <el-switch v-model="commentEnabled" @change="syncToStore" />
          <div class="hint-text">开启后，可设置评论相关的功能</div>
        </el-form-item>

        <template v-if="commentEnabled">
          <el-checkbox
            v-model="config.approvalPolicy.comment.disabled"
            class="indent-checkbox"
            @change="syncToStore"
          >不允许评论</el-checkbox>
          <el-checkbox
            v-model="config.approvalPolicy.comment.disallowDelete"
            class="indent-checkbox"
            @change="syncToStore"
          >评论不允许删除</el-checkbox>
          <el-checkbox
            v-model="config.approvalPolicy.comment.disallowAttachment"
            class="indent-checkbox"
            @change="syncToStore"
          >评论时不允许上传附件/图片</el-checkbox>
        </template>

        <el-form-item label="审批召回">
          <el-switch v-model="config.approvalPolicy.approveRecall" @change="syncToStore" />
          <div class="hint-text">开启后，审批人可在下个节点审批前召回审批单重新审批；会签节点与依次审批节点的最后一位审批人不允许召回</div>
        </el-form-item>

        <el-divider content-position="left">节点操作权限</el-divider>

        <el-form-item label="允许驳回">
          <el-switch v-model="config.approvalPolicy.operations.allowReject" @change="syncToStore" />
        </el-form-item>

        <el-form-item label="允许加签">
          <el-switch v-model="config.approvalPolicy.operations.allowAddSign" @change="syncToStore" />
        </el-form-item>

        <el-form-item label="允许转办">
          <el-switch v-model="config.approvalPolicy.operations.allowTransfer" @change="syncToStore" />
        </el-form-item>

        <el-form-item label="允许委派">
          <el-switch v-model="config.approvalPolicy.operations.allowDelegate" @change="syncToStore" />
        </el-form-item>

        <div class="operations-hint">流程级总开关，节点级可覆盖；会签节点转办等同转签</div>

        <el-divider content-position="left">流程设置</el-divider>

        <el-form-item label="退回免审">
          <el-switch
            v-model="config.approvalPolicy.retakeSkipApproved"
            @change="syncToStore"
          />
          <div class="hint-text">流程退回后重新审批时，已通过节点无需再审批</div>
        </el-form-item>

        <el-form-item label="意见必填">
          <el-switch
            v-model="config.approvalPolicy.commentPolicy.enabled"
            @change="syncToStore"
          />
          <div class="hint-text">开启后，审批人办理必须填写意见；若与节点配置冲突，将按照全部操作必填&gt;拒绝/退回必填执行</div>
        </el-form-item>

        <el-form-item v-if="config.approvalPolicy.commentPolicy.enabled" label="必填范围">
          <el-radio-group
            v-model="config.approvalPolicy.commentPolicy.scope"
            @change="syncToStore"
          >
            <el-radio value="REJECT_RETURN">拒绝/退回必填</el-radio>
            <el-radio value="ALL">全部操作必填</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="手写签名">
          <el-switch
            v-model="config.approvalPolicy.signaturePolicy.enabled"
            @change="syncToStore"
          />
          <div class="hint-text">开启后，节点可使用手写签名；节点未单独配置时按以下默认项执行</div>
        </el-form-item>

        <template v-if="config.approvalPolicy.signaturePolicy.enabled">
          <el-checkbox
            v-model="config.approvalPolicy.signaturePolicy.useLast"
            class="indent-checkbox"
            @change="syncToStore"
          >默认使用上次签名</el-checkbox>
          <el-checkbox
            v-model="config.approvalPolicy.signaturePolicy.allowUpload"
            class="indent-checkbox"
            @change="syncToStore"
          >支持上传签名图片</el-checkbox>
          <el-checkbox
            v-model="config.approvalPolicy.signaturePolicy.required"
            class="indent-checkbox"
            @change="syncToStore"
          >必填签名</el-checkbox>
        </template>

        <el-form-item label="超时处理">
          <div class="timeout-head">
            <span class="hint-text timeout-hint">
              开启后，可按规则配置此审批的超时自动提醒、转派、通过、拒绝；此配置不对已开启超时处理的节点生效
            </span>
            <el-button size="small" type="primary" plain @click="openRuleDialog(null)">
              添加超时规则
            </el-button>
          </div>
        </el-form-item>

        <el-form-item v-if="config.timeoutRules.length > 0" label="规则组">
          <div class="timeout-rules">
            <div v-for="rule in config.timeoutRules" :key="rule.id" class="timeout-rule-item">
              <span class="rule-text">{{ ruleLabel(rule) }}</span>
              <span class="rule-actions">
                <el-button link type="primary" size="small" @click="openRuleDialog(rule.id)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeRule(rule.id)">删除</el-button>
              </span>
            </div>
          </div>
        </el-form-item>

        <el-divider content-position="left">流程编号</el-divider>

        <el-form-item label="自动编号">
          <el-switch v-model="config.numberRule.enabled" @change="syncToStore" />
        </el-form-item>

        <el-form-item v-if="config.numberRule.enabled" label="编号规则">
          <el-input
            v-model="config.numberRule.pattern"
            placeholder="{{year}}-{{seq:4}}"
            @change="syncToStore"
          />
          <div v-if="numberPreview" style="color: #999; font-size: 12px; margin-top: 4px">
            预览：{{ numberPreview }}
          </div>
        </el-form-item>
      </el-form>
    </el-tab-pane>

    <!-- 表单配置（原"默认表单"改名） -->
    <el-tab-pane label="表单配置" name="form">
      <ProcessFormPropertyTab :read-only="readOnly" />
    </el-tab-pane>
  </el-tabs>

  <!-- 超时规则编辑弹窗（挂在 tabs 外避免表单 disabled 连带） -->
  <ProcessTimeoutRuleDialog
    v-model:visible="ruleDialogVisible"
    :rules="config.timeoutRules"
    :edit-id="ruleEditId"
    @confirm="onRuleConfirm"
  />
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import {
  useDesignerStore,
  DEFAULT_PROCESS_CONFIG,
  type ProcessConfigData,
  type ProcessTimeoutRule,
} from '@/stores/designerStore'
import ProcessFormPropertyTab from './ProcessFormPropertyTab.vue'
import ProcessTimeoutRuleDialog from './ProcessTimeoutRuleDialog.vue'

const props = defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()

const activeTab = ref('process')

const config = reactive<ProcessConfigData>(JSON.parse(JSON.stringify(DEFAULT_PROCESS_CONFIG)))

const numberPreview = computed(() => {
  if (!config.numberRule.enabled || !config.numberRule.pattern) return ''
  const year = new Date().getFullYear()
  return config.numberRule.pattern
    .replace('{{year}}', String(year))
    .replace('{{seq:4}}', '0001')
    .replace('{{seq}}', '1')
})

// 摘要字段：数组 <-> 逗号分隔文本
const summaryFieldsText = computed({
  get: () => config.summaryRule.fields.join(','),
  set: (v: string) => {
    config.summaryRule.fields = v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .slice(0, 5)
  },
})

// 评论管理开关（三项任一启用视为开启；纯 UI 折叠开关）
const commentEnabled = computed({
  get: () =>
    config.approvalPolicy.comment.disabled ||
    config.approvalPolicy.comment.disallowDelete ||
    config.approvalPolicy.comment.disallowAttachment,
  set: (v: boolean) => {
    if (!v) {
      config.approvalPolicy.comment.disabled = false
      config.approvalPolicy.comment.disallowDelete = false
      config.approvalPolicy.comment.disallowAttachment = false
    }
  },
})

// ---- 超时规则组 ----
const ruleDialogVisible = ref(false)
const ruleEditId = ref<string | null>(null)

const UNIT_TEXT: Record<ProcessTimeoutRule['unit'], string> = {
  minute: '分钟',
  hour: '小时',
  day: '天',
}

const ACTION_LABEL: Record<ProcessTimeoutRule['action'], string> = {
  remind: '超时提醒',
  transfer: '超时转派',
  pass: '超时通过',
  refuse: '超时拒绝',
}

function ruleLabel(rule: ProcessTimeoutRule): string {
  const base = `${ACTION_LABEL[rule.action]}：超过 ${rule.duration} ${UNIT_TEXT[rule.unit]}`
  const extra: string[] = []
  if (rule.action === 'remind' && rule.repeat) extra.push('重复提醒')
  if (rule.notifyAssignee) extra.push('当前审批人')
  if (rule.notifyAdmin) extra.push('审批管理员')
  if (rule.notifyUserIds.length > 0) extra.push(`更多员工×${rule.notifyUserIds.length}`)
  if (rule.sms) extra.push('短信')
  return extra.length > 0 ? `${base}（${extra.join('、')}）` : base
}

function openRuleDialog(ruleId: string | null) {
  if (props.readOnly) return
  ruleEditId.value = ruleId
  ruleDialogVisible.value = true
}

function onRuleConfirm(rule: ProcessTimeoutRule) {
  const idx = config.timeoutRules.findIndex((r) => r.id === rule.id)
  if (idx >= 0) {
    config.timeoutRules.splice(idx, 1, rule)
  } else {
    config.timeoutRules.push(rule)
  }
  syncToStore()
}

function removeRule(ruleId: string) {
  config.timeoutRules = config.timeoutRules.filter((r) => r.id !== ruleId)
  syncToStore()
}

onMounted(async () => {
  const stored = designerStore.getProcessConfig()
  Object.assign(config, stored)
  syncToStore()
})

function syncToStore() {
  designerStore.setProcessConfig({ ...config })
}
</script>

<style scoped>
.process-property-tabs {
  padding: 0;
}

.process-property-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.process-property-tabs :deep(.el-tabs__content) {
  overflow-y: auto;
}

.operations-hint {
  color: #909399;
  font-size: 12px;
  margin: 4px 0 8px;
}

.hint-text {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 2px;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  color: #606266;
  font-size: 12px;
}

.indent-checkbox {
  display: flex;
  margin: 0 0 8px 12px;
}

.timeout-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.timeout-hint {
  margin-top: 0;
}

.timeout-rules {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.timeout-rule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}

.rule-actions {
  flex-shrink: 0;
}
</style>
