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
                @input="validateAndEmit"
              />
              <el-select
                v-model="ds.refId"
                placeholder="选择全局数据源"
                class="binding-select"
                :class="{ 'is-error': errors[index]?.refId }"
                filterable
                @change="validateAndEmit"
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
                @click="removeBinding(index)"
              >
                删除
              </el-button>
            </div>
            <div class="binding-errors" v-if="errors[index]">
              <span v-if="errors[index].id" class="error-text">{{ errors[index].id }}</span>
              <span v-if="errors[index].refId" class="error-text">{{ errors[index].refId }}</span>
            </div>
          </div>
        </div>

        <el-empty v-else description="暂无数据源绑定" :image-size="60" />

        <div class="panel-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>数据组件（表格/树）绑定：选中组件 → 属性面板「数据源 id」填上方页面内标识</span>
        </div>
      </el-tab-pane>

      <!-- 动作总线 -->
      <el-tab-pane label="动作总线" name="actions">
        <div class="action-card" v-for="(ac, i) in localActions" :key="i">
          <div class="action-row">
            <el-select v-model="ac.trigger" style="width: 150px">
              <el-option label="树节点点击" value="node-click" />
              <el-option label="表格行点击" value="row-click" />
              <el-option label="字段变化" value="field-change" />
              <el-option label="记录变化" value="record-change" />
            </el-select>
            <el-button link type="danger" @click="removeAction(i)">删除</el-button>
          </div>
          <div class="step-row" v-for="(step, si) in ac.steps" :key="si">
            <el-select v-model="step.op" style="width: 120px">
              <el-option label="设置过滤" value="set-filter" />
              <el-option label="刷新数据" value="refresh" />
              <el-option label="重载记录" value="reload-record" />
              <el-option label="保存记录" value="save-record" />
            </el-select>
            <el-input v-model="step.target" placeholder="目标数据源标识" style="width: 130px" />
            <el-input v-if="step.op === 'set-filter'" v-model="step.field" placeholder="过滤字段" style="width: 90px" />
            <el-input v-if="step.op === 'set-filter'" v-model="step.value" placeholder="如 {node.id}" style="width: 100px" />
            <el-button link type="danger" @click="ac.steps.splice(si, 1)">删</el-button>
          </div>
          <el-button link type="primary" @click="ac.steps.push({ op: 'refresh', target: '' })">+ 步骤</el-button>
        </div>
        <el-button type="primary" plain @click="addAction">+ 添加动作</el-button>
        <div class="panel-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>动作链：触发事件 → 步骤列表。「设置过滤」的值支持模板变量：{node.id}（树节点标识）、{row.id}（表格行标识）</span>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import type { DataSourceDTO } from '@/api/data-source'
import type { LookupFilterConfig } from './types'

/** 数据源绑定类型 */
export interface DataSourceBinding {
  /** 页面内标识 */
  id: string
  /** 全局数据源ID */
  refId: string
  /** 搜索字段（可选） */
  searchFields?: string[]
  /**
   * 数据源级筛选条件（可选）。
   * 引用该数据源的组件（LookupPicker/DataPicker 等）查询时，
   * 与组件级 filter 以 AND 合并后作为最终查询条件。
   */
  filter?: LookupFilterConfig
}

/** 动作步骤类型 */
export interface ActionStep {
  /** 操作类型 */
  op: 'set-filter' | 'refresh' | 'reload-record' | 'save-record'
  /** 目标数据源标识 */
  target: string
  /** 过滤字段（set-filter 时使用） */
  field?: string
  /** 过滤值模板（set-filter 时使用） */
  value?: string
}

/** 动作类型 */
export interface Action {
  /** 触发事件 */
  trigger: 'node-click' | 'row-click' | 'field-change' | 'record-change'
  /** 步骤列表 */
  steps: ActionStep[]
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
  actions?: Action[]
}>()

const emit = defineEmits<{
  /** 更新数据源绑定配置 */
  (e: 'update:dataSources', value: DataSourceBinding[]): void
  /** 更新动作配置 */
  (e: 'update:actions', value: Action[]): void
}>()

/** 当前激活的页签 */
const activeTab = ref('ds')

/** 本地数据源绑定副本 */
const localDataSources = ref<DataSourceBinding[]>([...props.dataSources])

/** 本地动作副本 */
const localActions = ref<Action[]>([...(props.actions || [])])

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

/** 添加数据源绑定 */
function addBinding() {
  localDataSources.value.push({
    id: `ds_${Date.now().toString(36)}`,
    refId: '',
  })
  errors.value.push({})
  validateAndEmit()
}

/** 删除数据源绑定 */
function removeBinding(index: number) {
  localDataSources.value.splice(index, 1)
  errors.value.splice(index, 1)
  validateAndEmit()
}

/** 添加动作 */
function addAction() {
  localActions.value.push({
    trigger: 'node-click',
    steps: [{ op: 'set-filter', target: '', field: '', value: '{node.id}' }],
  })
  emitActions()
}

/** 删除动作 */
function removeAction(index: number) {
  localActions.value.splice(index, 1)
  emitActions()
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

/** 验证并触发数据源更新 */
function validateAndEmit() {
  validateAll()
  emit('update:dataSources', [...localDataSources.value])
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
  color: #303133;
}

.binding-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
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
  color: #f56c6c;
}

.is-error :deep(.el-input__wrapper),
.is-error :deep(.el-select__wrapper) {
  border-color: #f56c6c;
}

.panel-tip {
  margin-top: 16px;
  padding: 8px 12px;
  background: #f4f4f5;
  border-radius: 4px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 动作总线样式 */
.action-card {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafafa;
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
</style>
