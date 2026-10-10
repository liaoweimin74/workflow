<template>
  <!-- PAGE 轨「写闭环」KV 详情（Task 3-f）：el-descriptions 渲染外部注入的记录（主会话把列表行点击动作接到 expose load(record)）。
       纯展示组件：不自行取数（record 经 load/clear 维护）；columns 缺省时回退记录自身键生成 KV（剔除 <key>_text 内部显示列）；
       formatter 支持函数 (value, record) => string 与 '$row.x' 模板串两种形态。 -->
  <div class="page-data-detail">
    <div v-if="title" class="page-data-detail-title">{{ title }}</div>

    <el-empty v-if="!record" class="page-data-detail-empty" description="请在上方列表点击行查看详情" />

    <el-descriptions v-else class="page-data-detail-body" :column="1" border>
      <el-descriptions-item v-for="col in displayColumns" :key="col.key" :label="col.label || col.key">
        {{ displayValue(col) }}
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

/** KV 列配置：formatter 可选函数 (value, record) => string 或 '$row.x' 模板串（$row.字段 → 记录值） */
interface DetailColumn {
  key: string
  label?: string
  formatter?: ((value: any, record: Record<string, any>) => unknown) | string
}

const props = withDefaults(defineProps<{
  /** 页面 key（上下文一致性；预留动作脚本 api 透传用） */
  pageKey?: string
  /** 页面内数据源绑定 id（上下文一致性；记录来源由 load(record) 注入） */
  dataSourceId?: string
  /** 全局数据源 refId（PageRendererPage.transformComponent 注入；预留） */
  dsRefId?: string
  /** KV 列配置（缺省回退记录自身键，剔除 <key>_text 内部显示列） */
  columns?: DetailColumn[]
  /** 标题（缺省不渲染标题行） */
  title?: string
  /** 设计态标记：画布内保持空态（记录经 load() 注入后渲染） */
  designMode?: boolean
  /** 附加属性（容器透传兼容） */
  [key: string]: any
}>(), {
  columns: () => [],
})

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

/** 单元格显示值：函数 formatter(value, record) → 模板串 $row.x 替换 → 数组 join(', ') → String */
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

/** 外部联动入口（主会话接到列表行点击动作总线）：注入记录渲染 KV */
function load(row: Record<string, any>) {
  record.value = row && typeof row === 'object' ? { ...row } : null
}

/** 清空详情回空态 */
function clear() {
  record.value = null
}

defineExpose({
  /** 注入记录（行点击联动） */
  load,
  /** 清空回空态 */
  clear,
  /** 当前记录（只读快照，ref 经 expose 自动解包） */
  record,
})
</script>

<style scoped>
.page-data-detail {
  width: 100%;
  min-width: 0;
}
.page-data-detail-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
.page-data-detail-body {
  width: 100%;
}
</style>
