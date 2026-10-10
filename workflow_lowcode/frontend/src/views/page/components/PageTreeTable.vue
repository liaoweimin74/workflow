<template>
  <!-- 根包裹无定位（static），与 PageDataTable 同族；stretch=true 时撑满父容器高度 -->
  <div class="page-tree-table" :class="{ 'stretch-fill': stretch }">
    <el-table
      ref="tableRef"
      v-loading="loading"
      class="page-tree-table-el"
      :data="treeRows"
      :row-key="resolvedRowKey"
      :tree-props="TREE_PROPS"
      :default-expand-all="defaultExpandAll"
      :height="tableHeight"
      :border="border"
      @row-click="handleRowClick"
    >
      <el-table-column
        v-for="col in resolvedColumns"
        :key="String(col.key ?? col.prop ?? col.label)"
        :prop="String(col.key ?? col.prop ?? '')"
        :label="String(col.label ?? col.prop ?? '')"
        :width="col.width"
        :min-width="col.minWidth"
        :align="col.align"
        :fixed="col.fixed"
        :formatter="typeof col.formatter === 'function' ? col.formatter : undefined"
        :show-overflow-tooltip="col.showOverflowTooltip !== false"
      />
      <template #empty>
        <el-empty :image-size="60" description="暂无数据" />
      </template>
    </el-table>
  </div>
</template>

<script setup lang="ts">
/**
 * 树表格 PageTreeTable（Task 3-h）——只读树形数据展示。
 *
 * 【取数模式】对齐 PageDataTable：pageKey / dataSourceId / dsRefId / designMode / loading；
 *   resolvedRefId = props.dsRefId || activeDsBindings 按 dataSourceId 反查（绑定就绪后补发恰一次）。
 *   查询参数：运行态 { size: -1 }（树需全量，不承诺分页）；设计态 { page:1, size:10 } 预览。
 *   响应映射与 PageDataTable 完全一致：records → { ...r.data, id: r.id, version: r.version }。
 *
 * 【组树】后端列表接口大概率平铺（不保证树形）：客户端按 parentKey→idKey 组装 children
 *   （treeTableShared.buildTreeRows：孤儿挂根 / 环引用断链挂根 / 空 children 剔除），
 *   el-table 以 row-key + :tree-props="{ children: 'children' }" 渲染树。
 *
 * 【边界】只读展示组件（Task 3-h）：不承诺操作列 / 分页 / 批量 / 表头筛选 / Excel 导入导出 /
 *   单元格组件渲染——这些是 PageDataTable（SearchTable）能力；需要写操作时请用 page-table。
 *   行点击/实例上报（ready → setFilter/refresh）按动作总线约定预留，供左树右表联动接线。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import type { DataSourceBindingContext } from '@/components/business/types'
import { buildTreeRows } from './treeTableShared'

/** el-table 树形字段约定：children 数组字段名固定为 children（与组树函数输出一致） */
const TREE_PROPS = { children: 'children' }

const props = withDefaults(
  defineProps<{
    /** 页面 key（运行态由 PageRendererPage 注入；缺省时不取数） */
    pageKey?: string
    /** 页面内数据源绑定 id（schema.dataSources[].id） */
    dataSourceId?: string
    /** 全局数据源 refId（由 PageRendererPage.transformComponent 注入） */
    dsRefId?: string
    /** 列配置（page-table 同形态：{ key, label, width, minWidth, align, fixed, formatter, showOverflowTooltip }） */
    columns?: any[]
    /** 节点唯一键字段名（默认 'id'；平铺组树的父引用命中键） */
    idKey?: string
    /** 父引用字段名（默认 'parentId'；值为空或命不中 → 根节点） */
    parentKey?: string
    /** el-table row-key（缺省取 idKey） */
    rowKey?: string
    /** 表格高度（纯数字补 px 语义同 el-table；stretch=true 时缺省 100%） */
    height?: string | number
    /** 边框 */
    border?: boolean
    /** 是否占满父容器高度（表格区域内部滚动） */
    stretch?: boolean
    /** 设计态标记：取数固定首页 10 条（对齐 PageDataTable 预览口径） */
    designMode?: boolean
    /** 全部展开（缺省 false） */
    defaultExpandAll?: boolean
    /** 默认展开第一层（缺省 true；defaultExpandAll=true 时忽略本项） */
    expandFirstLevel?: boolean
    /** 结构化筛选 JSON 字符串（{logic,conditions}），原样透传 query.filter */
    filter?: string | null
    /** 附加属性（stripe/size 等，透传 el-table） */
    [key: string]: any
  }>(),
  {
    pageKey: '',
    dataSourceId: '',
    dsRefId: '',
    columns: () => [],
    idKey: 'id',
    parentKey: 'parentId',
    rowKey: '',
    height: '',
    border: false,
    stretch: false,
    designMode: false,
    defaultExpandAll: false,
    expandFirstLevel: true,
    filter: null,
  },
)

const emit = defineEmits<{
  (e: 'row-click', row: any): void
  (e: 'loaded', rows: any[]): void
  (e: 'ready', instance: any): void
}>()

const tableRef = ref<any>(null)
const loading = ref(false)
/** 平铺原始行（组树前，供外部调试/导出读取） */
const flatRows = ref<any[]>([])
/** 组件级追加条件（动作总线 set-filter 注入，等值语义） */
const extraEqConditions = ref<Record<string, unknown>>({})

const resolvedRowKey = computed(() => props.rowKey || props.idKey)

const resolvedColumns = computed<any[]>(() => {
  const cols = props.columns || []
  return cols.filter((c) => c && (c.key ?? c.prop))
})

/** 运行时优先 dsRefId（渲染器注入）；设计器画布回退模块级绑定存储（dataSourceId → refId） */
const resolvedRefId = computed(() => {
  if (props.dsRefId) return props.dsRefId
  if (props.dataSourceId) {
    const binding = activeDsBindings.value.find((b: DataSourceBindingContext) => b.id === props.dataSourceId)
    if (binding?.refId) return binding.refId
  }
  return ''
})

/** 平铺 → 树（孤儿挂根 / 环防护在纯函数层） */
const treeRows = computed<any[]>(() => buildTreeRows(flatRows.value, { idKey: props.idKey, parentKey: props.parentKey }))

const tableHeight = computed<string | number | undefined>(() => {
  if (props.height !== undefined && props.height !== null && props.height !== '') return props.height
  if (props.stretch) return '100%'
  return undefined
})

/** 首次数据请求单次触发：挂载时 refId 未就绪则等绑定存储就绪后补发恰一次（对齐 PageDataTable） */
let pendingFirstFetch = false
let bindingsStop: (() => void) | null = null

async function fetchData(): Promise<void> {
  const dsId = resolvedRefId.value
  if (!dsId) {
    flatRows.value = []
    return
  }
  loading.value = true
  try {
    const query: Record<string, any> = props.designMode
      ? // 设计态预览固定取首页且最多 10 条（避免全量拉取）
        { page: 1, size: 10 }
      : // 运行态：树需全量（后端 size<=0 跳过 LIMIT），只读组件不分页
        { size: -1 }
    // 组件级结构化 filter（props.filter）与 set-filter 等值条件 AND 合并（统一 conditions 数组）
    let baseConds: any[] = []
    if (props.filter) {
      try {
        const parsed = JSON.parse(props.filter)
        if (parsed && Array.isArray(parsed.conditions)) baseConds = parsed.conditions
      } catch {
        // 非法 filter 原样透传（后端容错）
        query.filter = props.filter
      }
    }
    const eqConds = Object.entries(extraEqConditions.value)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([column, value]) => ({ column, op: 'eq', value }))
    const allConds = [...baseConds, ...eqConds]
    if (allConds.length > 0) {
      query.filter = JSON.stringify({ logic: 'AND', conditions: allConds })
    }
    const res: any = await dataSourceApi.queryData(dsId, query)
    const records = res?.data?.records || []
    // 映射口径与 PageDataTable 完全一致（data 展开 + 记录 id/version 提升到行上）
    flatRows.value = records.map((r: any) => ({ ...(r.data || {}), id: r.id, version: r.version }))
    emit('loaded', flatRows.value)
    await nextTick()
    expandFirstLevelIfNeeded()
  } catch (e: unknown) {
    // 静默降级：只读组件取数失败不弹错误，保留空态（控制台可见）
    console.warn('[page-tree-table] queryData failed:', e instanceof Error ? e.message : e)
    flatRows.value = []
  } finally {
    loading.value = false
  }
}

/** 默认展开第一层：对根节点逐个 toggleRowExpansion（default-expand-all 已开则无必要） */
function expandFirstLevelIfNeeded(): void {
  if (props.defaultExpandAll || props.expandFirstLevel === false) return
  const t = tableRef.value
  if (!t || typeof t.toggleRowExpansion !== 'function') return
  for (const root of treeRows.value) {
    try {
      t.toggleRowExpansion(root, true)
    } catch {
      // 行对象不在表格 store（如数据刚被替换）时忽略
    }
  }
}

/** 动作总线 set-filter：等值条件合并后重查（供树表格联动：tree node-click → table.setFilter({parentId})） */
function setFilter(cond: Record<string, unknown>): void {
  for (const [column, value] of Object.entries(cond)) {
    if (value === null || value === undefined) delete extraEqConditions.value[column]
    else extraEqConditions.value[column] = value
  }
  void fetchData()
}

function refresh(): void {
  extraEqConditions.value = {}
  void fetchData()
}

function handleRowClick(row: any): void {
  emit('row-click', row)
}

defineExpose({ fetchData, refresh, setFilter, loading, treeRows, flatRows })

watch(
  () => [props.dsRefId, props.dataSourceId, props.idKey, props.parentKey, props.filter],
  () => void fetchData(),
)

onMounted(() => {
  if (!resolvedRefId.value) {
    pendingFirstFetch = true
    bindingsStop = watch(activeDsBindings, () => {
      if (pendingFirstFetch && resolvedRefId.value) {
        pendingFirstFetch = false
        void fetchData()
      }
    })
  } else {
    void fetchData()
  }
  emit('ready', { fetchData, refresh, setFilter })
})

onBeforeUnmount(() => {
  bindingsStop?.()
})
</script>

<style scoped>
.page-tree-table {
  width: 100%;
}
/* 撑满父容器（stretch）：高度由 PageRendererPage 的 has-stretch 布局链传递，表格区域内部滚动 */
.page-tree-table.stretch-fill {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page-tree-table.stretch-fill .page-tree-table-el {
  flex: 1;
  min-height: 0;
}
</style>
