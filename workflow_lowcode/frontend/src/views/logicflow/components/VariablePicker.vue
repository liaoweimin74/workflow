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
        <template v-if="flatGroups.length">
          <div v-for="g in flatGroups" :key="g.key" class="vp-group">
            <div class="vp-group-title">{{ g.label }}</div>
            <div v-for="row in g.rows" :key="g.key + row.item.name" class="vp-branch">
              <button
                class="vp-item"
                type="button"
                :style="{ paddingLeft: 6 + row.depth * 14 + 'px' }"
                :title="row.item.name"
                @click="onPick(row.item)"
              >
                <span class="vp-row">
                  <span
                    v-if="row.hasKids"
                    class="vp-caret"
                    role="button"
                    tabindex="0"
                    :aria-label="isOpen(row.item.name) ? '收起字段' : '展开字段'"
                    @click.stop="toggle(row.item.name)"
                    @keydown.enter.stop.prevent="toggle(row.item.name)"
                    @keydown.space.stop.prevent="toggle(row.item.name)"
                  >{{ isOpen(row.item.name) || searching ? '▾' : '▸' }}</span>
                  <span v-else class="vp-caret vp-caret-leaf">·</span>
                  <span class="vp-name">{{ displayName(row.item, row.depth) }}</span>
                  <span v-if="row.item.detail" class="vp-type">{{ row.item.detail }}</span>
                </span>
              </button>
            </div>
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

/** 表单字段树展开状态（key = 条目 name） */
const expanded = ref(new Set<string>())

function isOpen(key: string): boolean {
  return expanded.value.has(key)
}

function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

/** 子字段展示名：去掉父前缀（formData. / formDataExisting.）只留路径尾段 */
function shortName(fullPath: string): string {
  return fullPath.replace(/^formDataExisting\./, '').replace(/^formData\./, '')
}

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
    return hitDeep(v, kw)
  })
})

/** 搜索时字段树自动展开（否则按关键字命中父条目后看不到子字段） */
const searching = computed(() => keyword.value.trim().length > 0)

/** 自身或任意后代命中关键字 */
function hitDeep(v: FlowVarItem, kw: string): boolean {
  const selfHit =
    v.name.toLowerCase().includes(kw) || (v.detail ?? '').toLowerCase().includes(kw)
  return selfHit || (v.children ?? []).some((c) => hitDeep(c, kw))
}

/** 搜索树剪枝：自身命中 → 整树保留；否则只保留命中后代枝 */
function pruneTree(v: FlowVarItem, kw: string): FlowVarItem | null {
  const selfHit =
    v.name.toLowerCase().includes(kw) || (v.detail ?? '').toLowerCase().includes(kw)
  const kids = (v.children ?? [])
    .map((c) => pruneTree(c, kw))
    .filter((c): c is FlowVarItem => c !== null)
  if (selfHit) return v
  return kids.length ? { ...v, children: kids } : null
}

/** 扁平行（任意深度）：搜索时全展开，否则按 expanded 集合展开 */
interface VpRow {
  item: FlowVarItem
  depth: number
  hasKids: boolean
}

function flattenRows(items: FlowVarItem[]): VpRow[] {
  const out: VpRow[] = []
  const walk = (list: FlowVarItem[], depth: number): void => {
    for (const it of list) {
      const kids = it.children ?? []
      out.push({ item: it, depth, hasKids: kids.length > 0 })
      if (kids.length && (isOpen(it.name) || searching.value)) walk(kids, depth + 1)
    }
  }
  walk(items, 0)
  return out
}

const flatGroups = computed(() => grouped.value.map((g) => ({ ...g, rows: flattenRows(g.items) })))

/** 根行显示完整变量名；子行显示相对路径（short 优先，回退剥 formData 前缀） */
function displayName(v: FlowVarItem, depth: number): string {
  if (depth === 0) return v.name
  return v.short ?? shortName(v.name)
}

const grouped = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return GROUPS.map((g) => {
    const items = visible.value.filter((v) => v.group === g.key)
    const pruned = kw ? items.map((v) => pruneTree(v, kw)).filter((v): v is FlowVarItem => v !== null) : items
    return { ...g, items: pruned }
  }).filter((g) => g.items.length)
})

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

.var-popper .vp-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.var-popper .vp-caret {
  flex: none;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-size: 10px;
  line-height: 1;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  user-select: none;
}

.var-popper .vp-caret:hover {
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  color: var(--el-color-primary);
}

.var-popper .vp-caret-leaf {
  cursor: default;
  color: var(--el-text-color-placeholder);
}

.var-popper .vp-caret-leaf:hover {
  background: transparent;
  color: var(--el-text-color-placeholder);
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

/* 类型徽标：右对齐轻量 pill（下拉只展示变量名 + 类型） */
.var-popper .vp-type {
  flex: none;
  margin-left: auto;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.var-popper .vp-item:hover .vp-type {
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  color: var(--el-color-primary);
}

.var-popper .vp-empty {
  padding: 14px 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
