<template>
  <div ref="rootEl" class="dash-todo" :class="{ 'is-design': designMode, 'is-fullscreen': isFullscreen, 'is-fixed-height': fixedHeight, 'is-fill-height': fillHeight }" :style="layoutStyle">
    <div class="dash-todo-head">
      <span class="dash-todo-title">{{ title || emptyLabel }}</span>
      <span class="dash-todo-count">{{ total }}</span>
      <button
        v-if="!designMode"
        class="dash-fullscreen-btn"
        type="button"
        :title="isFullscreen ? '退出全屏' : '全屏'"
        :aria-label="isFullscreen ? '退出全屏' : '全屏'"
        @click.stop="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M9 4h2v6H5V8h4V4zm4 0h2v4h4v2h-6V4zM5 14h6v6H9v-4H5v-2zm10 0h4v2h-4v4h-2v-6z" />
        </svg>
      </button>
    </div>
    <div v-if="rows.length" class="dash-todo-list">
      <div v-for="row in rows" :key="row.taskId" class="dash-todo-item" @click="openTask(row)">
        <div class="dash-todo-item-main">
          <span class="dash-todo-item-title">{{ row.processName }}</span>
          <span v-if="priorityLabel(row.priority)" class="dash-todo-tag-priority" :class="{ 'is-urgent': (row.priority ?? 0) >= 100 }">
            {{ priorityLabel(row.priority) }}
          </span>
          <span v-if="row.reminded" class="dash-todo-tag-reminded">已催办</span>
        </div>
        <div class="dash-todo-item-meta">{{ metaText(row) }}</div>
      </div>
    </div>
    <div v-else class="dash-todo-empty">{{ emptyText }}</div>
  </div>
</template>

<script setup lang="ts">
/**
 * 待办清单卡：仪表盘里唯一的「过程/清单」组件——不走聚合 adapter、没有 dataSourceId，
 * 直接查工作流任务接口（待办 /v1/tasks，已办 /v1/tasks/historic）。
 *
 * 身份是硬约束：assignee / userId 一律取当前登录用户，绝不成 props 暴露到设计器配置。
 * 一旦能配身份，任何看这块仪表盘的人都能查别人的待办。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { taskApi, type TaskTodoVO } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import { upsertDashConditions, dashSpanGapStyle, dashHeightStyle, isDashFillHeight, type DashCondition } from './dash-shared'
import { useFullscreen } from '@/composables/useFullscreen'

const props = withDefaults(
  defineProps<{
    title?: string
    /** todo = 我的待办；done = 我的已办 */
    view?: 'todo' | 'done'
    /** 列表条数（接口 size） */
    limit?: number
    /** 排序：priority = 优先级降序；空 = 服务端默认（按接收时间降序） */
    orderBy?: string
    span?: number
    height?: string
    designMode?: boolean
  }>(),
  {
    title: '',
    view: 'todo',
    limit: 8,
    orderBy: 'priority',
    span: 24,
    height: '',
    designMode: false,
  },
)

const emit = defineEmits<{ (e: 'ready', instance: unknown): void }>()
const router = useRouter()
const auth = useAuthStore()
const rootEl = ref<HTMLDivElement | null>(null)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootEl)

const rows = ref<TaskTodoVO[]>([])
const total = ref(0)
const emptyText = ref('加载中…')
const conditions = ref<DashCondition[]>([])

const isDone = computed(() => props.view === 'done')
const emptyLabel = computed(() => (isDone.value ? '我的已办' : '我的待办'))

const layoutStyle = computed<Record<string, string>>(() => {
  if (isFullscreen.value) return {}
  return { ...dashSpanGapStyle(props.span), ...(dashHeightStyle(props.height) || {}) }
})
const fixedHeight = computed(() => !!dashHeightStyle(props.height))
const fillHeight = computed(() => isDashFillHeight(props.height))

function priorityLabel(priority?: number): string {
  const p = Number(priority ?? 0)
  if (p >= 100) return '加急'
  if (p >= 75) return '重要'
  return ''
}

function metaText(row: TaskTodoVO): string {
  // currentNodeName 在两个视图里语义不同：待办 = 等我办的那一步，已办 = 我办过的那一步，
  // 标签分开写才不会读成一句假话
  const nodeLabel = isDone.value ? '办理' : '节点'
  const parts = [row.initiatorName ? `发起：${row.initiatorName}` : '', row.currentNodeName ? `${nodeLabel}：${row.currentNodeName}` : '']
  const time = isDone.value ? (row as { endTime?: string }).endTime : row.createTime
  // 后端时间是 ISO 串（带 T 与时区尾巴），列表里只要「日期 时分」
  if (time) parts.push(String(time).replace('T', ' ').slice(0, 16))
  return parts.filter(Boolean).join(' · ')
}

/**
 * 广播值 → 任务接口的时间参数（`YYYY-MM-DDTHH:mm:ss`）。
 * 后端这两个接口的时间字段是 LocalDateTime，实测只认 ISO：空格分隔（筛选器/SwitchTable
 * 的 value-format 正是它）和纯日期都会 500。纯日期按区间语义补时刻——截止补到当天末尾，
 * 否则「10-01 ~ 10-08」会静默漏掉 8 号一整天。认不出的形状原样透传，让后端报错，
 * 也好过把它拼成一个假日期。
 */
function toTaskTime(value: unknown, isEnd = false): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) return raw
  const [, date, hh, mm, ss] = m
  if (!hh) return `${date}T${isEnd ? '23:59:59' : '00:00:00'}`
  return `${date}T${hh}:${mm}:${ss ?? '00'}`
}

/**
 * 广播条件 → 任务接口查询参数。
 * 接口能表达的只有「时间窗口 + 流程名」：range 一律落到当前视图的时间轴
 * （待办按创建时间、已办按办结时间），不认广播里的字段名——筛选器选的是数据源列名，
 * 而这里的时间语义是「这条任务的时间」，字段名对不上也不该因此丢条件。
 * 其余条件（状态、自定义字段等）接口无法表达，忽略而不是硬塞参数。
 */
function conditionParams(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of conditions.value) {
    if (c.op === 'range' && Array.isArray(c.value)) {
      const [start, end] = c.value as [string, string]
      if (isDone.value) {
        out.endTimeStart = toTaskTime(start)
        out.endTimeEnd = toTaskTime(end, true)
      } else {
        out.createTimeStart = toTaskTime(start)
        out.createTimeEnd = toTaskTime(end, true)
      }
      continue
    }
    if (c.column === 'processName' && (c.op === 'eq' || c.op === 'like') && c.value !== null && c.value !== undefined) {
      out.processName = String(c.value)
    }
  }
  return out
}

async function fetchTasks(): Promise<void> {
  const userId = String(auth.user?.id ?? '')
  // 身份只来自登录态；未登录不发请求（避免后端拿空 assignee 查出全量）
  if (!userId) {
    rows.value = []
    total.value = 0
    emptyText.value = '未获取到当前登录用户'
    return
  }
  const page = { page: 1, size: props.limit, ...conditionParams() }
  try {
    const res = isDone.value
      ? await taskApi.listHistoric({ userId, ...page })
      : await taskApi.listTodo({ assignee: userId, ...page, ...(props.orderBy ? { orderBy: props.orderBy } : {}) })
    rows.value = res.data?.content ?? []
    total.value = res.data?.totalElements ?? 0
    emptyText.value = rows.value.length ? '' : isDone.value ? '没有已办任务' : '没有待办任务'
  } catch (e: unknown) {
    console.warn('[dash-todo] load tasks failed:', e instanceof Error ? e.message : e)
    rows.value = []
    total.value = 0
    emptyText.value = isDone.value ? '没有已办任务' : '没有待办任务'
  }
}

function openTask(row: TaskTodoVO): void {
  if (props.designMode) return
  router.push(isDone.value ? `/process/todo/done/${row.taskId}` : `/process/todo/${row.taskId}`)
}

function setFilter(cond: Record<string, unknown>): void {
  upsertDashConditions(conditions.value, cond)
  void fetchTasks()
}

function refresh(): void {
  conditions.value = []
  void fetchTasks()
}

watch(
  () => [props.view, props.limit, props.orderBy],
  () => void fetchTasks(),
)

onMounted(() => {
  // 设计态也取数：身份固定为当前登录用户，看到的是自己的任务，无越权风险，
  // 画布上因此能预览真实列表而非空壳。
  void fetchTasks()
  emit('ready', { setFilter, refresh })
})

defineExpose({ setFilter, refresh })
</script>

<style scoped>
.dash-todo {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  min-height: 104px;
}
.dash-todo.is-fixed-height {
  overflow: hidden;
}
.dash-todo.is-design {
  outline: 1px dashed var(--el-color-primary-light-5, #a7c4ff);
}
.dash-todo.is-fullscreen {
  z-index: 3000;
  border-radius: 0;
}
.dash-todo-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dash-todo-title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  font-weight: 500;
}
.dash-todo-count {
  margin-left: 4px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  color: var(--el-color-primary, #2e73ff);
  background: var(--el-color-primary-light-9, #eef3ff);
  font-variant-numeric: tabular-nums;
}
.dash-todo-head .dash-fullscreen-btn {
  margin-left: auto;
}
.dash-fullscreen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary, #909399);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
  flex: none;
}
.dash-todo:hover .dash-fullscreen-btn,
.dash-todo.is-fullscreen .dash-fullscreen-btn {
  opacity: 1;
}
.dash-fullscreen-btn:hover {
  background: var(--el-fill-color, #f0f2f5);
  color: var(--el-color-primary, #2e73ff);
}
.dash-todo-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
}
.dash-todo-item {
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.dash-todo-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
.dash-todo-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dash-todo-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-todo-tag-priority,
.dash-todo-tag-reminded {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 17px;
  color: var(--el-color-warning, #e6a23c);
  background: var(--el-color-warning-light-9, #fdf6ec);
}
.dash-todo-tag-priority.is-urgent {
  color: var(--el-color-danger, #f43f5e);
  background: var(--el-color-danger-light-9, #fef0f3);
}
.dash-todo-tag-reminded {
  color: var(--el-color-info, #909399);
  background: var(--el-fill-color, #f0f2f5);
}
.dash-todo-item-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-todo-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder, #c0c4cc);
}
</style>
