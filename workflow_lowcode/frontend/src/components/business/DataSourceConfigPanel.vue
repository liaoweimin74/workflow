<template>
  <div class="data-source-config-panel">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- 数据源绑定 -->
      <el-tab-pane label="数据源绑定" name="ds">
        <div class="panel-header">
          <span class="panel-title">数据源绑定配置</span>
          <el-button type="primary" plain size="small" @click="addBinding">
            <el-icon><Plus /></el-icon>
            添加数据源
          </el-button>
        </div>

        <div class="binding-list" v-if="localDataSources.length > 0">
          <div
            v-for="(ds, index) in localDataSources"
            :key="index"
            class="binding-item"
          >
            <div class="binding-row">
              <el-input
                v-model="ds.id"
                placeholder="页面内标识"
                class="binding-input"
                :class="{ 'is-error': errors[index]?.id }"
              />
              <el-select
                v-model="ds.refId"
                placeholder="选择全局数据源"
                class="binding-select"
                :class="{ 'is-error': errors[index]?.refId }"
                filterable
              >
                <el-option
                  v-for="source in enabledDataSources"
                  :key="source.id"
                  :label="`${source.name}（${source.type}）`"
                  :value="source.id"
                />
              </el-select>
              <el-button
                type="danger"
                link
                :icon="Delete"
                aria-label="删除数据源绑定"
                title="删除"
                @click="removeBinding(index)"
              />
            </div>
            <div class="binding-errors" v-if="errors[index]">
              <span v-if="errors[index].id" class="error-text">{{ errors[index].id }}</span>
              <span v-if="errors[index].refId" class="error-text">{{ errors[index].refId }}</span>
            </div>
          </div>
        </div>

        <el-empty v-else description="暂无数据源绑定" :image-size="60" />

      </el-tab-pane>

      <!-- 动作总线 -->
      <el-tab-pane label="动作总线" name="actions">
        <div class="action-card" v-for="(ac, i) in localActions" :key="i">
          <div class="action-row">
            <el-select v-model="ac.trigger" style="width: 150px">
              <el-option v-for="t in triggerOptions" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
            <!-- 触发器定宽，来源是行内最后一个参数，同样拉满剩余宽度 -->
            <el-select
              v-model="ac.source"
              placeholder="来源数据源"
              class="step-param-fill"
              clearable
            >
              <el-option label="任意来源" value="" />
              <el-option v-for="ds in localDataSources" :key="ds.id" :label="ds.id" :value="ds.id" />
            </el-select>
            <el-button link type="danger" :icon="Delete" aria-label="删除动作" title="删除" @click="removeAction(i)" />
          </div>
          <div class="step-row" v-for="(step, si) in ac.steps" :key="si">
            <el-select v-model="step.op" style="width: 130px">
              <el-option v-for="o in opOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <!-- 容器类动作（打开/关闭容器、加载/保存记录）按容器地址寻址，数据类动作按数据源 -->
            <el-select
              v-if="isContainerOp(step.op)"
              v-model="step.target"
              placeholder="目标容器"
              :class="{ 'step-param-fill': isLastParamField(step, 'target') }"
              style="width: 150px"
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
            >
              <el-option v-for="c in containerTargets" :key="c.value" :label="c.label" :value="c.value" />
            </el-select>
            <el-select
              v-else
              v-model="step.target"
              placeholder="目标数据源"
              :class="{ 'step-param-fill': isLastParamField(step, 'target') }"
              style="width: 130px"
            >
              <!-- 有数据容器时分组成对给出：容器走自身地址，数据源沿用既有寻址口径 -->
              <template v-if="dataTargetList.length > 0">
                <el-option-group label="数据容器">
                  <el-option v-for="t in dataTargetList" :key="t.value" :label="t.label" :value="t.value" />
                </el-option-group>
                <el-option-group label="数据源">
                  <el-option v-for="ds in localDataSources" :key="ds.id" :label="ds.id" :value="ds.id" />
                </el-option-group>
              </template>
              <el-option v-for="ds in localDataSources" v-else :key="ds.id" :label="ds.id" :value="ds.id" />
            </el-select>
            <el-select
              v-if="stepHasField(step, 'field')"
              v-model="step.field"
              placeholder="过滤字段"
              :class="{ 'step-param-fill': isLastParamField(step, 'field') }"
              style="width: 130px"
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              @visible-change="(v: boolean) => v && ensureFields(step.target)"
            >
              <el-option v-for="f in fieldOptions(step)" :key="f.value" :label="f.label" :value="f.value" />
            </el-select>
            <BusTemplateInput v-if="stepHasField(step, 'value')" v-model="step.value" :vars="templateVars(ac)" :placeholder="stepValuePlaceholder(step.op)" :class="{ 'step-param-fill': isLastParamField(step, 'value') }" style="width: 130px" />
            <BusTemplateInput v-if="stepHasField(step, 'recordId')" v-model="step.recordId" :vars="templateVars(ac)" placeholder="如 {row.id}" :class="{ 'step-param-fill': isLastParamField(step, 'recordId') }" style="width: 130px" />
            <el-button link type="danger" :icon="Delete" aria-label="删除步骤" title="删除步骤" @click="ac.steps.splice(si, 1)" />
          </div>
          <el-button link type="primary" @click="ac.steps.push({ op: 'refresh', target: '' })">+ 步骤</el-button>
        </div>
        <el-button type="primary" plain @click="addAction">+ 添加动作</el-button>
        <div class="panel-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>动作链：触发事件 → 步骤列表。目标下拉按动作类型切换：容器类动作（打开/关闭容器、加载/保存记录）选容器地址，数据类动作选数据源标识。值支持模板变量：{node.id}（树节点标识）、{row.id}（表格行标识），输入 { 可从当前触发器可用变量中补全；「重载记录」用 value、「加载记录」用 recordId 传记录 ID 模板</span>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Plus, InfoFilled, Delete } from '@element-plus/icons-vue'
import type { DataSourceDTO } from '@/api/data-source'
import BusTemplateInput from './BusTemplateInput.vue'
import { loadBusFieldOptions, type BusFieldOption } from './busFieldOptions'
import {
  busOpOptions,
  busStepFields,
  busTemplateVars,
  busTriggerOptions,
  CONTAINER_OPS,
  type ActionStep,
  type BusOp,
  type BusStepField,
  type PageAction,
} from '@/types/pageActionCatalog'

/** 数据源绑定类型 */
export interface DataSourceBinding {
  /** 页面内标识 */
  id: string
  /** 绑定数据源名称（仅用于配置界面展示） */
  name?: string
  /** 全局数据源ID */
  refId: string
  /** 搜索字段（可选） */
  searchFields?: string[]
}

/** 验证错误类型 */
interface ValidationError {
  id?: string
  refId?: string
}

const props = defineProps<{
  /** 当前数据源绑定配置 */
  dataSources: DataSourceBinding[]
  /** 已启用的全局数据源列表 */
  enabledDataSources: DataSourceDTO[]
  /** 动作配置 */
  actions?: PageAction[]
  /** 行/记录字段名（模板变量 {row.x} 候选，由宿主设计器传入） */
  rowFields?: string[]
  /** 画布内表单容器候选（容器类动作的 target，值=容器地址即表单容器节点的 field），由宿主设计器传入 */
  containerTargets?: { value: string; label: string }[]
  /** 画布内数据容器候选（值=容器地址 field）。同源还有表格/KPI 时，按数据源寻址会抢位，容器要靠它才指得准 */
  dataTargets?: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  /** 更新数据源绑定配置 */
  (e: 'update:dataSources', value: DataSourceBinding[]): void
  /** 更新动作配置 */
  (e: 'update:actions', value: PageAction[]): void
}>()

/** 总线动作与触发器候选（来自 @/types/pageActionCatalog） */
const opOptions = busOpOptions()
const triggerOptions = busTriggerOptions()

/** 当前 op 是否使用某参数槽（决定输入框是否渲染） */
function stepHasField(step: ActionStep, field: BusStepField): boolean {
  return busStepFields(step.op).includes(field)
}

/** 该参数槽是否是本步骤参数列表的最后一项（是则拉满整行剩余宽度） */
function isLastParamField(step: ActionStep, field: BusStepField): boolean {
  const fields = busStepFields(step.op)
  return fields[fields.length - 1] === field
}

/** 容器类动作（打开/关闭容器、加载/保存记录）的 target 是容器地址，数据类动作的是数据源标识 */
function isContainerOp(op: BusOp): boolean {
  return CONTAINER_OPS.has(op)
}

/** value 输入框提示语：过滤值模板 / 记录 ID 模板 */
function stepValuePlaceholder(op: BusOp): string {
  return op === 'reload-record' ? '记录ID，如 {row.id}' : '如 {node.id}'
}

/** 页面内数据源标识 → 全局数据源 refId（未绑定/未选返回空串） */
function refIdOf(dsId?: string): string {
  return localDataSources.value.find((ds) => ds.id === dsId)?.refId || ''
}

/** 数据源实际列清单（按 refId 缓存，见 busFieldOptions） */
const fieldsByRefId = ref<Record<string, BusFieldOption[]>>({})

async function ensureFields(...dsIds: (string | undefined)[]): Promise<void> {
  for (const dsId of new Set(dsIds.filter(Boolean))) {
    const refId = refIdOf(dsId)
    if (!refId || fieldsByRefId.value[refId]) continue
    const options = await loadBusFieldOptions(refId)
    // 空清单（含请求失败）不落本地映射，下次重试；模块层已缓存的成功结果不会重复请求
    if (options.length) fieldsByRefId.value[refId] = options
  }
}

/** 值模板候选：{row.x} 取的是触发侧（来源容器）的数据，故按 ac.source 的列展开；
 *  source 为空=任意来源，无单一容器可依，回退宿主传入的整页字段 */
function templateVars(ac: PageAction): string[] {
  const sourceRefId = ac.source ? refIdOf(ac.source) : ''
  const sourceFields = sourceRefId ? fieldsByRefId.value[sourceRefId]?.map((f) => f.value) : undefined
  return busTemplateVars(ac.trigger, sourceFields ?? props.rowFields ?? [])
}

function fieldOptions(step: ActionStep): BusFieldOption[] {
  return fieldsByRefId.value[refIdOf(step.target)] || []
}

/** 当前激活的页签 */
const activeTab = ref('ds')

/** 本地数据源绑定副本 */
const localDataSources = ref<DataSourceBinding[]>([...props.dataSources])

/** 数据容器候选（宿主没传就是空，表单轨等没有数据容器的场景保持原样） */
const dataTargetList = computed(() => props.dataTargets || [])

/** 本地动作副本 */
const localActions = ref<PageAction[]>([...(props.actions || [])])

/** 验证错误 */
const errors = ref<ValidationError[]>([])

/** 监听外部数据源配置变化 */
watch(
  () => props.dataSources,
  (newVal) => {
    localDataSources.value = [...newVal]
    validateAll()
  },
  { deep: true }
)

/** 监听外部动作配置变化 */
watch(
  () => props.actions,
  (newVal) => {
    localActions.value = [...(newVal || [])]
  },
  { deep: true }
)

// 卡片配了来源就预取其列，值输入敲 { 时才有候选（任意来源无单一容器可依，不预取）
watch(
  () => localActions.value.map((ac) => ac.source || '').join('\u0000'),
  () => {
    for (const ac of localActions.value) if (ac.source) void ensureFields(ac.source)
  },
  { immediate: true },
)

/** 添加数据源绑定 */
function addBinding() {
  localDataSources.value.push({
    id: `ds_${Date.now().toString(36)}`,
    refId: '',
  })
  errors.value.push({})
}

/** 删除数据源绑定 */
function removeBinding(index: number) {
  localDataSources.value.splice(index, 1)
  errors.value.splice(index, 1)
}

/** 添加动作 */
function addAction() {
  // 默认动作打开容器，target 优先填第一个容器地址；画布无容器时回退第一个数据源（用户可改）
  const firstTarget = props.containerTargets?.[0]?.value ?? localDataSources.value[0]?.id ?? ''
  localActions.value.push({
    trigger: 'row-edit',
    source: '',
    steps: [{ op: 'open-container', target: firstTarget }],
  })
}

/** 删除动作 */
function removeAction(index: number) {
  localActions.value.splice(index, 1)
}

/** 验证单个绑定 */
function validateBinding(index: number): ValidationError {
  const ds = localDataSources.value[index]
  const error: ValidationError = {}

  if (!ds.id || ds.id.trim() === '') {
    error.id = '页面内标识不能为空'
  } else {
    // 检查页面内标识是否重复
    const duplicateIndex = localDataSources.value.findIndex(
      (d, i) => i !== index && d.id === ds.id
    )
    if (duplicateIndex !== -1) {
      error.id = '页面内标识已存在'
    }
  }

  if (!ds.refId) {
    error.refId = '请选择全局数据源'
  }

  return error
}

/** 验证所有绑定 */
function validateAll() {
  errors.value = localDataSources.value.map((_, index) => validateBinding(index))
}

/** 外部调用：确认并提交所有变更 */
function confirm() {
  validateAndEmit()
  emitActions()
}

defineExpose({ confirm })

/** 验证并触发数据源更新 */
function validateAndEmit() {
  validateAll()
  emit('update:dataSources', localDataSources.value.map((binding) => ({
    ...binding,
    name: props.enabledDataSources.find((source) => source.id === binding.refId)?.name,
  })))
}

/** 触发动作更新 */
function emitActions() {
  emit('update:actions', [...localActions.value])
}
</script>

<style scoped>
.data-source-config-panel {
  padding: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.binding-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

.binding-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.binding-input {
  width: 150px;
}

.binding-select {
  flex: 1;
}

.binding-errors {
  margin-top: 8px;
  display: flex;
  gap: 12px;
}

.error-text {
  font-size: 12px;
  color: var(--el-color-danger);
}

.is-error :deep(.el-input__wrapper),
.is-error :deep(.el-select__wrapper) {
  border-color: var(--el-color-danger);
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}

.panel-tip {
  margin-top: 16px;
  padding: 8px 12px;
  background: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 动作总线样式 */
.action-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  background: var(--el-fill-color-lighter);
}

.action-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.step-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: 16px;
  margin-bottom: 8px;
}

/* 行内最后一个参数控件：吃掉整行剩余宽度（其余控件固定宽），长模板串和容器地址不被截断 */
.step-param-fill {
  flex: 1 1 0;
  min-width: 150px;
}

</style>
