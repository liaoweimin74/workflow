<template>
  <el-dialog v-model="visible" title="移动卡片配置" width="640px" :close-on-click-modal="false" destroy-on-close>
    <!-- 空列=数据块还没配显示列（缺省映射与覆盖都以列为依据），只给指引不给编辑 -->
    <div v-if="rows.length === 0" class="m-panel__empty">
      请先在数据块配置显示列（桌面「表格配置」），再回来调整移动端卡片的槽位、显隐与排序。
    </div>
    <div v-else class="m-panel">
      <div class="m-panel__hint">
        行序即卡片展示顺序，可用 ↑↓ 调整；「不参与」与「隐藏」的列不会出现在移动卡片上。
      </div>
      <div
        v-for="(row, index) in rows"
        :key="row.key"
        class="m-panel__row"
        :data-key="row.key"
        :data-slot="row.slot"
      >
        <span class="m-panel__row-label">{{ row.label }}<em class="m-panel__row-key">{{ row.key }}</em></span>
        <el-select v-model="row.slot" size="small" class="m-panel__slot">
          <el-option label="标题槽" value="title" />
          <el-option label="副标题槽" value="subtitle" />
          <el-option label="键值区" value="kv" />
          <el-option label="不参与" value="none" />
        </el-select>
        <el-checkbox v-model="row.hidden" class="m-panel__hide">隐藏</el-checkbox>
        <span class="m-panel__order">
          <el-button size="small" text :disabled="index === 0" @click="moveRow(index, -1)">↑</el-button>
          <el-button size="small" text :disabled="index === rows.length - 1" @click="moveRow(index, 1)">↓</el-button>
        </span>
      </div>
    </div>
    <template #footer>
      <el-button class="m-panel__btn-auto" @click="restoreAuto">恢复自动映射</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" class="m-panel__btn-apply" @click="apply">应用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 设计器「移动卡片配置」对话框（§5.1 第2层覆盖层的可编辑面，只做三件事：
 * 列→槽位、字段显隐、排序）。数据层全部走 mobileCardPanel 纯函数：
 * 打开=toPanelRows(列, 当前覆盖) 所见即所得；应用=fromPanelRows 固化当前面板行
 * （含缺省推导结果——确认后移动展示不再随桌面列序漂移）；
 * 恢复自动映射=confirm(null)，宿主清除该块在 channelProfiles 里的条目。
 * 面板 v1 固定编辑 H5 配置（H5/APP 共用同一 Vant 渲染器；MP 为 P2 独立口径）。
 */
import { computed, ref, watch } from 'vue'

import { fromPanelRows, toPanelRows, type PanelRow } from './mobileCardPanel'
import type { CardSlotsOverride } from './channelProfiles'
import type { CardSlotColumn } from './cardSlots'

const props = defineProps<{
  modelValue: boolean
  /** 块的桌面显示列配置（rule.props.columns），面板行的唯一数据源 */
  columns?: CardSlotColumn[]
  /** 该块在当前渠道的既有 card 覆盖；缺省=展示自动映射初值 */
  override?: CardSlotsOverride | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', value: CardSlotsOverride | null): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const rows = ref<PanelRow[]>([])

function initRows() {
  rows.value = toPanelRows(props.columns ?? [], props.override ?? undefined)
}
// 每次打开按「当前覆盖优先、缺省回落自动映射」重灌面板行（取消=无副作用）
watch(() => props.modelValue, (open) => { if (open) initRows() })
initRows()

/** 行排序=面板行序（序列化进 columnOrder） */
function moveRow(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= rows.value.length) return
  const next = [...rows.value]
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  rows.value = next
}

function apply() {
  if (rows.value.length === 0) return
  emit('confirm', fromPanelRows(rows.value))
  visible.value = false
}

function restoreAuto() {
  emit('confirm', null)
  visible.value = false
}
</script>

<style scoped>
.m-panel__empty {
  padding: 24px 0;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.m-panel__hint {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.m-panel__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.m-panel__row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-panel__row-key {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-style: normal;
}
.m-panel__slot {
  width: 120px;
  flex-shrink: 0;
}
.m-panel__hide {
  flex-shrink: 0;
}
.m-panel__order {
  flex-shrink: 0;
}
</style>
