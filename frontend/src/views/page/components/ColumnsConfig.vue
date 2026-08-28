<template>
  <div class="columns-config">
    <div class="config-header">
      <span class="config-title">展示列（勾选 + 宽度/对齐/排序）</span>
      <span class="config-hint">已选 {{ modelValue.length }} 项</span>
    </div>
    <el-table :data="candidates" border max-height="420">
      <el-table-column label="选择" width="80" align="center">
        <template #default="{ row }">
          <el-checkbox :model-value="isChecked(row.key)" @change="(v: any) => toggle(row, !!v)" />
        </template>
      </el-table-column>
      <el-table-column prop="key" label="字段" width="160" />
      <el-table-column prop="label" label="标题" min-width="120" />
      <el-table-column label="宽度" width="130">
        <template #default="{ row }">
          <el-input-number
            v-if="isChecked(row.key)"
            :model-value="widthOf(row.key)"
            :min="50"
            :max="600"
            :step="10"
            style="width: 110px"
            @change="(v: any) => setProp(row.key, 'width', v)"
          />
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="对齐" width="120">
        <template #default="{ row }">
          <el-select
            v-if="isChecked(row.key)"
            :model-value="alignOf(row.key)"
            style="width: 100px"
            @change="(v: any) => setProp(row.key, 'align', v)"
          >
            <el-option label="左对齐" value="left" />
            <el-option label="居中" value="center" />
            <el-option label="右对齐" value="right" />
          </el-select>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="candidates.length === 0" description="当前表单无可展示列" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { ColumnConfigItem } from '@/api/bizData'
import type { ColumnViewConfig } from '../ViewDesigner.vue'

const props = defineProps<{
  candidates: ColumnConfigItem[]
  modelValue: ColumnViewConfig[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: ColumnViewConfig[]): void
}>()

function isChecked(key: string): boolean {
  return props.modelValue.some((c) => c.key === key)
}

function find(key: string): ColumnViewConfig | undefined {
  return props.modelValue.find((c) => c.key === key)
}

function widthOf(key: string): number {
  return find(key)?.width ?? 130
}

function alignOf(key: string): string {
  return find(key)?.align ?? 'left'
}

function toggle(col: ColumnConfigItem, checked: boolean) {
  if (checked) {
    if (!isChecked(col.key)) {
      emit('update:modelValue', [
        ...props.modelValue,
        { key: col.key, label: col.label, width: 130, align: 'left' },
      ])
    }
  } else {
    emit('update:modelValue', props.modelValue.filter((c) => c.key !== col.key))
  }
}

function setProp(key: string, prop: 'width' | 'align', v: any) {
  emit(
    'update:modelValue',
    props.modelValue.map((c) => (c.key === key ? { ...c, [prop]: v } : c)),
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