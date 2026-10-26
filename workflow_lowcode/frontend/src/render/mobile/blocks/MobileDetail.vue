<script setup lang="ts">
/**
 * 移动详情块（page-detail → 模板 detail）：桌面 el-descriptions 的移动等价=键值行列表
 * （Vant cell 视觉，自绘行结构：宿主注册与否都稳定，测试无全局插件依赖）。
 * 协议对齐 PageDataDetail：纯展示不自行取数，记录经 expose load/clear 注入（行点击联动）；
 * columns 缺省回退记录键（剔除 <key>_text 内部显示列）；formatter 支持函数与 $row.x 模板串。
 */
import { computed, onMounted, ref } from 'vue'

interface DetailColumn {
  key: string
  label?: string
  formatter?: ((value: any, record: Record<string, any>) => unknown) | string
}

const props = withDefaults(
  defineProps<{
    pageKey?: string
    dataSourceId?: string
    dsRefId?: string
    columns?: DetailColumn[]
    title?: string
    designMode?: boolean
  }>(),
  { columns: () => [] },
)

const emit = defineEmits<{
  (e: 'ready', instance: { load: typeof load; clear: typeof clear; record: typeof record }): void
}>()

/** 当前记录（expose load(record) 注入；clear() 清空回空态） */
const record = ref<Record<string, any> | null>(null)

/** KV 列：显式配置优先；未配置且已有记录时回退记录自身键（剔除 _text 内部显示列） */
const displayColumns = computed<DetailColumn[]>(() => {
  const declared = (props.columns || []).filter((c) => c && c.key)
  if (declared.length > 0) return declared
  if (!record.value) return []
  return Object.keys(record.value)
    .filter((k) => !k.endsWith('_text'))
    .map((k) => ({ key: k, label: k }))
})

/** 单元格显示值：函数 formatter → $row.x 模板串 → 数组 join → String */
function displayValue(col: DetailColumn): string {
  const rec = record.value || {}
  const value = rec[col.key]
  if (typeof col.formatter === 'function') {
    const out = col.formatter(value, rec)
    return out === null || out === undefined ? '' : String(out)
  }
  if (typeof col.formatter === 'string' && col.formatter) {
    return col.formatter.replace(/\$row\.([\w]+)/g, (_: string, k: string) => {
      const v = rec[k]
      return v === null || v === undefined ? '' : String(v)
    })
  }
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined ? '' : String(value)
}

/** 外部联动入口（行点击）：注入记录渲染 KV */
function load(row: Record<string, any>) {
  record.value = row && typeof row === 'object' ? { ...row } : null
}

/** 清空详情回空态 */
function clear() {
  record.value = null
}

// 实例上报（与桌面 page-detail 对齐）：渲染器据 type 归档 detailRefs 供行点击联动
onMounted(() => emit('ready', { load, clear, record }))

defineExpose({ load, clear, record })
</script>

<template>
  <div class="mobile-detail">
    <div v-if="title" class="m-detail__title">{{ title }}</div>
    <div v-if="!record" class="m-detail__empty">暂无详情，点击列表行查看</div>
    <div v-else class="m-detail__group">
      <div v-for="col in displayColumns" :key="col.key" class="m-detail__row">
        <span class="m-detail__label">{{ col.label || col.key }}</span>
        <span class="m-detail__value">{{ displayValue(col) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-detail {
  min-height: 60px;
}
.m-detail__title {
  padding: 12px 16px 4px;
  font-size: 15px;
  font-weight: 600;
  color: #323233;
}
.m-detail__empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #969799;
}
.m-detail__group {
  margin: 8px 12px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.m-detail__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 20px;
}
.m-detail__row + .m-detail__row {
  border-top: 1px solid #f0f0f0;
}
.m-detail__label {
  flex: none;
  margin-right: 12px;
  color: #646566;
}
.m-detail__value {
  color: #323233;
  text-align: right;
  word-break: break-all;
}
</style>
