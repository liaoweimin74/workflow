<template>
  <el-tabs v-model="activeTab" class="process-property-tabs">
    <!-- 流程配置（审批策略 + 流程编号合并） -->
    <el-tab-pane label="流程配置" name="process">
      <el-form label-width="7em" label-position="left" size="small" :disabled="readOnly" class="process-form">
        <el-divider content-position="left">基本属性</el-divider>

        <el-form-item label="流程名称">
          <el-input
            v-model="basicForm.name"
            placeholder="请输入流程名称"
            maxlength="100"
            @change="syncBasicToStore"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="流程标识创建后不可修改，供部署版本关联与系统集成使用">流程标识</FormLabelTip>
          </template>
          <el-input v-model="basicForm.key" disabled />
        </el-form-item>

        <el-form-item label="所属分类">
          <el-select
            v-model="basicForm.categoryId"
            class="category-select"
            placeholder="请选择分类"
            clearable
            filterable
            @change="syncBasicToStore"
          >
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="流程说明">
          <el-input
            v-model="basicForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="流程用途等补充说明，保存后生效"
            @change="syncBasicToStore"
          />
        </el-form-item>

        <el-divider content-position="left">权限设置</el-divider>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="限制谁可以发起该流程；指定人员时，命中名单或拥有所选角色之一才可发起（系统管理员不受限）">可发起人员</FormLabelTip>
          </template>
          <el-radio-group v-model="config.starterScope.mode" @change="syncToStore">
            <el-radio value="ALL">所有人</el-radio>
            <el-radio value="SPECIFIED">指定人员</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="config.starterScope.mode === 'SPECIFIED'">
          <el-form-item label="指定用户">
            <ApproverPicker
              :model-value="starterUserIds"
              placeholder="请选择可发起人员"
              @update:model-value="onStarterUsersChange"
            />
          </el-form-item>
          <el-form-item label="指定角色">
            <el-select
              v-model="config.starterScope.roleIds"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入角色编码"
              @change="syncToStore"
            >
              <el-option v-for="code in roleOptions" :key="code" :label="code" :value="code" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="超时转派/被提醒人与「找不到办理人」兜底优先取此名单（第一人为转派对象），未配置时回落系统管理员">审批管理员</FormLabelTip>
          </template>
          <ApproverPicker
            :model-value="adminUserIdsNum"
            placeholder="请选择审批管理员"
            @update:model-value="onAdminUsersChange"
          />
        </el-form-item>

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

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，最多添加5个摘要；若不开启，系统将展示默认的摘要">自定义摘要</FormLabelTip>
          </template>
          <el-switch v-model="config.summaryRule.enabled" @change="syncToStore" />
        </el-form-item>

        <el-form-item v-if="config.summaryRule.enabled" label="摘要字段">
          <el-input
            v-model="summaryFieldsText"
            placeholder="表单字段名用英文逗号分隔，最多 5 个"
            @change="syncToStore"
          />
        </el-form-item>

        <el-form-item v-if="config.summaryRule.enabled">
          <template #label>
            <FormLabelTip tip="在短信中展示摘要">短信摘要</FormLabelTip>
          </template>
          <el-switch v-model="config.summaryRule.showInSms" @change="syncToStore" />
        </el-form-item>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，审批标题支持自定义模板；关闭时使用默认的审批标题">自定义标题</FormLabelTip>
          </template>
          <el-switch v-model="config.titleRule.enabled" @change="syncToStore" />
        </el-form-item>

        <el-form-item v-if="config.titleRule.enabled">
          <template #label>
            <FormLabelTip :tip="TITLE_PATTERN_TIP">标题模板</FormLabelTip>
          </template>
          <el-input
            v-model="config.titleRule.pattern"
            placeholder="{{processName}}-{{initiator}}-{{date}}"
            @change="syncToStore"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="将实时查找审批人与条件分支（引擎运行时动态解析）">动态流程</FormLabelTip>
          </template>
          <el-switch v-model="config.dynamicProcess" @change="syncToStore" />
        </el-form-item>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，可设置评论相关的功能">评论管理</FormLabelTip>
          </template>
          <el-switch v-model="commentEnabled" @change="syncToStore" />
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

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，审批人可在下个节点审批前召回审批单重新审批；会签节点与依次审批节点的最后一位审批人不允许召回">审批召回</FormLabelTip>
          </template>
          <el-switch v-model="config.approvalPolicy.approveRecall" @change="syncToStore" />
        </el-form-item>

        <el-divider content-position="left">节点操作权限</el-divider>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="流程级总开关，节点级可覆盖；会签节点转办等同转签">允许驳回</FormLabelTip>
          </template>
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

        <el-divider content-position="left">流程设置</el-divider>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="流程退回后重新审批时，已通过节点无需再审批">退回免审</FormLabelTip>
          </template>
          <el-switch
            v-model="config.approvalPolicy.retakeSkipApproved"
            @change="syncToStore"
          />
        </el-form-item>

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，审批人办理必须填写意见；若与节点配置冲突，将按照全部操作必填>拒绝/退回必填执行">意见必填</FormLabelTip>
          </template>
          <el-switch
            v-model="config.approvalPolicy.commentPolicy.enabled"
            @change="syncToStore"
          />
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

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，节点可使用手写签名；节点未单独配置时按以下默认项执行">手写签名</FormLabelTip>
          </template>
          <el-switch
            v-model="config.approvalPolicy.signaturePolicy.enabled"
            @change="syncToStore"
          />
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

        <el-form-item>
          <template #label>
            <FormLabelTip tip="开启后，可按规则配置此审批的超时自动提醒、转派、通过、拒绝；此配置不对已开启超时处理的节点生效">超时处理</FormLabelTip>
          </template>
          <el-button size="small" type="primary" plain @click="openRuleDialog(null)">
            添加超时规则
          </el-button>
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
import { categoryApi, type Category } from '@/api/category'
import { getRoleList } from '@/api/role'
import { ApproverPicker } from '@/components/business'
import ProcessFormPropertyTab from './ProcessFormPropertyTab.vue'
import ProcessTimeoutRuleDialog from './ProcessTimeoutRuleDialog.vue'
import FormLabelTip from './shared/FormLabelTip.vue'

/** 标题模板可用变量（tooltip 内容；script 字符串常量避开模板插值分词器，见 Task 71 教训） */
const TITLE_PATTERN_TIP = '可用变量：{{processName}}、{{initiator}}、{{date}}、表单字段名'

const props = defineProps<{ readOnly?: boolean }>()

const designerStore = useDesignerStore()

const activeTab = ref('process')

const config = reactive<ProcessConfigData>(JSON.parse(JSON.stringify(DEFAULT_PROCESS_CONFIG)))

// ---- 权限设置（Task 76：可发起人员范围 + 流程级审批管理员） ----

/** 角色编码选项（与 AssigneeSelector 同源：getRoleList → roleCode，支持手动输入） */
const roleOptions = ref<string[]>([])

/** starterScope.userIds（字符串）↔ ApproverPicker（number[]）双向适配 */
const starterUserIds = computed(() =>
  config.starterScope.userIds.map(Number).filter((n) => Number.isFinite(n)),
)
const adminUserIdsNum = computed(() =>
  config.adminUserIds.map(Number).filter((n) => Number.isFinite(n)),
)

function onStarterUsersChange(ids: number[]) {
  config.starterScope.userIds = ids.map(String)
  syncToStore()
}

function onAdminUsersChange(ids: number[]) {
  config.adminUserIds = ids.map(String)
  syncToStore()
}

/** 角色列表拉取失败不阻断面板（仍可手动输入编码，与 AssigneeSelector 一致） */
async function loadRoleOptions() {
  try {
    const res = await getRoleList({ page: 1, size: 100 })
    roleOptions.value = (res.data?.rows ?? [])
      .map((r) => String(r.roleCode ?? ''))
      .filter((code) => code !== '')
  } catch {
    roleOptions.value = []
  }
}

// ---- 流程基本属性（Task 74：名称/标识/分类/说明，设计器内首次可编辑） ----
const basicForm = reactive<{ name: string; key: string; categoryId: string | null; description: string }>({
  name: '',
  key: '',
  categoryId: null,
  description: '',
})
const categories = ref<Category[]>([])

/** 分类加载失败不阻断面板（http 拦截器已提示），下拉空列表可关闭重进 */
async function loadCategories() {
  try {
    const res = await categoryApi.list()
    categories.value = res.data || []
  } catch {
    categories.value = []
  }
}

/** 基本属性变更同步 store：名称 → 工具栏/导出文件名联动；保存/部署时随 payload 落库 */
function syncBasicToStore() {
  designerStore.setDraftBasicInfo({
    name: basicForm.name,
    categoryId: basicForm.categoryId,
    description: basicForm.description,
  })
}

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
  // 基本属性回读：设计器加载 editorData 后已 setDraft/setDraftBasicInfo 入 store，
  // 面板仅在选中流程（数据就绪）后挂载，此处直接回读即为最新值
  basicForm.name = designerStore.draftName || ''
  basicForm.key = designerStore.draftKey || ''
  basicForm.categoryId = designerStore.draftCategoryId
  basicForm.description = designerStore.draftDescription
  void loadCategories()
  void loadRoleOptions()

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

.category-select {
  width: 100%;
}

/* Label 插槽内 FormLabelTip 与控件同行垂直居中：覆盖 label 默认行高（左对齐，Task 77） */
.process-form :deep(.el-form-item__label) {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  height: auto;
  min-height: 24px;
  line-height: 1.4;
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
