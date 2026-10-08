<script setup lang="ts">
/**
 * SideNavList — 通用左栏轻量导航列表（Task 117）。
 *
 * 从字典管理的「左类型导航 + 右数据表格」主从布局中抽象而来，适用于：
 * 字典类型 / 消息模板分类 / 数据源目录 / 表单分组等「小集合目录 + 明细表」场景。
 *
 * 设计原则：
 * - **受控纯展示**：数据由父级管理（items 传入，select 事件回传），组件零业务感知；
 *   选中态用 selectedKey 受控，父级决定选中回落策略（如「自动选第一个」）。
 * - **本地过滤**：目录多为小集合，组件内置 title/subtitle 前端过滤（filterable 可关），
 *   不发起搜索请求——与 SearchTable 的「服务端搜索」分工互补。
 * - **行内操作配置化**：actions 谓词（show/disabled）对齐 ActionButton 风格；
 *   特殊需求用 #item-append 插槽兜底。
 * - **键盘可达**：ArrowUp/ArrowDown 移动选中，Enter/Space 确认（listbox 语义）。
 */
defineOptions({ name: 'SideNavList' })

import { ref, computed } from 'vue'
import { Search, Plus } from '@element-plus/icons-vue'
import type { NavItem, NavItemAction } from './types'

const props = withDefaults(
  defineProps<{
    /** 卡头标题（不传则不渲染卡头栏） */
    title?: string
    items: NavItem[]
    /** 受控选中键 */
    selectedKey?: string | number | null
    loading?: boolean
    /** 是否启用本地过滤（默认开） */
    filterable?: boolean
    filterPlaceholder?: string
    /** 过滤输入框 aria-label（默认「搜索列表」） */
    filterAriaLabel?: string
    /** 是否显示卡头「+ 新建」按钮 */
    creatable?: boolean
    createLabel?: string
    createDisabled?: boolean
    /** 行内操作（hover/选中/聚焦时浮现） */
    actions?: NavItemAction[]
    /** 左栏宽度（px，窄屏 100% 堆叠） */
    width?: number
    /** 空态主文案 */
    emptyText?: string
    /** 空态引导文案（creatable 时与「+」联动提示） */
    emptyHint?: string
  }>(),
  {
    title: undefined,
    selectedKey: null,
    loading: false,
    filterable: true,
    filterPlaceholder: '搜索',
    filterAriaLabel: '搜索列表',
    creatable: false,
    createLabel: '新增',
    createDisabled: false,
    actions: () => [],
    width: 264,
    emptyText: '暂无数据',
    emptyHint: undefined,
  },
)

const emit = defineEmits<{
  (e: 'select', item: NavItem): void
  (e: 'create'): void
}>()

// ── 本地过滤（title/subtitle 不区分大小写 includes） ──
const keyword = ref('')
const visibleItems = computed<NavItem[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.items
  return props.items.filter(
    (it) =>
      it.title?.toLowerCase().includes(kw) ||
      it.subtitle?.toLowerCase().includes(kw),
  )
})

// ── 键盘导航：在可见项中移动选中 ──
function moveSelection(delta: number): void {
  const list = visibleItems.value
  if (list.length === 0) return
  const idx = list.findIndex((it) => it.key === props.selectedKey)
  const next = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : Math.min(Math.max(idx + delta, 0), list.length - 1)
  const target = list[next]
  if (target && target.key !== props.selectedKey) emit('select', target)
}

function onItemClick(item: NavItem): void {
  emit('select', item)
}

function actionsOf(item: NavItem): NavItemAction[] {
  return props.actions.filter((a) => a.show?.(item) ?? true)
}

defineExpose({
  /** 清空过滤关键字（父级在数据刷新后可调用） */
  clearFilter: () => {
    keyword.value = ''
  },
})
</script>

<template>
  <el-card class="sidenav" :body-style="{ padding: '0' }" shadow="never" :style="{ '--sidenav-width': `${width}px` }">
    <!-- 卡头：标题 + 新建（或自定义扩展） -->
    <template #header>
      <slot name="header">
        <div class="sidenav-header">
          <span class="sidenav-title">{{ title }}</span>
          <slot name="header-extra">
            <el-tooltip v-if="creatable" :content="createLabel" placement="top">
              <el-button
                type="primary" :icon="Plus" size="small" circle
                :aria-label="createLabel"
                :disabled="createDisabled" @click="emit('create')"
              />
            </el-tooltip>
          </slot>
        </div>
      </slot>
    </template>

    <!-- 本地过滤 -->
    <div v-if="filterable" class="sidenav-filter">
      <el-input
        v-model="keyword"
        :placeholder="filterPlaceholder"
        :prefix-icon="Search"
        size="small"
        clearable
        :aria-label="filterAriaLabel"
      />
    </div>

    <el-scrollbar class="sidenav-scroll" role="listbox" :aria-label="title ?? filterAriaLabel">
      <div v-if="loading" class="sidenav-placeholder">加载中…</div>
      <div v-else-if="visibleItems.length === 0" class="sidenav-placeholder">
        <slot name="empty">
          <div>{{ keyword ? '无匹配项' : emptyText }}</div>
          <div v-if="!keyword && emptyHint" class="sidenav-empty-hint">{{ emptyHint }}</div>
        </slot>
      </div>

      <div
        v-for="item in visibleItems"
        :key="item.key"
        class="sidenav-item"
        :class="{ 'is-selected': item.key === selectedKey, 'is-disabled': item.disabled }"
        role="option"
        :aria-selected="item.key === selectedKey"
        tabindex="0"
        @click="onItemClick(item)"
        @keydown.enter.prevent="onItemClick(item)"
        @keydown.space.prevent="onItemClick(item)"
        @keydown.down.prevent="moveSelection(1)"
        @keydown.up.prevent="moveSelection(-1)"
      >
        <div class="sidenav-item-main">
          <div class="sidenav-item-title-row">
            <span class="sidenav-item-title" :title="item.title">{{ item.title }}</span>
            <el-tag v-if="item.disabled" size="small" type="info" effect="plain">
              {{ item.disabledLabel ?? '停用' }}
            </el-tag>
          </div>
          <div v-if="item.subtitle" class="sidenav-item-subtitle" :title="item.subtitle">
            {{ item.subtitle }}
          </div>
        </div>

        <!-- badge -->
        <el-badge v-if="item.badge !== undefined" :value="item.badge" class="sidenav-item-badge" />

        <!-- 行内操作：hover/选中/聚焦浮现 -->
        <div v-if="actionsOf(item).length > 0 || $slots['item-append']" class="sidenav-item-actions" @click.stop>
          <slot name="item-append" :item="item" />
          <el-tooltip
            v-for="action in actionsOf(item)"
            :key="action.label"
            :content="action.label"
            placement="top"
          >
            <el-button
              :icon="action.icon"
              size="small"
              link
              :type="action.type"
              :aria-label="action.label"
              :disabled="action.disabled?.(item)"
              @click="action.onClick(item)"
            />
          </el-tooltip>
        </div>
      </div>
    </el-scrollbar>
  </el-card>
</template>

<style scoped>
.sidenav {
  width: 100%;
  flex-shrink: 0;
}
@media (min-width: 1024px) {
  .sidenav {
    width: var(--sidenav-width, 264px);
  }
}
.sidenav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sidenav-title {
  font-size: 14px;
  font-weight: bold;
}
.sidenav-filter {
  padding: 8px 12px 4px;
}
.sidenav-scroll {
  height: calc(100vh - 320px);
  min-height: 240px;
}
.sidenav-placeholder {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.sidenav-empty-hint {
  margin-top: 4px;
  color: var(--el-text-color-placeholder);
}
.sidenav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}
.sidenav-item:hover {
  background-color: var(--el-fill-color-light);
}
.sidenav-item.is-selected {
  background-color: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}
.sidenav-item.is-disabled .sidenav-item-title,
.sidenav-item.is-disabled .sidenav-item-subtitle {
  opacity: 0.5;
}
.sidenav-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.sidenav-item-main {
  min-width: 0;
  flex: 1;
}
.sidenav-item-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sidenav-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidenav-item-subtitle {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.sidenav-item-badge {
  flex-shrink: 0;
}
/* 行内操作默认隐藏，hover/focus/选中时浮现（键盘可达：focus-within 也触发） */
.sidenav-item-actions {
  display: none;
  flex-shrink: 0;
}
.sidenav-item:hover .sidenav-item-actions,
.sidenav-item:focus-within .sidenav-item-actions,
.sidenav-item.is-selected .sidenav-item-actions {
  display: inline-flex;
}
</style>
