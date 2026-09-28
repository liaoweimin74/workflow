<template>
  <div class="assignee-selector">
    <!-- 三列 radio 网格：普通审批 / 表单相关 / 其他（仅保留引擎已支持的选人方式） -->
    <div class="as-grid" :class="{ 'is-disabled': disabled }">
      <div v-for="group in GROUPS" :key="group.title" class="as-col">
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

    <!-- 表单内用户：从本节点绑定表单的「用户类型」字段取值（发起/上一步填写 → 流程变量） -->
    <template v-if="modelValue === 'form_user'">
      <div class="section-title">表单内用户字段</div>
      <el-select
        :model-value="formUserField ?? ''"
        filterable
        clearable
        placeholder="选择表单中的用户字段"
        :disabled="disabled"
        style="width: 100%"
        @update:model-value="(v: string) => emit('update:formUserField', v)"
        @change="() => emit('change')"
      >
        <el-option
          v-for="f in formUserFields"
          :key="f.field"
          :label="`${f.label}（${f.field}）`"
          :value="f.field"
        />
      </el-select>
      <div class="as-role-hint">
        <template v-if="formUserFields.length > 0">
          运行时从表单数据中取该字段的值作为{{ kind === 'handler' ? '办理人' : '审批人' }}（支持单个或多个用户）
        </template>
        <template v-else-if="formDefId">
          该表单暂无用户类型字段，可先在表单设计中添加
        </template>
        <template v-else>
          请先在「字段权限设置」中为本节点关联表单
        </template>
      </div>
    </template>

    <!-- 自定义选人：业务系统通过引擎扩展点注册的选人函数（中文名下拉 + 参数配置） -->
    <template v-if="modelValue === 'external'">
      <div class="section-title">选择选人函数</div>
      <el-select
        :model-value="externalResolver ?? ''"
        filterable
        allow-create
        default-first-option
        placeholder="选择或输入选人函数注册名"
        :loading="resolversLoading"
        :disabled="disabled"
        style="width: 100%"
        @update:model-value="onResolverChange"
      >
        <el-option v-for="m in resolverOptions" :key="m.name" :label="m.displayName" :value="m.name">
          <div class="resolver-option">
            <span class="resolver-display">{{ m.displayName }}</span>
            <span class="resolver-key">{{ m.name }}</span>
            <span v-if="m.unregistered" class="resolver-badge">未注册</span>
          </div>
        </el-option>
      </el-select>
      <div v-if="selectedMeta?.description" class="as-role-hint">{{ selectedMeta.description }}</div>
      <div v-else-if="externalResolver && !selectedMeta" class="as-role-hint as-hint-warn">
        注册名「{{ externalResolver }}」未在引擎进程内注册，运行时将按「找不到{{ kind === 'handler' ? '办理人' : '审批人' }}」策略处理
      </div>

      <!-- 函数参数：按注册函数的参数声明渲染配置表单，值存 approval.external.params -->
      <template v-if="selectedMeta?.params?.length">
        <div class="param-title">函数参数</div>
        <div v-for="def in selectedMeta.params" :key="def.key" class="param-row">
          <div class="param-label">
            <span v-if="def.required" class="param-required">*</span>{{ def.label }}
          </div>
          <el-input
            v-if="(def.type ?? 'string') === 'string'"
            :model-value="paramValue(def.key) as string | undefined ?? ''"
            :placeholder="def.placeholder ?? '请输入'"
            :disabled="disabled"
            clearable
            @update:model-value="(v: string) => setParam(def.key, v)"
          />
          <el-input-number
            v-else-if="def.type === 'number'"
            :model-value="paramValue(def.key) as number | undefined ?? undefined"
            :placeholder="def.placeholder"
            :disabled="disabled"
            controls-position="right"
            class="param-number"
            @update:model-value="(v: number | undefined) => setParam(def.key, v)"
          />
          <el-switch
            v-else-if="def.type === 'boolean'"
            :model-value="paramValue(def.key) === true"
            :disabled="disabled"
            @update:model-value="(v: boolean) => setParam(def.key, v)"
          />
          <el-select
            v-else
            :model-value="paramValue(def.key) as string | undefined ?? ''"
            :placeholder="def.placeholder ?? '请选择'"
            :disabled="disabled"
            style="width: 100%"
            @update:model-value="(v: string) => setParam(def.key, v)"
          >
            <el-option
              v-for="opt in def.options ?? []"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <div v-if="def.description" class="param-desc">{{ def.description }}</div>
        </div>
      </template>

      <div class="as-role-hint">
        候选函数由业务系统经引擎扩展点注册（中文名唯一）；同一函数可被多个节点以不同参数复用；未注册或解析为空时按「找不到{{ kind === 'handler' ? '办理人' : '审批人' }}」策略处理
      </div>
    </template>

    <!-- 类型不在当前版本支持范围内（含历史遗留配置）：给出提示（不阻断选择） -->
    <el-alert
      v-if="modelValue && !SUPPORTED_TYPES.includes(modelValue)"
      class="as-alert"
      type="warning"
      :closable="false"
      show-icon
      title="该办理人/审批人类型当前版本暂不支持，部署后任务将按『找不到办理人』策略处理，建议改用其他选人方式"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApproverPicker } from '@/components/business'
import { getRoleList } from '@/api/role'
import { useDesignerStore } from '@/stores/designerStore'
import { formApi, type FormDefinitionDetailDTO } from '@/api/form'
import { getAssigneeResolvers, type AssigneeResolverMeta } from '@/api/assigneeResolver'

/**
 * 办理人/审批人选择器（审批节点与办理节点共用）。
 *
 * 三列分组 radio 网格（仅保留引擎已支持的选人方式）：
 * - type='user'      → ApproverPicker 多选 + 「允许发起人调整」checkbox
 * - type='role'      → 角色编码多选（引擎按 sys_role 解析成员）
 * - type='form_user' → 表单内用户字段下拉（引擎从流程变量取该字段值）
 * - type='external'  → 选人函数注册名（业务系统注册的扩展选人函数）
 */
const props = defineProps<{
  /** approval.type */
  modelValue: string
  /** 节点类别：决定文案 */
  kind: 'approver' | 'handler'
  /** approval.userIds（type='user' 时生效） */
  userIds?: number[]
  /** approval.roleCodes（type='role' 时生效） */
  roleCodes?: string[]
  /** assigneeOptions.allowInitiatorAdjust（type='user' 时生效） */
  allowAdjust?: boolean
  /** approval.formUserField（type='form_user' 时生效） */
  formUserField?: string
  /** approval.external.resolver（type='external' 时生效） */
  externalResolver?: string
  /** approval.external.params（type='external' 时生效；节点配置的函数参数值表） */
  externalParams?: Record<string, unknown>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:userIds': [ids: number[]]
  'update:roleCodes': [codes: string[]]
  'update:allowAdjust': [value: boolean]
  'update:formUserField': [value: string]
  'update:externalResolver': [value: string]
  'update:externalParams': [params: Record<string, unknown>]
  /** 任一选项变化后触发，供父组件保存配置 */
  'change': []
}>()

const designerStore = useDesignerStore()

/** 当前版本引擎已支持的类型（不弹「暂不支持」提示） */
const SUPPORTED_TYPES = ['user', 'initiator_self', 'initiator_select', 'role', 'expression', 'form_user', 'external']

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

/** 本节点绑定表单的用户类型字段列表（type='form_user' 时的下拉数据源） */
const formUserFields = ref<{ field: string; label: string }[]>([])

// ---- 选人函数（external）：后端注册表元数据 ----

/** 引擎进程内已注册的选人函数清单（中文名下拉数据源） */
const resolverMetas = ref<AssigneeResolverMeta[]>([])
const resolversLoading = ref(false)

onMounted(async () => {
  resolversLoading.value = true
  try {
    const res = await getAssigneeResolvers()
    resolverMetas.value = Array.isArray(res.data) ? res.data : []
  } catch {
    // 拉取失败不阻塞选择器：仍可手动输入注册名（allow-create）
    resolverMetas.value = []
  } finally {
    resolversLoading.value = false
  }
})

/** 下拉选项：已注册函数 + 存量配置里未注册的注册名（保留回显不丢） */
const resolverOptions = computed<(AssigneeResolverMeta & { unregistered?: boolean })[]>(() => {
  const list: (AssigneeResolverMeta & { unregistered?: boolean })[] = resolverMetas.value.map(
    (m) => ({ ...m }),
  )
  const stored = String(props.externalResolver ?? '').trim()
  if (stored !== '' && !list.some((m) => m.name === stored)) {
    list.unshift({ name: stored, displayName: stored, unregistered: true })
  }
  return list
})

/** 当前选中的函数元数据（未注册时 undefined） */
const selectedMeta = computed<AssigneeResolverMeta | undefined>(() =>
  resolverMetas.value.find((m) => m.name === String(props.externalResolver ?? '').trim()),
)

/** 切换选人函数：写入注册名，并把声明了缺省值而尚未配置的参数预填缺省值 */
function onResolverChange(name: string) {
  emit('update:externalResolver', name)
  const meta = resolverMetas.value.find((m) => m.name === name)
  const base: Record<string, unknown> = { ...(props.externalParams ?? {}) }
  if (meta?.params) {
    for (const def of meta.params) {
      if (base[def.key] === undefined && def.defaultValue !== undefined) {
        base[def.key] = def.defaultValue
      }
    }
  }
  emit('update:externalParams', base)
  emit('change')
}

/** 参数当前值（缺省 undefined） */
function paramValue(key: string): unknown {
  return props.externalParams?.[key]
}

/** 写入单个参数值（不可变替换，确保父组件 watch/save 触发） */
function setParam(key: string, value: unknown) {
  emit('update:externalParams', { ...(props.externalParams ?? {}), [key]: value })
  emit('change')
}

/** 本节点绑定的表单定义 ID（从 designerStore 读取） */
const formDefId = computed(() => designerStore.getNodeConfig(designerStore.selectedNodeId!)?.form?.formDefId || '')

/** 表单 schema 中「用户类型」控件的 type 集合（用户选择控件 + 常见命名兼容） */
const USER_FIELD_TYPES = new Set(['selectUser', 'userPicker', 'user', 'memberSelect'])

/** 拉取本节点表单字段并过滤用户类型字段 */
async function loadFormUserFields(formId: string) {
  formUserFields.value = []
  if (!formId) return
  try {
    const res = await formApi.getFormDefinition(formId)
    const formDef = res.data as FormDefinitionDetailDTO
    if (!formDef.schema || formDef.schema === '[]') return
    const schema = JSON.parse(formDef.schema)
    const rules: any[] = Array.isArray(schema) ? schema : (schema.rule || [])
    // 扁平化（含子表单/折叠面板等嵌套容器），保留用户类型控件
    const walk = (items: any[]) => {
      for (const item of items) {
        const type = String(item?.type ?? '')
        const field = String(item?.field ?? item?.prop ?? '')
        if (USER_FIELD_TYPES.has(type) && field !== '') {
          formUserFields.value.push({
            field,
            label: String(item?.title ?? item?.label ?? field),
          })
        }
        if (Array.isArray(item?.children)) walk(item.children)
        if (Array.isArray(item?.columns)) {
          for (const col of item.columns) {
            if (Array.isArray(col?.children)) walk(col.children)
          }
        }
      }
    }
    walk(rules)
  } catch {
    formUserFields.value = []
  }
}

// 节点/表单变化时刷新用户字段列表；选中 form_user 时也拉一次
watch(
  [formDefId, () => props.modelValue],
  ([id, type]) => {
    if (type === 'form_user') void loadFormUserFields(id)
  },
  { immediate: true },
)

interface AssigneeOption {
  label: string
  value: string
  advanced?: boolean
}

interface AssigneeGroup {
  title: string
  options: AssigneeOption[]
}

/**
 * 三列固定分组（引擎已支持子集）：
 * - 普通审批：指定用户/发起人自选/角色/发起人自己
 * - 表单相关：表单内用户
 * - 其他：流程表达式/自定义选人（业务系统注册的选人函数）
 */
const GROUPS: AssigneeGroup[] = [
  {
    title: '普通审批',
    options: [
      { label: '指定用户', value: 'user' },
      { label: '发起人自选', value: 'initiator_select' },
      { label: '角色', value: 'role' },
      { label: '发起人自己', value: 'initiator_self' },
    ],
  },
  {
    title: '表单相关',
    options: [{ label: '表单内用户', value: 'form_user' }],
  },
  {
    title: '其他',
    options: [
      { label: '流程表达式', value: 'expression', advanced: true },
      { label: '自定义选人函数', value: 'external', advanced: true },
    ],
  },
]

function onTypeChange(value: string) {
  emit('update:modelValue', value)
  emit('change')
}
</script>

<style scoped>
.assignee-selector {
  width: 100%;
}

/* 三列网格：随面板宽度自适应（面板 420px 时每列约 130px） */
.as-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

/* 选人函数下拉选项：中文名 + 注册名 + 未注册标记 */
.resolver-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.resolver-display {
  font-size: 12px;
  color: var(--el-text-color-primary, #1f2437);
  flex-shrink: 0;
}

.resolver-key {
  font-size: 11px;
  color: var(--el-text-color-secondary, #8b91ab);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resolver-badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--el-color-warning);
  border: 1px solid currentColor;
}

/* 未注册提示（警告色） */
.as-hint-warn {
  color: var(--el-color-warning, #e6a23c);
}

/* 函数参数配置表单 */
.param-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular, #4b5169);
  margin: 10px 0 6px;
}

.param-row {
  margin-bottom: 8px;
}

.param-label {
  font-size: 12px;
  color: var(--el-text-color-regular, #4b5169);
  margin-bottom: 3px;
  line-height: 1.3;
}

.param-required {
  color: var(--el-color-danger, #f56c6c);
  margin-right: 2px;
}

.param-number {
  width: 100%;
}

.param-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary, #8b91ab);
  line-height: 1.4;
  margin-top: 2px;
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
