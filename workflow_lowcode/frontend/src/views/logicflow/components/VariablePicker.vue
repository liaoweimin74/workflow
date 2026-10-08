<template>
  <el-popover
    ref="popRef"
    trigger="click"
    :width="256"
    placement="bottom-end"
    :teleported="true"
    popper-class="var-popper"
  >
    <template #reference>
      <button class="vp-trigger" type="button" title="插入变量" aria-label="插入变量">{ }</button>
    </template>

    <div class="vp-body">
      <el-input v-model="keyword" size="small" placeholder="搜索变量" clearable :prefix-icon="Search" />

      <div class="vp-list">
        <template v-if="grouped.length">
          <div v-for="g in grouped" :key="g.key" class="vp-group">
            <div class="vp-group-title">{{ g.label }}</div>
            <button
              v-for="item in g.items"
              :key="g.key + item.name"
              class="vp-item"
              type="button"
              :title="item.detail || item.name"
              @click="onPick(item)"
            >
              <span class="vp-name">{{ item.name }}</span>
              <span v-if="item.detail" class="vp-detail">{{ item.detail }}</span>
            </button>
          </div>
        </template>
        <div v-else class="vp-empty">
          {{ keyword ? '无匹配变量' : '暂无可用变量：工具栏「入参」可声明，上游节点输出参数（results）可产出' }}
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { FlowVarItem } from '../utils/flowVars'
import { varInsertText } from '../utils/flowVars'

const props = withDefaults(
  defineProps<{
    variables?: FlowVarItem[]
    /** placeholder = 插入 {{name}}；bare = 插入裸变量名（Groovy / 变量名字段） */
    mode?: 'placeholder' | 'bare'
  }>(),
  { variables: () => [], mode: 'placeholder' }
)

const emit = defineEmits<{ pick: [text: string] }>()

const popRef = ref()
const keyword = ref('')

const GROUPS = [
  { key: 'input', label: '入参' },
  { key: 'loop', label: '循环变量' },
  { key: 'upstream', label: '上游产出' },
  { key: 'form', label: '表单数据' },
] as const

/** bare 模式不展示 formData（Groovy 上下文未承诺该变量） */
const visible = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return props.variables.filter((v) => {
    if (props.mode === 'bare' && v.group === 'form') return false
    if (!kw) return true
    return v.name.toLowerCase().includes(kw) || (v.detail ?? '').toLowerCase().includes(kw)
  })
})

const grouped = computed(() =>
  GROUPS.map((g) => ({ ...g, items: visible.value.filter((v) => v.group === g.key) })).filter(
    (g) => g.items.length
  )
)

function insertTextOf(v: FlowVarItem): string {
  return varInsertText(v, props.mode)
}

function onPick(v: FlowVarItem) {
  emit('pick', insertTextOf(v))
  keyword.value = ''
  popRef.value?.hide?.()
}
</script>

<style scoped>
.vp-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  min-width: 22px;
  padding: 0 3px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.vp-trigger:hover {
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  color: var(--el-color-primary);
}
</style>

<!-- 弹层挂 body（teleported），需全局样式 -->
<style>
.var-popper {
  max-width: 256px;
  padding: 8px !important;
}

.var-popper .vp-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.var-popper .vp-list {
  max-height: 264px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.var-popper .vp-list::-webkit-scrollbar {
  width: 5px;
}

.var-popper .vp-list::-webkit-scrollbar-thumb {
  background: var(--el-border-color);
  border-radius: 3px;
}

.var-popper .vp-group + .vp-group {
  margin-top: 6px;
}

.var-popper .vp-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding: 2px 4px;
  letter-spacing: 0.5px;
}

.var-popper .vp-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.var-popper .vp-item:hover {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.var-popper .vp-name {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.var-popper .vp-detail {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.var-popper .vp-empty {
  padding: 14px 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
