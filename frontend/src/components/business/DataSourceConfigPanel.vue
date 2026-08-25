<template>
  <div class="data-source-config-panel">
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import type { DataSourceDTO } from '@/api/data-source'

/** 数据源绑定类型 */
export interface DataSourceBinding {
  /** 页面内标识 */
  id: string
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
}>()

const emit = defineEmits<{
  /** 更新数据源绑定配置 */
  (e: 'update:dataSources', value: DataSourceBinding[]): void
}>()

/** 本地数据源绑定副本 */
const localDataSources = ref<DataSourceBinding[]>([...props.dataSources])

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

/** 验证并触发更新 */
function validateAndEmit() {
  validateAll()
  emit('update:dataSources', [...localDataSources.value])
}
</script>

<style scoped>
.data-source-config-panel {
  padding: 16px;
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
</style>
