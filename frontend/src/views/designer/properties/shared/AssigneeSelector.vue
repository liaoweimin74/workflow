<template>
  <div class="assignee-selector">
    <!-- 四列 radio 网格：普通审批 / 组织架构 / 表单相关 / 其他 -->
    <div class="as-grid" :class="{ 'is-disabled': disabled }">
      <div v-for="group in visibleGroups" :key="group.title" class="as-col">
        <div class="as-col-title">{{ group.title }}</div>
        <el-radio-group
          :model-value="modelValue"
          class="as-radio-group"
          :disabled="disabled"
          @update:model-value="onTypeChange"
        >
          <el-radio
            v-for="opt in group.options"
            :key="opt.value"
            :value="opt.value"
            class="as-radio"
          >
            {{ opt.label }}<span v-if="opt.advanced" class="as-advanced">高级</span>
          </el-radio>
        </el-radio-group>
      </div>
    </div>

    <!-- 指定用户：ApproverPicker 多选 + 允许发起人调整 -->
    <template v-if="modelValue === 'user'">
      <div class="section-title">指定{{ kind === 'handler' ? '办理人' : '审批人' }}</div>
      <ApproverPicker
        :model-value="userIds ?? []"
        :disabled="disabled"
        @update:model-value="(ids: number[]) => emit('update:userIds', ids)"
        @change="() => emit('change')"
      />
      <el-checkbox
        :model-value="allowAdjust"
        :disabled="disabled"
        class="as-adjust"
        @update:model-value="(v: boolean) => emit('update:allowAdjust', v)"
        @change="() => emit('change')"
      >
        允许发起人调整{{ kind === 'handler' ? '办理人' : '审批人' }}
      </el-checkbox>
    </template>

    <!-- 角色：多选/可输入角色编码（引擎按 sys_role.role_code 解析成员） -->
    <template v-if="modelValue === 'role'">
      <div class="section-title">选择角色</div>
      <el-select
        :model-value="roleCodes ?? []"
        multiple
        filterable
        allow-create
        default-first-option
        placeholder="选择或输入角色编码"
        :disabled="disabled"
        style="width: 100%"
        @update:model-value="(v: string[]) => emit('update:roleCodes', v)"
        @change="() => emit('change')"
      >
        <el-option v-for="code in roleOptions" :key="code" :label="code" :value="code" />
      </el-select>
      <div class="as-role-hint">多个角色取并集；角色编码在「系统管理-角色管理」维护</div>
    </template>

    <!-- 类型不在当前版本支持范围内：给出提示（不阻断选择） -->
    <el-alert
      v-if="modelValue && !SUPPORTED_TYPES.includes(modelValue)"
      class="as-alert"
      type="warning"
      :closable="false"
      show-icon
      title="该办理人/审批人类型需组织架构与引擎后续版本支持，当前部署后任务将按『找不到办理人』策略处理"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApproverPicker } from '@/components/business'
import { getRoleList } from '@/api/role'

/**
 * 办理人/审批人选择器（审批节点与办理节点共用）。
 *
 * 四列分组 radio 网格；type='user' 时渲染 ApproverPicker 多选
 * 与「允许发起人调整」checkbox（写入 assigneeOptions.allowInitiatorAdjust）；
 * type='role' 时渲染角色编码多选（写入 approval.roleCodes，引擎按 sys_role 解析成员）。
 */
const props = defineProps<{
  /** approval.type */
  modelValue: string
  /** 节点类别：决定「其他」列附加项与文案 */
  kind: 'approver' | 'handler'
  /** approval.userIds（type='user' 时生效） */
  userIds?: number[]
  /** approval.roleCodes（type='role' 时生效） */
  roleCodes?: string[]
  /** assigneeOptions.allowInitiatorAdjust（type='user' 时生效） */
  allowAdjust?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:userIds': [ids: number[]]
  'update:roleCodes': [codes: string[]]
  'update:allowAdjust': [value: boolean]
  /** 任一选项变化后触发，供父组件保存配置 */
  'change': []
}>()

/** 角色编码选项（系统管理-角色管理维护；支持手动输入未列出的编码） */
const roleOptions = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await getRoleList({ page: 1, size: 100 })
    roleOptions.value = (res.data?.rows ?? [])
      .map((r) => String(r.roleCode ?? ''))
      .filter((code) => code !== '')
  } catch {
    // 角色列表拉取失败不阻塞选择器（仍可手动输入编码）
    roleOptions.value = []
  }
})

/** 当前版本已支持（无需提示兜底策略）的类型 */
const SUPPORTED_TYPES = ['user', 'initiator_self', 'dept_head', 'expression', 'initiator_select']

interface AssigneeOption {
  label: string
  value: string
  advanced?: boolean
}

interface AssigneeGroup {
  title: string
  options: AssigneeOption[]
}

/** 四列固定分组；「其他」列按 kind 附加外部系统项 */
const GROUPS: AssigneeGroup[] = [
  {
    title: '普通审批',
    options: [
      { label: '指定用户', value: 'user' },
      { label: '发起人自选', value: 'initiator_select' },
      { label: '岗位职位', value: 'post' },
      { label: '成员组', value: 'member_group' },
      { label: '角色', value: 'role' },
      { label: '发起人自己', value: 'initiator_self' },
    ],
  },
  {
    title: '组织架构',
    options: [
      { label: '组织架构负责人', value: 'dept_head' },
      { label: '连续多级负责人', value: 'multi_level' },
      { label: '汇报上级', value: 'report_superior' },
      { label: '审批角色', value: 'approval_role' },
      { label: '矩阵审批', value: 'matrix' },
    ],
  },
  {
    title: '表单相关',
    options: [
      { label: '表单内用户', value: 'form_user' },
      { label: '部门控件对应负责人', value: 'form_dept_leader' },
      { label: '部门控件对应审批角色', value: 'form_dept_approval_role' },
    ],
  },
  {
    title: '其他',
    options: [
      { label: '审批人指定', value: 'approver_designate' },
      { label: '流程表达式', value: 'expression', advanced: true },
      ...(props.kind === 'handler'
        ? [{ label: '从外部获取办理人', value: 'external' } as AssigneeOption]
        : []),
      ...(props.kind === 'approver'
        ? [
            { label: '推送至外部系统审批', value: 'external_push' } as AssigneeOption,
            { label: '从外部获取审批人', value: 'external' } as AssigneeOption,
          ]
        : []),
    ],
  },
]

const visibleGroups = computed(() => GROUPS)

function onTypeChange(value: string) {
  emit('update:modelValue', value)
  emit('change')
}
</script>

<style scoped>
.assignee-selector {
  width: 100%;
}

/* 四列网格：随面板宽度自适应（面板 420px 时每列约 95px） */
.as-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.as-grid.is-disabled {
  opacity: 0.6;
}

.as-col {
  min-width: 0;
}

.as-col-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular, #4b5169);
  margin-bottom: 6px;
  padding-bottom: 2px;
  border-bottom: 1px dashed var(--el-border-color-lighter, #eef1fc);
}

.as-radio-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

/* 竖排紧凑 radio：覆盖 element-plus 默认右外边距与高度 */
.as-radio {
  height: 24px;
  margin-right: 0;
}

.as-radio :deep(.el-radio__label) {
  font-size: 12px;
  padding-left: 4px;
  white-space: normal;
  line-height: 1.2;
  word-break: break-all;
}

.as-advanced {
  display: inline-block;
  margin-left: 2px;
  font-size: 10px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 3px;
  color: var(--el-color-primary);
  border: 1px solid currentColor;
  transform: scale(0.9);
}

/* 角色选择下方的灰色说明 */
.as-role-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary, #8b91ab);
  line-height: 1.4;
  margin: 4px 0 6px;
}

.as-adjust {
  display: flex;
  margin-top: 8px;
  width: 100%;
}

.as-adjust :deep(.el-checkbox__label) {
  font-size: 12px;
}

.as-alert {
  margin-top: 8px;
}

.as-alert :deep(.el-alert__title) {
  font-size: 12px;
  line-height: 1.4;
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
</style>
