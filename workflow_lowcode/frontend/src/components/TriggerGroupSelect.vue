<script lang="ts">
/**
 * 触发点分组可折叠下拉（el-select 分组版替代）：
 * - 分组标题加粗展示，点击标题折叠/展开该分组（箭头旋转指示）
 * - 面板顶部「展开全部 / 收起全部」快捷操作 + 触发点总数
 * - filterable 时显示搜索框，搜索自动展开全部分组，清空后恢复手动折叠状态
 * - 选项支持 extra 右侧辅助文案（如“N 项参数”）、选中高亮 + 对勾
 * - 触发框外观对齐 el-input（small=24px），支持 clearable 悬停清空
 * 对外类型供调用方构造 groups 结构使用。
 */
export interface TriggerGroupSelectItem {
  value: string
  label: string
  /** 选项右侧辅助文案（如“N 项参数”） */
  extra?: string
}
export interface TriggerGroupSelectGroup {
  /** 分组唯一键（折叠状态按 key 记忆） */
  key: string
  /** 分组标题（加粗展示） */
  label: string
  triggers: TriggerGroupSelectItem[]
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, CaretRight, Check, CircleClose, Search } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    groups: TriggerGroupSelectGroup[]
    placeholder?: string
    /** 显示清空按钮（悬停触发框时） */
    clearable?: boolean
    /** 面板顶部显示搜索框（搜索时自动展开全部分组） */
    filterable?: boolean
    /** 触发框宽度（CSS width 值，默认撑满容器） */
    width?: string
    /** 触发框尺寸（small 与 el-input small 同高 24px） */
    size?: 'small' | 'default'
  }>(),
  {
    placeholder: '请选择',
    clearable: true,
    filterable: false,
    width: '100%',
    size: 'small',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const visible = ref(false)
const keyword = ref('')
/** 折叠分组 key 集合（true = 已折叠），跨开合记忆 */
const collapsed = ref<Record<string, boolean>>({})

/** 选中项 label（跨分组查找，即使所在分组已折叠，触发框仍显示完整名称） */
const selectedLabel = computed(() => {
  for (const g of props.groups) {
    const hit = g.triggers.find((t) => t.value === props.modelValue)
    if (hit) return hit.label
  }
  return ''
})

/** 按关键字过滤分组（名称或 value 命中，空分组剔除） */
const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.groups
  return props.groups
    .map((g) => ({
      ...g,
      triggers: g.triggers.filter(
        (t) => t.label.toLowerCase().includes(kw) || t.value.toLowerCase().includes(kw),
      ),
    }))
    .filter((g) => g.triggers.length > 0)
})

const total = computed(() => props.groups.reduce((n, g) => n + g.triggers.length, 0))
const allCollapsed = computed(
  () => props.groups.length > 0 && props.groups.every((g) => collapsed.value[g.key]),
)

// 每次展开重置搜索词（折叠记忆保留），避免上次的过滤结果造成困惑
watch(visible, (open) => {
  if (open) keyword.value = ''
})

// 搜索时自动展开全部分组，直达匹配项；清空搜索后恢复手动折叠状态
watch(keyword, (kw) => {
  if (kw.trim()) collapsed.value = {}
})

function toggleGroup(key: string) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] }
}
function expandAll() {
  collapsed.value = {}
}
function collapseAll() {
  const next: Record<string, boolean> = {}
  for (const g of props.groups) next[g.key] = true
  collapsed.value = next
}

function pick(item: TriggerGroupSelectItem) {
  emit('update:modelValue', item.value)
  emit('change', item.value)
  visible.value = false
}
function clearValue() {
  emit('update:modelValue', '')
  emit('change', '')
}
</script>

<template>
  <el-popover
    v-model:visible="visible"
    trigger="click"
    :width="300"
    placement="bottom-start"
    popper-class="tgs-popper"
    :show-arrow="false"
  >
    <template #reference>
      <div
        class="tgs-trigger"
        :class="[`tgs-trigger--${size}`, { 'is-active': visible }]"
        :style="{ width }"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="visible"
        tabindex="0"
        @keydown.enter.prevent="visible = !visible"
        @keydown.esc="visible = false"
      >
        <span v-if="selectedLabel" class="tgs-trigger-label">{{ selectedLabel }}</span>
        <span v-else class="tgs-trigger-placeholder">{{ placeholder }}</span>
        <span class="tgs-trigger-suffix">
          <el-icon v-if="clearable && selectedLabel" class="tgs-clear" @click.stop="clearValue">
            <CircleClose />
          </el-icon>
          <el-icon class="tgs-arrow" :class="{ 'is-open': visible }"><ArrowDown /></el-icon>
        </span>
      </div>
    </template>

    <div class="tgs-panel" role="listbox">
      <div v-if="filterable" class="tgs-search">
        <el-input v-model="keyword" size="small" placeholder="搜索触发点" clearable :prefix-icon="Search" />
      </div>
      <div class="tgs-toolbar">
        <el-link type="primary" underline="never" @click="allCollapsed ? expandAll() : collapseAll()">
          {{ allCollapsed ? '展开全部' : '收起全部' }}
        </el-link>
        <span class="tgs-total">共 {{ total }} 个触发点</span>
      </div>
      <div class="tgs-groups">
        <div
          v-for="g in filteredGroups"
          :key="g.key"
          class="tgs-group"
          :class="{ 'is-collapsed': collapsed[g.key] }"
        >
          <div
            class="tgs-group-header"
            role="button"
            :aria-expanded="!collapsed[g.key]"
            tabindex="0"
            @click="toggleGroup(g.key)"
            @keydown.enter.prevent="toggleGroup(g.key)"
            @keydown.space.prevent="toggleGroup(g.key)"
          >
            <el-icon class="tgs-chevron" :class="{ 'is-collapsed': collapsed[g.key] }">
              <CaretRight />
            </el-icon>
            <!-- 分组标题：加粗展示 -->
            <span class="tgs-group-title">{{ g.label }}</span>
            <span class="tgs-group-count">{{ g.triggers.length }}</span>
          </div>
          <div v-show="!collapsed[g.key]" class="tgs-group-body">
            <div
              v-for="t in g.triggers"
              :key="t.value"
              class="tgs-option"
              :class="{ 'is-selected': t.value === modelValue }"
              role="option"
              :aria-selected="t.value === modelValue"
              @click="pick(t)"
            >
              <span class="tgs-option-label">{{ t.label }}</span>
              <span v-if="t.extra" class="tgs-option-extra">{{ t.extra }}</span>
              <el-icon v-if="t.value === modelValue" class="tgs-check"><Check /></el-icon>
            </div>
          </div>
        </div>
        <div v-if="!filteredGroups.length" class="tgs-empty">无匹配触发点</div>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
/* ===== 触发框（对齐 el-input 外观） ===== */
.tgs-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s;
  outline: none;
}
.tgs-trigger:hover {
  border-color: var(--el-border-color-hover);
}
.tgs-trigger.is-active,
.tgs-trigger:focus-visible {
  border-color: var(--el-color-primary);
}
.tgs-trigger--small {
  height: 24px;
  font-size: 12px;
}
.tgs-trigger--default {
  height: 32px;
  font-size: 14px;
}
.tgs-trigger-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}
.tgs-trigger-placeholder {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-placeholder);
}
.tgs-trigger-suffix {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}
.tgs-clear {
  visibility: hidden;
  font-size: 13px;
  transition: color 0.15s;
}
.tgs-clear:hover {
  color: var(--el-text-color-secondary);
}
.tgs-trigger:hover .tgs-clear {
  visibility: visible;
}
.tgs-arrow {
  font-size: 12px;
  transition: transform 0.2s;
}
.tgs-arrow.is-open {
  transform: rotate(180deg);
}

/* ===== 面板 ===== */
.tgs-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tgs-search {
  padding: 0 2px 2px;
}
.tgs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  font-size: 12px;
}
.tgs-total {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.tgs-groups {
  max-height: 274px;
  overflow-y: auto;
  padding-right: 2px;
}
.tgs-groups::-webkit-scrollbar {
  width: 6px;
}
.tgs-groups::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
  border-radius: 3px;
}
.tgs-groups::-webkit-scrollbar-track {
  background: transparent;
}

/* ===== 分组（标题加粗 + 可折叠） ===== */
.tgs-group {
  margin-bottom: 2px;
}
.tgs-group:last-child {
  margin-bottom: 0;
}
.tgs-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}
.tgs-group-header:hover {
  background: var(--el-fill-color-light);
}
.tgs-group-header:focus-visible {
  outline: 1px solid var(--el-color-primary);
}
.tgs-chevron {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
}
/* 展开态箭头朝下（CaretRight 旋转 90°），折叠态保持朝右默认方向 */
.tgs-group:not(.is-collapsed) .tgs-chevron {
  transform: rotate(90deg);
}
.tgs-group-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--el-text-color-primary);
  letter-spacing: 0.5px;
}
.tgs-group-count {
  margin-left: auto;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}
.tgs-group.is-collapsed .tgs-group-count {
  background: var(--el-fill-color);
}
.tgs-group-body {
  padding: 0 2px 2px;
}

/* ===== 选项 ===== */
.tgs-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 22px;
  margin: 0 2px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background-color 0.15s;
}
.tgs-option:hover {
  background: var(--el-fill-color-light);
}
.tgs-option.is-selected {
  color: var(--el-color-primary);
  font-weight: 500;
}
.tgs-option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tgs-option-extra {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.tgs-option.is-selected .tgs-option-extra {
  color: var(--el-color-primary);
}
.tgs-check {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--el-color-primary);
}
.tgs-empty {
  padding: 16px 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>

<!-- popper 挂在 body 层（teleport），scoped 样式不可达，经 popper-class 定点注入 -->
<style>
.tgs-popper {
  padding: 6px 4px 8px !important;
}
</style>
