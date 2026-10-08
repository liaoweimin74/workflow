<template>
  <div class="form-list-page">
    <el-card style="overflow: hidden">
      <SearchTable
        ref="tableRef"
        :search-fields="searchFields"
        :columns="columns"
        :action-buttons="actionButtons"
        :fetch-api="fetchApi"
        :form-config="formConfig"
        :default-page-size="20"
        :max-visible-buttons="5"
      >
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
        <template #type="{ row }">
          <el-tag :type="row.type === 'BUSINESS' ? 'primary' : ''" size="small">
            {{ row.type === 'BUSINESS' ? '业务' : '工作流' }}
          </el-tag>
        </template>
        <template #publishedVersion="{ row }">
          {{ row.publishedVersion != null ? 'v' + row.publishedVersion : '—' }}
        </template>
        <template #referenced="{ row }">
          <el-tag
            v-if="row.type === 'BUSINESS' && referencedMap[row.key]?.count > 0"
            type="warning"
            size="small"
          >被 {{ referencedMap[row.key].count }} 个表单引用</el-tag>
          <span v-else>—</span>
        </template>
        <template #createdAt="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </SearchTable>
    </el-card>

    <!-- 版本历史弹窗 -->
    <el-dialog v-model="versionDialogVisible" title="版本历史" width="600px">
      <el-table :data="versionList" border size="small" v-loading="versionLoading">
        <el-table-column prop="version" label="版本" width="80" align="center">
          <template #default="{ row }">
            v{{ row.version }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="创建人" width="120" />
        <el-table-column prop="createdAt" label="创建时间" min-width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="versionDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 复制表单弹窗：可选目标类型，支持跨类型复制（工作流 ↔ 业务） -->
    <el-dialog
      v-model="copyDialogVisible"
      title="复制表单"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        v-if="copyTypeChanged"
        :title="copyTypeHint"
        type="warning"
        show-icon
        :closable="false"
        class="copy-type-alert"
      />
      <el-form
        ref="copyFormRef"
        :model="copyFormState"
        :rules="copyRules"
        label-width="90px"
      >
        <el-form-item label="目标类型" prop="type">
          <el-radio-group v-model="copyFormState.type">
            <el-radio-button value="WORKFLOW">工作流表单</el-radio-button>
            <el-radio-button value="BUSINESS">业务表单</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="表单名称" prop="name">
          <el-input
            v-model="copyFormState.name"
            maxlength="255"
            placeholder="请输入新表单名称"
          />
        </el-form-item>
        <el-form-item label="表单标识" prop="key">
          <el-input
            v-model="copyFormState.key"
            maxlength="255"
            placeholder="请输入新表单标识"
          />
          <div class="copy-key-tip">副本为新表单，标识不能与现有表单重复；发布副本时会进行组件与列映射校验</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="copyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="copySubmitting" @click="submitCopy">复制</el-button>
      </template>
    </el-dialog>

    <!-- 逻辑流绑定弹窗：表单保存/更新/删除前后自动运行已发布逻辑编排 -->
    <el-dialog
      v-model="bindingDialogVisible"
      :title="bindingDialogTitle"
      width="820px"
      :close-on-click-modal="false"
      class="binding-dialog"
    >
      <div class="binding-hint">
        <span class="binding-hint-label">
          触发说明
          <el-tooltip
            placement="top"
            effect="dark"
            popper-class="long-line-tip"
            content="绑定后，表单在对应触发点自动运行所选逻辑流：前类触发点失败将拒绝本次操作（校验语义）；后类触发点可选同事务回滚（强一致）或提交后执行（失败仅留运行历史）。编排需已发布，且入参声明须与触发点事件参数完全一致（下拉自动过滤），可在逻辑流设计器「输入参数」中一键导入触发点参数。"
          >
            <el-icon class="binding-hint-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </span>
      </div>
      <el-table :data="bindings" border size="small" v-loading="bindingsLoading" max-height="320">
        <el-table-column label="触发点" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.triggerType.startsWith('BEFORE_') ? 'warning' : 'success'" size="small">
              {{ triggerLabel(row.triggerType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="逻辑流" min-width="170">
          <template #default="{ row }">
            <span class="binding-flow-key">{{ row.flowKey }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行模式" width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.triggerType.startsWith('BEFORE_')" class="binding-mode-dim">同步校验</span>
            <el-tag v-else :type="row.executionMode === 'AFTER_COMMIT' ? 'info' : ''" size="small">
              {{ row.executionMode === 'AFTER_COMMIT' ? '提交后执行' : '同事务' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              size="small"
              @change="(val: any) => toggleBinding(row, !!val)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ row }">
            <el-button size="small" text type="danger" @click="removeBinding(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-divider content-position="left">添加绑定</el-divider>
      <!-- 添加绑定：表格行式布局（small 尺寸，与上方绑定列表风格统一） -->
      <el-table :data="[{}]" size="small" class="binding-add-table">
        <el-table-column label="触发点" width="140">
          <template #default>
            <el-select v-model="bindingForm.triggerType" size="small" style="width: 100%">
              <el-option-group v-for="g in groupedTriggerOptions" :key="g.group" :label="g.group">
                <el-option
                  v-for="t in g.triggers"
                  :key="t.value"
                  :label="t.label"
                  :value="t.value"
                />
              </el-option-group>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="逻辑流" min-width="220">
          <template #default>
            <el-select
              v-model="bindingForm.flowKey"
              filterable
              size="small"
              style="width: 100%"
              :placeholder="filteredFlows.length ? '仅已发布逻辑流' : '暂无参数匹配的逻辑流'"
              :loading="flowsLoading"
            >
              <template v-if="filteredFlows.length">
                <el-option
                  v-for="f in filteredFlows"
                  :key="f.flowKey"
                  :label="`${f.name || f.flowKey}（${f.flowKey}）`"
                  :value="f.flowKey"
                />
              </template>
              <el-option v-else disabled value="__no_match__" label="无参数匹配的已发布逻辑流" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="执行模式" width="170">
          <template #default>
            <el-select
              v-if="!isBeforeTrigger(bindingForm.triggerType)"
              v-model="bindingForm.executionMode"
              size="small"
              style="width: 100%"
            >
              <el-option label="同事务（失败回滚）" value="SYNC_IN_TX" />
              <el-option label="提交后执行（失败留痕）" value="AFTER_COMMIT" />
            </el-select>
            <span v-else class="binding-mode-dim">同步校验</span>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="150">
          <template #default>
            <el-input
              v-model="bindingForm.description"
              size="small"
              maxlength="200"
              placeholder="可选"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default>
            <el-button type="primary" size="small" :loading="bindingSubmitting" @click="submitBinding">添加</el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 触发点注入参数提示：解释下拉过滤规则，并指路设计器导入 -->
      <div v-if="currentTriggerSpec.length" class="binding-param-hint">
        <el-icon><InfoFilled /></el-icon>
        <span>
          触发点「{{ triggerLabel(bindingForm.triggerType) }}」注入参数：
          <el-tag v-for="p in currentTriggerSpec" :key="p.name" size="small" type="info" class="param-tag">{{ p.name }}</el-tag>
          （共 {{ currentTriggerSpec.length }} 项）；下拉仅显示入参声明与之完全一致的已发布逻辑流，
          未匹配可在逻辑流设计器「输入参数」对话框一键导入该触发点参数后发布。
        </span>
      </div>
      <template #footer>
        <el-button @click="bindingDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'FormList' })

import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  Plus as _Plus,
  CopyDocument,
  EditPen,
  Grid,
  Promotion,
  Clock,
  Delete,
  Connection,
  QuestionFilled,
  InfoFilled,
} from '@element-plus/icons-vue'
import { SearchTable } from '@/components/business'
import type { SearchField, TableColumn, ActionButton, FormConfig } from '@/components/business/types'
import { formApi, type FormDefinitionDTO, type FormVersionDTO } from '@/api/form'
import { bizDataApi } from '@/api/bizData'
import { logicFlowApi } from '@/api/logicFlow'
import {
  formLogicBindingApi,
  FORM_LOGIC_TRIGGERS,
  AFTER_COMMIT_DEFAULT_TRIGGERS,
  flowsMatchTrigger,
  triggerParamSpec,
  type FormLogicBindingDTO,
} from '@/api/formLogicBinding'

const router = useRouter()
const tableRef = ref<InstanceType<typeof SearchTable>>()

/** 引用感知：{ formKey: { count, referencedBy } }，供徽标与删除警告 */
const referencedMap = ref<Record<string, { count: number; referencedBy: string[] }>>({})

onMounted(async () => {
  try {
    const res = await bizDataApi.referencedCount()
    referencedMap.value = res.data || {}
  } catch {
    // 统计失败不阻断列表
  }
})

// ========== 搜索 ==========
const searchFields = computed<SearchField[]>(() => [
  { type: 'input', label: '表单名称', prop: 'name', placeholder: '搜索表单名称', style: 'width: 200px' },
  {
    type: 'select',
    label: '类型',
    prop: 'type',
    placeholder: '全部',
    options: [
      { label: '工作流表单', value: 'WORKFLOW' },
      { label: '业务表单', value: 'BUSINESS' },
    ],
    style: 'width: 140px',
  },
  {
    type: 'select',
    label: '状态',
    prop: 'status',
    placeholder: '全部',
    options: [
      { label: '草稿', value: 'DRAFT' },
      { label: '已发布', value: 'PUBLISHED' },
      { label: '已归档', value: 'ARCHIVED' },
    ],
    style: 'width: 140px',
  },
])

// ========== 列 ==========
const columns: TableColumn[] = [
  { prop: 'name', label: '表单名称', minWidth: 180 },
  { prop: 'key', label: '表单标识', width: 180 },
  { prop: 'type', label: '类型', width: 100, align: 'center', slotName: 'type' },
  { prop: 'status', label: '状态', width: 100, align: 'center', slotName: 'status' },
  { prop: 'publishedVersion', label: '发布版本', width: 100, align: 'center', slotName: 'publishedVersion' },
  { prop: 'referenced', label: '被引用', width: 150, align: 'center', slotName: 'referenced' },
  { prop: 'version', label: '当前版本', width: 90, align: 'center' },
  { prop: 'createdAt', label: '创建时间', width: 180, slotName: 'createdAt' },
]

// ========== 数据获取 ==========
async function fetchApi(params: any) {
  const res = await formApi.getFormDefinitions({
    page: params.page || 1,
    size: params.size || 20,
    name: params.name || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  })
  const data = res.data as any
  return {
    rows: data.content || data.rows || [],
    total: data.totalElements || data.total || 0,
  }
}

// ========== 创建表单 ==========
const formConfig = reactive<FormConfig<FormDefinitionDTO>>({
  rule: [
    {
      type: 'select',
      field: 'type',
      title: '表单类型',
      options: [
        { label: '工作流表单', value: 'WORKFLOW' },
        { label: '业务表单', value: 'BUSINESS' },
      ],
      value: 'WORKFLOW',
    },
    { type: 'input', field: 'name', title: '表单名称', validate: [{ required: true, message: '请输入表单名称', trigger: 'blur' }] },
    {
      type: 'input',
      field: 'key',
      title: '表单标识',
      validate: [
        { required: true, message: '请输入表单标识', trigger: 'blur' },
        { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头', trigger: 'blur' },
      ],
    },
  ],
  dialogTitle: { create: '新建表单' },
  createPermission: 'form:create',
  createApi: async (data: any) => {
    const res = await formApi.createForm(data.name, data.key, data.type || 'WORKFLOW')
    router.push({ path: '/form/designer', query: { id: res.data.id } })
    return res
  },
})

// ========== 操作按钮 ==========
const actionButtons: ActionButton[] = [
  {
    label: '设计',
    icon: EditPen,
    size: 'small',
    permission: 'form:edit',
    onClick: (row: any) => {
      router.push({ path: '/form/designer', query: { id: row.id } })
    },
  },
  {
    label: '复制',
    icon: CopyDocument,
    size: 'small',
    permission: 'form:create',
    show: (row: any) => row.status !== 'ARCHIVED',
    onClick: (row: any) => openCopyDialog(row),
  },
  {
    label: '管理数据',
    icon: Grid,
    size: 'small',
    type: 'primary',
    link: true,
    permission: 'form:list',
    show: (row: any) => row.type === 'BUSINESS' && row.status === 'PUBLISHED',
    onClick: (row: any) => {
      router.push({ path: `/biz-data/${row.key}` })
    },
  },
  {
    label: '发布',
    icon: Promotion,
    size: 'small',
    type: 'primary',
    permission: 'form:publish',
    confirm: '确定要发布此表单吗？',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      try {
        await formApi.publishFormDefinition(row.id)
        ElMessage.success('发布成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
  {
    label: '编排',
    icon: Connection,
    size: 'small',
    permission: 'form:list',
    show: (row: any) => row.status !== 'ARCHIVED',
    onClick: (row: any) => openBindingDialog(row),
  },
  {
    label: '版本',
    icon: Clock,
    size: 'small',
    permission: 'form:list',
    onClick: async (row: any) => {
      versionDialogVisible.value = true
      versionLoading.value = true
      try {
        const res = await formApi.getFormVersions(row.id)
        versionList.value = res.data || []
      } catch {
        // http 拦截器已弹出错误消息
      } finally {
        versionLoading.value = false
      }
    },
  },
  {
    label: '删除',
    icon: Delete,
    size: 'small',
    type: 'danger',
    permission: 'form:delete',
    show: (row: any) => row.status === 'DRAFT',
    onClick: async (row: any) => {
      const refInfo = referencedMap.value[row.key]
      const msg = refInfo && refInfo.count > 0
        ? `该表单被 ${refInfo.count} 个表单引用，删除后引用将无法解析。确定删除吗？`
        : '确定要删除此表单吗？'
      try {
        await ElMessageBox.confirm(msg, '删除确认', { type: 'warning' })
      } catch {
        return
      }
      try {
        await formApi.deleteFormDefinition(row.id)
        ElMessage.success('删除成功')
        tableRef.value?.fetchList()
      } catch {
        // http 拦截器已弹出错误消息
      }
    },
  },
]

// ========== 复制表单 ==========
const copyDialogVisible = ref(false)
const copySubmitting = ref(false)
const copySource = ref<FormDefinitionDTO | null>(null)
const copyFormRef = ref<FormInstance>()
const copyFormState = reactive({ type: 'WORKFLOW', name: '', key: '' })

const copyRules: FormRules = {
  type: [{ required: true, message: '请选择目标类型', trigger: 'change' }],
  name: [{ required: true, message: '请输入表单名称', trigger: 'blur' }],
  key: [
    { required: true, message: '请输入表单标识', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]*$/,
      message: '只能包含小写字母、数字、下划线，且以字母开头',
      trigger: 'blur',
    },
  ],
}

/** 是否跨类型复制（工作流 → 业务 / 业务 → 工作流） */
const copyTypeChanged = computed(
  () => !!copySource.value && copyFormState.type !== copySource.value.type,
)

/** 跨类型提示：复制放行、发布拦截的校验分工 */
const copyTypeHint = computed(() => {
  if (!copySource.value) return ''
  if (copyFormState.type === 'BUSINESS') {
    return '工作流表单复制为业务表单：发布时将校验组件白名单与列映射，含审批类组件需先调整，未配置列映射将无法发布。'
  }
  return '业务表单复制为工作流表单：副本用于流程发起，不再生成业务数据表，列映射不会随复制保留。'
})

function openCopyDialog(row: FormDefinitionDTO) {
  copySource.value = row
  copyFormState.type = row.type === 'BUSINESS' ? 'BUSINESS' : 'WORKFLOW'
  copyFormState.name = `${row.name} 副本`
  copyFormState.key = `${row.key}_copy`
  copyDialogVisible.value = true
}

async function submitCopy() {
  if (!copySource.value) return
  try {
    await copyFormRef.value?.validate()
  } catch {
    return
  }
  copySubmitting.value = true
  try {
    await formApi.copyForm(copySource.value.id, {
      name: copyFormState.name.trim(),
      key: copyFormState.key.trim(),
      type: copyFormState.type,
    })
    ElMessage.success('复制成功，副本已创建为草稿')
    copyDialogVisible.value = false
    tableRef.value?.fetchList()
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    copySubmitting.value = false
  }
}

// ========== 版本历史 ==========
const versionDialogVisible = ref(false)
const versionLoading = ref(false)
const versionList = ref<FormVersionDTO[]>([])

// ========== 逻辑流绑定 ==========
const bindingDialogVisible = ref(false)
const bindingSource = ref<FormDefinitionDTO | null>(null)
const bindingDialogTitle = computed(() =>
  bindingSource.value ? `逻辑流绑定 — ${bindingSource.value.name}` : '逻辑流绑定',
)
const bindings = ref<FormLogicBindingDTO[]>([])
const bindingsLoading = ref(false)
const bindingSubmitting = ref(false)
/** 已发布逻辑流选项（inputParams = 后端从 DSL 抽取的入参声明摘要，未声明时为 null） */
interface PublishedFlowOption {
  flowKey: string
  name: string
  inputParams: { name: string; type?: string }[] | null
}
const publishedFlows = ref<PublishedFlowOption[]>([])
const flowsLoading = ref(false)
const bindingForm = reactive({
  triggerType: 'AFTER_CREATE' as string,
  flowKey: '',
  executionMode: 'SYNC_IN_TX',
  description: '',
})

/** 当前表单类型可选触发点（BUSINESS 六类；WORKFLOW 含存档/审批动作/流程事件共十六类） */
const triggerOptions = computed(() => {
  const type = bindingSource.value?.type || 'WORKFLOW'
  return FORM_LOGIC_TRIGGERS.filter((t) => t.formType === type)
})
/** 触发点按事件类别分组（业务数据/表单存档/审批动作/流程事件，保持定义顺序） */
const groupedTriggerOptions = computed(() => {
  const groups: { group: string; triggers: typeof triggerOptions.value }[] = []
  for (const t of triggerOptions.value) {
    let g = groups.find((x) => x.group === t.group)
    if (!g) {
      g = { group: t.group, triggers: [] as unknown as typeof triggerOptions.value }
      groups.push(g)
    }
    ;(g.triggers as unknown[]).push(t)
  }
  return groups
})
/** 入参声明与当前触发点事件参数完全一致的已发布逻辑流（名称集合严格相等） */
const filteredFlows = computed(() =>
  publishedFlows.value.filter((f) => flowsMatchTrigger(f.inputParams?.map((p) => p.name), bindingForm.triggerType)),
)
/** 当前触发点注入参数规格（供底部提示展示） */
const currentTriggerSpec = computed(() => triggerParamSpec(bindingForm.triggerType) || [])
// 切换触发点后，原选中逻辑流若不再参数匹配则清空，避免提交非法绑定
watch(
  () => bindingForm.triggerType,
  (val) => {
    if (bindingForm.flowKey && !filteredFlows.value.some((f) => f.flowKey === bindingForm.flowKey)) {
      bindingForm.flowKey = ''
    }
    // 辅助动作触发点（转办/委派/加签/认领/催办/撤回/终止/启动）预置 AFTER_COMMIT，
    // 与后端 normalizeMode 缺省一致；其余触发点保留用户当前选择
    if (AFTER_COMMIT_DEFAULT_TRIGGERS.has(val)) {
      bindingForm.executionMode = 'AFTER_COMMIT'
    }
  },
)

function triggerLabel(value: string): string {
  return FORM_LOGIC_TRIGGERS.find((t) => t.value === value)?.label ?? value
}

function isBeforeTrigger(triggerType: string): boolean {
  return triggerType.startsWith('BEFORE_')
}

async function openBindingDialog(row: FormDefinitionDTO) {
  bindingSource.value = row
  bindingDialogVisible.value = true
  bindingForm.triggerType = row.type === 'BUSINESS' ? 'AFTER_CREATE' : 'AFTER_SNAPSHOT'
  bindingForm.flowKey = ''
  bindingForm.executionMode = 'SYNC_IN_TX'
  bindingForm.description = ''
  await Promise.all([loadBindings(), loadPublishedFlows()])
}

async function loadBindings() {
  const row = bindingSource.value
  if (!row) return
  bindingsLoading.value = true
  try {
    const res = await formLogicBindingApi.list(row.type, row.key)
    bindings.value = res.data || []
  } catch {
    // http 拦截器已提示
  } finally {
    bindingsLoading.value = false
  }
}

async function loadPublishedFlows() {
  flowsLoading.value = true
  try {
    const res = await logicFlowApi.list({ page: 1, size: 100 })
    const content: any[] = (res.data as any)?.content || []
    publishedFlows.value = content
      .filter((f) => f.status === 'PUBLISHED')
      .map((f) => ({
        flowKey: f.flowKey,
        name: f.name,
        inputParams: Array.isArray(f.inputParams) ? f.inputParams : null,
      }))
  } catch {
    // http 拦截器已提示
  } finally {
    flowsLoading.value = false
  }
}

async function submitBinding() {
  const row = bindingSource.value
  if (!row) return
  if (!bindingForm.flowKey) {
    ElMessage.warning('请选择逻辑流')
    return
  }
  bindingSubmitting.value = true
  try {
    await formLogicBindingApi.create({
      formType: row.type,
      formKey: row.key,
      triggerType: bindingForm.triggerType,
      flowKey: bindingForm.flowKey,
      executionMode: isBeforeTrigger(bindingForm.triggerType) ? 'SYNC_IN_TX' : bindingForm.executionMode,
      enabled: true,
      description: bindingForm.description.trim() || null,
    })
    ElMessage.success('绑定已添加')
    bindingForm.flowKey = ''
    bindingForm.description = ''
    await loadBindings()
  } catch {
    // http 拦截器已提示
  } finally {
    bindingSubmitting.value = false
  }
}

async function toggleBinding(row: FormLogicBindingDTO, enabled: boolean) {
  try {
    await formLogicBindingApi.update(row.id, { enabled })
    row.enabled = enabled
    ElMessage.success(enabled ? '已启用' : '已停用')
  } catch {
    // http 拦截器已提示
  }
}

async function removeBinding(row: FormLogicBindingDTO) {
  try {
    await ElMessageBox.confirm(
      `确定删除该绑定吗？（${triggerLabel(row.triggerType)} → ${row.flowKey}）`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await formLogicBindingApi.remove(row.id)
    ElMessage.success('绑定已删除')
    await loadBindings()
  } catch {
    // http 拦截器已提示
  }
}

// ========== 工具函数 ==========
function statusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    DRAFT: 'warning',
    PUBLISHED: 'success',
    ARCHIVED: 'info',
  }
  return map[status] || ''
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  }
  return map[status] || status
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
/* 对齐用户管理布局标准：根容器撑满 main，卡片与内部 SearchTable 逐级接管剩余高度，
   底部留白由 main 的 p-4 唯一决定（原页面高度塌陷，底部空白可达 150px） */
.form-list-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.form-list-page > :deep(.el-card) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.form-list-page > :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.copy-type-alert {
  margin-bottom: 16px;
}
.copy-key-tip {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

/* ===== 逻辑流绑定弹窗 ===== */
.binding-hint {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.binding-hint-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.binding-hint-icon {
  cursor: help;
  color: var(--el-color-primary);
  font-size: 14px;
}
.binding-flow-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.binding-mode-dim {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 添加绑定表格行：控件贴行紧凑（small），与上方绑定列表表格风格统一 */
.binding-add-table :deep(.el-table__cell) {
  padding: 5px 0;
}
.binding-add-table :deep(.cell) {
  padding: 0 8px;
}
/* 触发点注入参数提示行：小字灰调 + 参数 tag 轻量内联 */
.binding-param-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.binding-param-hint .el-icon {
  margin-top: 3px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.binding-param-hint .param-tag {
  margin: 0 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>

<style>
/* el-tooltip popper 挂在 body 下，scoped 样式无法命中：全局类限宽使长文案多行换行显示 */
.long-line-tip {
  max-width: 420px;
  line-height: 1.7;
}
</style>
