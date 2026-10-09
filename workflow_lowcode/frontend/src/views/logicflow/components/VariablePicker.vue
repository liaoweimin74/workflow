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
            <div v-for="item in g.items" :key="g.key + item.name" class="vp-branch">
              <button
                class="vp-item"
                type="button"
                :title="item.detail || item.name"
                @click="onPick(item)"
              >
                <span class="vp-row">
                  <span
                    v-if="item.children?.length"
                    class="vp-caret"
                    role="button"
                    tabindex="0"
                    :aria-label="isOpen(item.name) ? '收起字段' : '展开字段'"
                    @click.stop="toggle(item.name)"
                    @keydown.enter.stop.prevent="toggle(item.name)"
                    @keydown.space.stop.prevent="toggle(item.name)"
                  >{{ isOpen(item.name) ? '▾' : '▸' }}</span>
                  <span class="vp-name">{{ item.name }}</span>
                  <span v-if="item.detail" class="vp-detail">{{ item.detail }}</span>
                </span>
              </button>
              <!-- 子字段（二级）：点击插完整路径；孙字段（三级，采样深层）同列平铺 -->
              <template v-if="item.children?.length && (isOpen(item.name) || searching)">
                <template v-for="c in item.children" :key="item.name + c.name">
                  <button class="vp-item vp-child" type="button" :title="c.detail || c.name" @click="onPick(c)">
                    <span class="vp-row">
                      <span class="vp-caret vp-caret-leaf">·</span>
                      <span class="vp-name">{{ shortName(c.name) }}</span>
                      <span v-if="c.detail" class="vp-detail">{{ c.detail }}</span>
                    </span>
                  </button>
                  <button
                    v-for="gc in c.children || []"
                    :key="item.name + gc.name"
                    class="vp-item vp-child vp-grandchild"
                    type="button"
                    :title="gc.detail || gc.name"
                    @click="onPick(gc)"
                  >
                    <span class="vp-row">
                      <span class="vp-caret vp-caret-leaf">·</span>
                      <span class="vp-name">{{ shortName(gc.name) }}</span>
                      <span v-if="gc.detail" class="vp-detail">{{ gc.detail }}</span>
                    </span>
                  </button>
                </template>
              </template>
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

.var-popper .vp-item.vp-child {
  padding-left: 18px;
}

.var-popper .vp-item.vp-grandchild {
  padding-left: 32px;
}

.var-popper .vp-item.vp-child .vp-name,
.var-popper .vp-item.vp-grandchild .vp-name {
  font-weight: 500;
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
