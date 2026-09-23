<template>
  <div class="search-fields-config">
    <div class="config-header">
      <span class="config-title">查询条件（勾选可筛选列并设置匹配方式）</span>
      <span class="config-hint">已选 {{ modelValue.length }} 项</span>
    </div>
    <el-table :data="candidates" border  max-height="420">
      <el-table-column label="选择" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox :model-value="isChecked(row.key)" @change="(v: any) => toggle(row, !!v)" />
        </template>
      </el-table-column>
      <el-table-column prop="key" label="字段" width="160" />
      <el-table-column prop="label" label="标题" min-width="140" />
      <el-table-column label="匹配方式" width="200">
        <template #default="{ row }">
          <el-select
            v-if="isChecked(row.key)"
            :model-value="matchTypeOf(row.key)"
            
            style="width: 140px"
            @change="(v: any) => setMatchType(row.key, v)"
          >
            <el-option
              v-for="opt in matchOptions(row)"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="candidates.length === 0" description="当前表单无可筛选列" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { ColumnConfigItem } from '@/api/bizData'
import type { SearchFieldConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  candidates: ColumnConfigItem[]
  modelValue: SearchFieldConfig[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: SearchFieldConfig[]): void
}>()

function isChecked(key: string): boolean {
  return props.modelValue.some((f) => f.key === key)
}

/** 该列的 matchType 选项：文本 eq/like；数字 eq/range；日期 eq/range */
function matchOptions(col: ColumnConfigItem): { label: string; value: string }[] {
  if (col.columnType === 'INT' || col.columnType === 'DECIMAL') {
    return [
      { label: '等值', value: 'eq' },
      { label: '范围', value: 'range' },
    ]
  }
  if (col.columnType === 'DATE' || col.columnType === 'DATETIME') {
    return [
      { label: '等值', value: 'eq' },
      { label: '范围', value: 'range' },
    ]
  }
  return [
    { label: '等值', value: 'eq' },
    { label: '模糊', value: 'like' },
  ]
}

function defaultMatchType(col: ColumnConfigItem): string {
  return matchOptions(col)[0].value
}

function matchTypeOf(key: string): string {
  return props.modelValue.find((f) => f.key === key)?.matchType || 'eq'
}

function toggle(col: ColumnConfigItem, checked: boolean) {
  if (checked) {
    if (!isChecked(col.key)) {
      emit('update:modelValue', [
        ...props.modelValue,
        { key: col.key, label: col.label, matchType: defaultMatchType(col) },
      ])
    }
  } else {
    emit('update:modelValue', props.modelValue.filter((f) => f.key !== col.key))
  }
}

function setMatchType(key: string, v: string) {
  emit(
    'update:modelValue',
    props.modelValue.map((f) => (f.key === key ? { ...f, matchType: v } : f)),
  )
}
</script>

<style scoped>
.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.config-title {
  font-weight: bold;
}
.config-hint {
  font-size: 14px;
  color: #909399;
}
.muted {
  color: #c0c4cc;
}
</style>