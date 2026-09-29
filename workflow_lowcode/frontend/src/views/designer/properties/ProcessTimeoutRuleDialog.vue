<template>
  <el-dialog
    :model-value="visible"
    :title="editing ? '超时规则' : '超时规则'"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="rule-alert"
      title="同一规则组超时提醒可以添加多个，超时转派只能添加1个，超时通过和超时拒绝只能添加其中1个；超时通过和超时拒绝的配置对办理人节点不生效"
    />

    <!-- 规则类型选择（编辑已有规则时锁定类型） -->
    <div class="action-cards">
      <div
        v-for="opt in ACTION_OPTIONS"
        :key="opt.value"
        class="action-card"
        :class="[opt.value, { active: form.action === opt.value, disabled: isActionLocked(opt.value) }]"
        @click="!isActionLocked(opt.value) && (form.action = opt.value)"
      >
        <span class="action-icon" :style="{ background: opt.color }">{{ opt.icon }}</span>
        <span class="action-label">{{ opt.label }}</span>
      </div>
    </div>

    <el-divider content-position="left">时间设置</el-divider>
    <div class="time-row">
      当前流程到达该审批节点并超过
      <el-input-number v-model="form.duration" :min="1" :max="999" size="small" controls-position="right" />
      <el-select v-model="form.unit" size="small" style="width: 90px">
        <el-option label="分钟" value="minute" />
        <el-option label="小时" value="hour" />
        <el-option label="天" value="day" />
      </el-select>
      未处理时{{ form.action === 'remind' ? '自动提醒' : ACTION_TEXT[form.action] }}
      <el-checkbox v-if="form.action === 'remind'" v-model="form.repeat">重复提醒</el-checkbox>
    </div>

    <template v-if="form.action === 'remind' || form.action === 'transfer'">
      <el-divider content-position="left">人员设置</el-divider>
      <div class="people-row">
        <span class="people-label">被提醒人：</span>
        <!-- 当前审批人：默认勾选且只读（产品规则）；引擎侧 notifyAssignee 缺省即 true，仅显式 false 才关闭 -->
        <el-checkbox v-model="form.notifyAssignee" disabled>当前审批人</el-checkbox>
        <el-checkbox v-model="form.notifyAdmin">{{ form.action === 'transfer' ? '转派给审批管理员' : '审批管理员' }}</el-checkbox>
        <el-checkbox v-if="form.action === 'remind'" v-model="moreStaffEnabled">更多员工</el-checkbox>
      </div>
      <el-input
        v-if="moreStaffEnabled && form.action === 'remind'"
        v-model="moreStaffInput"
        size="small"
        placeholder="多个用户 ID 用英文逗号分隔"
        class="more-staff-input"
      />
    </template>

    <el-divider content-position="left">通知设置</el-divider>
    <div class="notify-row">
      <span class="notify-label">通知方式：</span>
      <el-checkbox v-model="form.sms">短信通知</el-checkbox>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { ProcessTimeoutRule } from '@/stores/designerStore'

const props = defineProps<{
  visible: boolean
  /** 已存在的规则（用于唯一性校验） */
  rules: ProcessTimeoutRule[]
  /** 编辑的规则 ID（null=新增） */
  editId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', rule: ProcessTimeoutRule): void
}>()

const ACTION_OPTIONS = [
  { value: 'remind' as const, label: '超时提醒', icon: '提', color: '#f59e0b' },
  { value: 'transfer' as const, label: '超时转派', icon: '转', color: '#3b82f6' },
  { value: 'pass' as const, label: '超时通过', icon: '过', color: '#10b981' },
  { value: 'refuse' as const, label: '超时拒绝', icon: '拒', color: '#ef4444' },
]

const ACTION_TEXT: Record<string, string> = {
  remind: '自动提醒',
  transfer: '自动转派',
  pass: '自动通过',
  refuse: '自动拒绝',
}

function emptyForm(): ProcessTimeoutRule {
  return {
    id: '',
    action: 'remind',
    duration: 3,
    unit: 'hour',
    repeat: false,
    notifyAssignee: true,
    notifyAdmin: false,
    notifyUserIds: [],
    sms: true,
  }
}

const form = reactive<ProcessTimeoutRule>(emptyForm())
const editing = ref(false)
const moreStaffEnabled = ref(false)
const moreStaffInput = ref('')

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    const existing = props.editId === null ? null : props.rules.find((r) => r.id === props.editId)
    if (existing) {
      Object.assign(form, JSON.parse(JSON.stringify(existing)))
      // 只读语义：存量规则里显式 false 一并归一为勾选态
      form.notifyAssignee = true
      editing.value = true
      moreStaffEnabled.value = existing.notifyUserIds.length > 0
      moreStaffInput.value = existing.notifyUserIds.join(',')
    } else {
      Object.assign(form, emptyForm())
      editing.value = false
      moreStaffEnabled.value = false
      moreStaffInput.value = ''
    }
  },
)

/** 唯一性约束：转派只能 1 条；通过/拒绝互斥且各 1 条（编辑自身除外） */
function isActionLocked(action: ProcessTimeoutRule['action']): boolean {
  const others = props.rules.filter((r) => r.id !== props.editId)
  if (action === 'transfer') return others.some((r) => r.action === 'transfer')
  if (action === 'pass') return others.some((r) => r.action === 'pass' || r.action === 'refuse')
  if (action === 'refuse') return others.some((r) => r.action === 'pass' || r.action === 'refuse')
  return false
}

function confirm() {
  if (!Number.isFinite(form.duration) || form.duration < 1) return
  const rule: ProcessTimeoutRule = {
    ...form,
    id: editing.value ? form.id : `rule-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    duration: Math.floor(form.duration),
    notifyAssignee: true,
    notifyUserIds:
      form.action === 'remind' && moreStaffEnabled.value
        ? moreStaffInput
            .value
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s !== '')
        : [],
  }
  emit('confirm', rule)
  emit('update:visible', false)
}

function resetForm() {
  Object.assign(form, emptyForm())
  editing.value = false
  moreStaffEnabled.value = false
  moreStaffInput.value = ''
}
</script>

<style scoped>
/* 分组标题左对齐：与属性面板口径一致——去掉默认 padding-left:20px，字形与内容左缘平齐（Task 82） */
:deep(.el-divider--horizontal .el-divider__text.is-left) {
  left: 0;
  padding-left: 0;
}

.rule-alert {
  margin-bottom: 12px;
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.action-card:hover {
  border-color: #c0c4cc;
}

.action-card.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb inset;
}

.action-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
}

.action-label {
  font-size: 13px;
  color: #303133;
}

.time-row,
.people-row,
.notify-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #606266;
}

.more-staff-input {
  margin-top: 4px;
  width: 100%;
}
</style>
