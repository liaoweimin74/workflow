<template>
  <div class="form-designer-page">
    <!-- 顶部工具栏 -->
    <div class="designer-toolbar">
      <el-button :icon="ArrowLeft" @click="handleBack">返回</el-button>
      <el-divider direction="vertical" />
<el-input
        :model-value="formName"
        class="form-name-input"
        placeholder="表单名称"
        size="small"
        style="width: 200px"
        disabled
      />
      <el-input
        :model-value="formKey"
        class="form-key-input"
        placeholder="表单标识"
        size="small"
        style="width: 160px; margin-left: 8px"
        disabled
      />
      <el-tag v-if="formStatus" :type="statusTagType(formStatus)" size="small" style="margin-left: 8px">
        {{ statusLabel(formStatus) }}
      </el-tag>
      <el-tag v-if="formType === 'BUSINESS'" type="primary" size="small" style="margin-left: 8px">
        业务表单
      </el-tag>
      <div class="toolbar-right">
        <el-button plain @click="dsDialogVisible = true">
          数据源配置（{{ formDataSources.length }}）
        </el-button>
        <el-button type="primary" :icon="Check" @click="handleSave" :loading="saving">保存</el-button>
        <el-button
          v-if="formStatus === 'DRAFT' || formStatus === 'PUBLISHED'"
          type="success"
          :icon="Promotion"
          @click="handlePublish"
          :loading="publishing"
        >
          {{ formStatus === 'PUBLISHED' ? '重新发布' : '发布' }}
        </el-button>
      </div>
    </div>

    <!-- form-create 设计器 -->
    <div class="designer-body" v-loading="loading">
      <fc-designer
        ref="designerRef"
        :height="designerHeight"
        :config="{ fieldReadonly: false, disabledFormConfig: ['formCreateFormName'] }"
      />
    </div>

    <!-- 业务表单列映射确认 -->
    <ColumnConfigDialog
      v-model="columnDialogVisible"
      :schema="designerRule"
      :form-name="formName"
      :existing-columns="columnConfig"
      @confirm="handleColumnConfirm"
    />

    <!-- data-picker 数据引用配置 -->
    <DataPickerConfigDialog
      v-model="pickerDialogVisible"
      :target-forms="pickerTargetForms"
      :current-fields="currentFieldKeys"
      :target-columns="pickerTargetColumns"
      :picker-props="currentPickerProps"
      @source-change="handlePickerSourceChange"
      @confirm="handlePickerConfirm"
    />

    <!-- LookupPicker（查找带回）数据源配置 -->
    <LookupPickerConfigDialog
      v-model="lookupDialogVisible"
      :target-forms="lookupTargetForms"
      :current-fields="currentFieldKeys"
      :target-columns="lookupTargetColumns"
      :lookup-props="currentLookupProps"
      @source-change="handleLookupSourceChange"
      @confirm="handleLookupConfirm"
    />

    <!-- 数据源配置弹窗 -->
    <el-dialog v-model="dsDialogVisible" title="数据源绑定配置" width="680px">
      <DataSourceConfigPanel
        :dataSources="formDataSources"
        :enabledDataSources="enabledDataSources"
        @update:dataSources="updateFormDataSources"
      />
      <template #footer>
        <el-button @click="dsDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Promotion } from '@element-plus/icons-vue'
import _formCreate from '@form-create/element-ui'
import { formApi, type FormDefinitionDTO, type FormDefinitionDetailDTO } from '@/api/form'
import { dataSourceApi, type DataSourceDTO } from '@/api/data-source'
import ColumnConfigDialog, { type ColumnConfigItem } from './components/ColumnConfigDialog.vue'
import DataPickerConfigDialog from './components/DataPickerConfigDialog.vue'
import LookupPickerConfigDialog from './components/LookupPickerConfigDialog.vue'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import type { DataSourceBinding } from '@/components/business/DataSourceConfigPanel.vue'
import { collectFieldsOfType, collectFieldKeys, patchFieldProps, resolveActiveField } from './formRuleWalk'
import { containerFieldValidator } from './components/containerFieldValidator'

const route = useRoute()
const router = useRouter()

const designerRef = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)

// 提供给属性面板触发组件：打开数据引用配置弹窗
provide('openDataPickerConfig', openPickerConfig)

const formId = computed(() => route.query.id as string)
const formName = ref('')
const formStatus = ref('')
const formKey = ref('')
const formType = ref('')
const columnConfig = ref<ColumnConfigItem[]>([])
const columnDialogVisible = ref(false)
/** 已启用全局数据源（供 FORM 容器属性面板选择） */
const enabledDataSources = ref<DataSourceDTO[]>([])

/** 数据源配置弹窗状态 */
const dsDialogVisible = ref(false)

/** 表单级数据源绑定配置 */
const formDataSources = ref<DataSourceBinding[]>([])

// ===== data-picker 配置 =====
const pickerDialogVisible = ref(false)
const pickerTargetForms = ref<FormDefinitionDTO[]>([])
const pickerTargetColumns = ref<ColumnConfigItem[]>([])

/** 当前 schema 中的 dataPicker 字段（field → props），穿透子表内部 */
const pickerFields = computed<{ field: string; props: Record<string, any> }[]>(() =>
  collectFieldsOfType(designerRule.value, 'dataPicker'),
)
const selectedPickerField = ref<string>('')

/** 当前表单所有字段 key（供回填映射/级联依赖的目标字段选择），穿透子表内部 */
const currentFieldKeys = computed<string[]>(() => collectFieldKeys(designerRule.value))

/** 当前选中 dataPicker 字段的 props（供配置弹窗回填） */
const currentPickerProps = computed<Record<string, any>>(() => {
  const found = pickerFields.value.find(f => f.field === selectedPickerField.value)
  return found?.props || {}
})

const designerHeight = ref('calc(100vh - 50px)')

/** 当前设计器 rule（供列映射确认对话框生成草案） */
const designerRule = computed<any[]>(() => {
  try {
    return designerRef.value?.getRule() || []
  } catch {
    return []
  }
})

onMounted(async () => {
  if (!formId.value) {
    ElMessage.error('缺少表单 ID')
    router.push('/form')
    return
  }

  // 注册 LookupPicker 到设计器拖拽面板
  designerRef.value?.addComponent({
    label: '查找带回',
    name: 'LookupPicker',
    icon: 'icon-search',
    menu: 'main',
    rule: () => ({
      type: 'LookupPicker',
      field: 'lookup' + Date.now(),
      title: '选择',
      props: {
        columns: [],
        displayField: '',
        returnFields: {},
        idField: '',
      },
    }),
    // 属性设置栏：注入"数据源配置"触发项（按钮 + click 事件，样式对齐"设置事件"按钮）
    props: () => [
      {
        type: 'button',
        field: 'lookupConfigTrigger',
        title: '',
        children: ['点击配置数据源'],
        native: true,
        style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
        props: { size: 'small' },
        on: { click: () => openLookupConfig() },
      },
    ],
  })

  // 注册数据引用（dataPicker）组件
  designerRef.value?.addComponent({
    label: '数据引用',
    name: 'dataPicker',
    icon: 'icon-link',
    menu: 'main',
    rule: () => ({
      type: 'dataPicker',
      field: 'dataPicker' + Date.now(),
      title: '数据引用',
      props: {
        sourceFormKey: '',
        displayField: '',
        columns: [],
        searchColumns: [],
        dependOn: undefined,
      },
    }),
    // 属性设置栏：注入"数据引用配置"触发项（按钮 + click 事件，样式对齐"设置事件"按钮，同 LookupPicker）
    props: () => [
      {
        type: 'button',
        field: 'dataPickerConfigTrigger',
        title: '',
        children: ['点击配置数据引用'],
        native: true,
        style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
        props: { size: 'small' },
        on: { click: () => openPickerConfig() },
      },
    ],
  })

  loading.value = true
  try {
    const res = await formApi.getFormDefinition(formId.value)
    const formDef = res.data as FormDefinitionDetailDTO
    formName.value = formDef.name
    formStatus.value = formDef.status
    formKey.value = formDef.key
    formType.value = formDef.type || 'WORKFLOW'
    if (formDef.columnConfig) {
      try {
        columnConfig.value = JSON.parse(formDef.columnConfig)
      } catch {
        columnConfig.value = []
      }
    }

    // 加载已有 schema 到设计器
    if (formDef.schema && formDef.schema !== '[]') {
      try {
        const parsed = JSON.parse(formDef.schema)
        // 新版 schema 格式：{ rule: [...], option: {...} }
        // 兼容旧版：直接是字段数组
        let rule, option
        if (Array.isArray(parsed)) {
          rule = parsed
        } else {
          rule = parsed.rule || []
          option = parsed.option
        }
        // 等待设计器渲染完成
        await nextTick()
        if (designerRef.value) {
          designerRef.value.setRule(rule)
          if (option) {
            // 将数据库中的 name 同步到 option 中显示
            if (!option.form) option.form = {}
            option.form.formCreateFormName = formDef.name
            designerRef.value.setOption(option)
          }
        }
      } catch {
        // schema 解析失败，使用空设计器
      }
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    loading.value = false
    // 加载已启用全局数据源（供 FORM 容器属性面板选择）
    try {
      const dsRes = await dataSourceApi.getEnabledDataSources()
      enabledDataSources.value = (dsRes.data || []).filter(
        (d: any) => d.status === 'ENABLED' && (d.type === 'FORM' || d.type === 'API' || d.type === 'SYSTEM'),
      )
    } catch { /* http 拦截器已提示 */ }
    // 注册 FORM 容器数据源属性面板
    registerFormContainerProps()
  }
})

/** 注册 FORM 容器数据源下拉到属性面板 */
function registerFormContainerProps() {
  if (!designerRef.value) return
  designerRef.value.setComponentRuleConfig(
    'formContainer',
    () => [
      {
        type: 'select',
        field: 'dataSourceId',
        title: '数据源',
        value: '',
        options: enabledDataSources.value.map((d) => ({
          value: d.id,
          label: `${d.name}（${d.type}）`,
        })),
        props: {
          clearable: true,
          filterable: true,
          placeholder: '选择绑定数据源',
        },
        /** 数据源变更时校验容器子字段是否存在于 metadata */
        onChange: async (val: string) => {
          if (!val || !designerRef.value) return
          const activeRule = designerRef.value.activeRule
          // 画布上 formContainer 经 loadRule 后 type 为 FcRow（保存格式为 formContainer）
          if (!activeRule || !['formContainer', 'FcRow'].includes(activeRule.type)) return
          const children = (activeRule.children || []) as any[]
          if (children.length === 0) return
          try {
            const res = await dataSourceApi.getMetadata(val)
            const columns = res.data?.columns || []
            const result = containerFieldValidator(children, columns)
            if (result.invalidFields.length > 0) {
              ElMessage.warning(
                `以下字段不在数据源列中：${result.invalidFields.join('、')}`,
              )
            }
          } catch {
            // getMetadata 失败不阻塞，http 拦截器已提示
          }
        },
      },
      {
        type: 'json',
        field: 'recordLocator',
        title: '记录定位',
        value: { type: 'current-record' },
      },
    ],
    false, // 替换内置 props（append=true 会与 formContainer.js 内置 dataSourceId/recordLocator 重复，导致属性值绑定冲突）
  )
}

async function handleSave() {
  if (!designerRef.value) return

  saving.value = true
  try {
    const rule = designerRef.value.getRule()
    const option = designerRef.value.getOption()
    // 将外部的表单名称同步到 option 中
    if (!option.form) option.form = {}
    option.form.formCreateFormName = formName.value
    const schemaJson = JSON.stringify({ rule, option })
    const res = await formApi.updateFormDefinition(formId.value, {
      name: formName.value,
      key: formKey.value,
      schema: schemaJson,
    })
    ElMessage.success('保存成功')
    // 直接使用更新响应中的状态，避免二次请求
    formStatus.value = (res.data as FormDefinitionDTO).status
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  const isRepublish = formStatus.value === 'PUBLISHED'
  const confirmText = isRepublish
    ? '确定要重新发布此表单吗？将同步更新线上表单结构与数据表列。'
    : '确定要发布此表单吗？发布后不可修改。'
  try {
    await ElMessageBox.confirm(confirmText, isRepublish ? '确认重新发布' : '确认发布', {
      type: 'warning',
    })
  } catch {
    return
  }

  if (formType.value === 'BUSINESS') {
    // 业务表单：先弹出列映射确认，确认后保存 column_config 再发布
    designerRef.value?.getRule() || []
    columnConfig.value = []
    columnDialogVisible.value = true
    return
  }

  await doPublish(null)
}

/** 列映射确认后的发布 */
async function handleColumnConfirm(items: ColumnConfigItem[]) {
  try {
    // 1. 保存 column_config 到表单定义
    const rule = designerRef.value.getRule()
    const option = designerRef.value.getOption()
    if (!option.form) option.form = {}
    option.form.formCreateFormName = formName.value
    await formApi.updateFormDefinition(formId.value, {
      name: formName.value,
      key: formKey.value,
      schema: JSON.stringify({ rule, option }),
      columnConfig: JSON.stringify(items),
    })
    // 2. 发布（后端将基于最新 column_config 建表/变更）
    await doPublish(items)
  } catch {
    // http 拦截器已弹出错误消息
  }
}

async function doPublish(items: ColumnConfigItem[] | null) {
  publishing.value = true
  try {
    const res = await formApi.publishFormDefinition(formId.value)
    ElMessage.success('发布成功')
    formStatus.value = (res.data as FormDefinitionDTO).status
    if (items) {
      columnConfig.value = items
    }
  } catch {
    // http 拦截器已弹出错误消息
  } finally {
    publishing.value = false
  }
}

// ===== data-picker 配置 =====
async function openPickerConfig() {
  if (pickerFields.value.length === 0) {
    ElMessage.warning('画布中没有数据引用字段，请先拖入"数据引用"组件')
    return
  }
  // 优先使用设计器当前选中字段（含子表内部字段），未选中/不匹配时回退第一个
  selectedPickerField.value = resolveActiveField(pickerFields.value, 'dataPicker', designerRef.value?.activeRule)
  try {
    const res = await formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
    pickerTargetForms.value = res.data.rows || []
  } catch {
    pickerTargetForms.value = []
  }
  pickerTargetColumns.value = []
  pickerDialogVisible.value = true
}

async function handlePickerSourceChange(formKey: string) {
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    const cc = res.data.columnConfig
    pickerTargetColumns.value = cc ? JSON.parse(cc) : []
  } catch {
    pickerTargetColumns.value = []
  }
}

function handlePickerConfirm(newProps: Record<string, any>) {
  const rules = designerRef.value?.getRule() || []
  patchFieldProps(rules, 'dataPicker', selectedPickerField.value, newProps)
  designerRef.value?.setRule(rules)
  ElMessage.success('数据引用配置已保存')
}

// ===== LookupPicker（查找带回）配置 =====
const lookupDialogVisible = ref(false)
const lookupTargetForms = ref<FormDefinitionDTO[]>([])
const lookupTargetColumns = ref<ColumnConfigItem[]>([])
/** 当前 schema 中的 LookupPicker 字段（field → props），穿透子表内部 */
const lookupFields = computed<{ field: string; props: Record<string, any> }[]>(() =>
  collectFieldsOfType(designerRule.value, 'LookupPicker'),
)
const selectedLookupField = ref<string>('')

/** 当前选中 LookupPicker 字段的 props（供配置弹窗回填） */
const currentLookupProps = computed<Record<string, any>>(() => {
  const found = lookupFields.value.find(f => f.field === selectedLookupField.value)
  return found?.props || {}
})

function openLookupConfig() {
  if (lookupFields.value.length === 0) {
    ElMessage.warning('画布中没有查找带回字段，请先拖入"查找带回"组件')
    return
  }
  // 优先使用设计器当前选中字段（含子表内部字段），未选中/不匹配时回退第一个
  selectedLookupField.value = resolveActiveField(lookupFields.value, 'LookupPicker', designerRef.value?.activeRule)
  try {
    // 预加载已发布业务表单，供底表模式选择
    void formApi.getFormDefinitions({ type: 'BUSINESS', status: 'PUBLISHED', size: 100 })
      .then((res) => { lookupTargetForms.value = res.data.rows || [] })
      .catch(() => { lookupTargetForms.value = [] })
  } catch {
    lookupTargetForms.value = []
  }
  // 当前字段已配置底表数据源时预加载其列，避免重新打开弹窗时列下拉为空、列标题退化为字段标识
  const existingSource = currentLookupProps.value.sourceFormKey
  if (existingSource) {
    void handleLookupSourceChange(existingSource)
  } else {
    lookupTargetColumns.value = []
  }
  lookupDialogVisible.value = true
}

async function handleLookupSourceChange(formKey: string) {
  try {
    const res = await formApi.getFormDefinitionByKey(formKey)
    const cc = res.data.columnConfig
    lookupTargetColumns.value = cc ? JSON.parse(cc) : []
  } catch {
    lookupTargetColumns.value = []
  }
}

function handleLookupConfirm(newProps: Record<string, any>) {
  const rules = designerRef.value?.getRule() || []
  patchFieldProps(rules, 'LookupPicker', selectedLookupField.value, newProps)
  designerRef.value?.setRule(rules)
  ElMessage.success('数据源配置已保存')
}

/** 更新表单级数据源绑定配置 */
function updateFormDataSources(newDataSources: DataSourceBinding[]) {
  formDataSources.value = newDataSources
}

function handleBack() {
  const returnTo = route.query.returnTo as string
  if (returnTo) {
    router.push(returnTo)
  } else {
    router.push('/form')
  }
}

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

import { nextTick } from 'vue'
</script>

<style scoped>
.form-designer-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.designer-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  gap: 8px;
  height: 50px;
  flex-shrink: 0;
}

.form-name {
  font-size: 16px;
  font-weight: bold;
}

.form-name-input :deep(.el-input__wrapper) {
  font-weight: bold;
}

.form-key-input :deep(.el-input__wrapper) {
  font-size: 13px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.designer-body {
  flex: 1;
  overflow: hidden;
}
</style>
