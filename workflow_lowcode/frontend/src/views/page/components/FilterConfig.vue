<template>
  <div class="filter-config">
    <div class="filter-toolbar">
      <el-radio-group v-model="local.logic" size="small">
        <el-radio-button value="AND">所有（且）</el-radio-button>
        <el-radio-button value="OR">任一（或）</el-radio-button>
      </el-radio-group>
      <el-button type="primary" link @click="addCondition">
        + 添加筛选条件
      </el-button>
    </div>

    <div v-if="local.conditions.length > 0" class="filter-rows">
      <div v-for="(row, i) in local.conditions" :key="i" class="filter-row">
        <el-select
          v-model="row.column"
          placeholder="目标列"
          style="width: 30%"
        >
          <el-option v-for="c in columns" :key="c.key" :label="c.label || c.key" :value="c.key" />
        </el-select>
        <el-select v-model="row.op" style="width: 22%">
          <el-option label="等于" value="eq" />
          <el-option label="不等于" value="ne" />
          <el-option label="包含" value="like" />
          <el-option label="属于" value="in" />
          <el-option label="为空" value="isEmpty" />
          <el-option label="不为空" value="isNotEmpty" />
        </el-select>
        <el-input v-model="row.value" placeholder="固定值" style="width: 35%" />
        <el-button type="danger" link @click="removeCondition(i)">删除</el-button>
      </div>
    </div>

    <el-empty v-else description="暂无筛选条件" :image-size="48" />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick, watch } from 'vue'

interface FilterCondition {
  column: string
  op: string
  source: 'fixed'
  value: string
}

interface FilterValue {
  logic: 'AND' | 'OR'
  conditions: FilterCondition[]
}

const props = defineProps<{
  modelValue?: FilterValue
  columns: Array<{ key: string; label: string }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: FilterValue): void
}>()

/** 防止父→子→父循环更新的守卫 */
const syncing = ref(false)

const local = reactive<FilterValue>({
  logic: props.modelValue?.logic || 'AND',
  conditions: (props.modelValue?.conditions || []).map((c) => ({ ...c, source: 'fixed' as const })),
})

watch(
  () => props.modelValue,
  (val) => {
    if (!val) return
    syncing.value = true
    local.logic = val.logic || 'AND'
    local.conditions.splice(0, local.conditions.length, ...val.conditions.map((c) => ({ ...c, source: 'fixed' as const })))
    nextTick(() => { syncing.value = false })
  },
  { deep: true },
)

watch(
  local,
  () => {
    if (syncing.value) return
    emit('update:modelValue', {
      logic: local.logic,
      conditions: local.conditions.map((c) => ({ ...c })),
    })
  },
  { deep: true },
)

function addCondition() {
  local.conditions.push({ column: '', op: 'eq', source: 'fixed', value: '' })
}

function removeCondition(index: number) {
  local.conditions.splice(index, 1)
}
</script>

<style scoped>
.filter-config {
  padding: 0;
}
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.filter-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
