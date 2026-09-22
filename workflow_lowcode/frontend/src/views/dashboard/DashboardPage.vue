<template>
  <div class="dashboard-page">
    <!-- 欢迎横幅 -->
    <div class="bg-gradient-to-r from-(--wash-from) to-(--wash-to) dark:from-[#181d1b] dark:to-[#1f2522] rounded-xl border border-[#e6e9e4] dark:border-[#2b332e] p-6 mb-4 flex items-center justify-between relative overflow-hidden">
      <div class="relative z-10">
        <h1 class="text-2xl font-bold text-(--brand) dark:text-(--brand-soft) mb-1">安全作业 · 工作流总览</h1>
        <p class="text-sm text-gray-400 dark:text-gray-500">石化工厂 · 安全作业管理平台</p>
      </div>
      <!-- 青色装饰波形/圆（内联 SVG，无第三方库） -->
      <svg class="w-40 h-24 shrink-0 opacity-80" viewBox="0 0 160 96" fill="none" aria-hidden="true">
        <circle cx="128" cy="24" r="18" class="fill-(--color-accent-100)" opacity="0.6" />
        <circle cx="32" cy="72" r="30" class="fill-(--brand-tint)" opacity="0.5" />
        <path d="M0 72 Q 30 56 60 66 T 120 60 T 160 64" class="stroke-(--brand-bright)" stroke-width="3" stroke-linecap="round" opacity="0.7" />
        <path d="M0 84 Q 30 72 60 80 T 120 74 T 160 78" class="stroke-(--brand)" stroke-width="2" stroke-linecap="round" opacity="0.35" />
      </svg>
    </div>

    <!-- 概览卡片（真实统计数据） -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div
        v-for="card in kpiCards"
        :key="card.label"
        class="bg-white dark:bg-[#181d1b] rounded-xl border border-[#e6e9e4] dark:border-[#2b332e] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none transition-shadow hover:shadow-[0_4px_12px_rgb(var(--brand-rgb)/0.12)] cursor-default"
      >
        <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-3" :class="card.iconBoxClass">
          <el-icon :size="18"><component :is="card.icon" /></el-icon>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">{{ card.label }}</div>
        <div v-if="loading" class="h-8 w-12 rounded bg-gray-100 dark:bg-[#2b332e] animate-pulse" />
        <div v-else class="text-2xl font-bold tabular-nums" :class="card.valueClass">
          {{ formatCount(card.value) }}
        </div>
      </div>
    </div>

    <!-- 图表区（数据驱动 SVG，无第三方库） -->
    <div class="grid grid-cols-3 gap-4">
      <!-- 近 7 日发起流程趋势 -->
      <div class="col-span-2 bg-white dark:bg-[#181d1b] rounded-xl border border-[#e6e9e4] dark:border-[#2b332e] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="flex items-center justify-between mb-4">
          <div class="text-sm font-medium text-gray-600 dark:text-gray-300">近 7 日发起流程趋势</div>
          <div v-if="!loading" class="text-xs text-gray-400">合计 {{ trendTotal }} 次</div>
        </div>
        <div v-if="loading" class="h-28 rounded bg-gray-50 dark:bg-[#1f2522] animate-pulse" />
        <template v-else>
          <div class="relative">
            <svg class="w-full h-28" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" class="[stop-color:var(--color-accent-400)]" />
                  <stop offset="100%" class="[stop-color:var(--color-accent-500)]" />
                </linearGradient>
              </defs>
              <rect
                v-for="(bar, i) in trendBars"
                :key="i"
                :x="bar.x"
                :y="bar.y"
                :width="bar.width"
                :height="bar.height"
                rx="4"
                :fill="bar.max ? 'url(#trendGrad)' : 'url(#trendGrad)'"
                :opacity="bar.opacity"
                class="transition-all duration-500"
              >
                <title>{{ trend[i]?.date }}：{{ trend[i]?.count }} 次</title>
              </rect>
            </svg>
            <!-- 空态 -->
            <div
              v-if="trendTotal === 0"
              class="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500"
            >
              近 7 日暂无流程发起记录
            </div>
          </div>
          <!-- 横轴日期（与柱子同栅格对齐） -->
          <div class="grid grid-cols-7 mt-2">
            <span
              v-for="point in trend"
              :key="point.date"
              class="text-[10px] text-gray-400 dark:text-gray-500 text-center"
            >{{ point.date }}</span>
          </div>
        </template>
      </div>

      <!-- 流程状态占比 -->
      <div class="bg-white dark:bg-[#181d1b] rounded-xl border border-[#e6e9e4] dark:border-[#2b332e] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4">流程状态占比</div>
        <div v-if="loading" class="flex items-center justify-center py-2">
          <div class="w-32 h-32 rounded-full bg-gray-50 dark:bg-[#1f2522] animate-pulse" />
        </div>
        <template v-else>
          <div class="flex items-center justify-center py-2 relative">
            <svg class="w-32 h-32" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="46" fill="none" stroke="#f0f2ee" stroke-width="14" class="dark:stroke-[#2b332e]" />
              <!-- 已完成段（青色） -->
              <circle
                v-if="shareFinished > 0"
                cx="60" cy="60" r="46" fill="none"
                stroke-width="14" stroke-linecap="round"
                :stroke-dasharray="`${finishedArc} ${donutCircumference - finishedArc}`"
                transform="rotate(-90 60 60)"
                class="stroke-(--brand-bright) transition-all duration-500"
              />
              <!-- 进行中段（主题色） -->
              <circle
                v-if="shareRunning > 0"
                cx="60" cy="60" r="46" fill="none"
                stroke-width="14" stroke-linecap="round"
                :stroke-dasharray="`${runningArc} ${donutCircumference - runningArc}`"
                :stroke-dashoffset="`-${finishedArc}`"
                transform="rotate(-90 60 60)"
                opacity="0.85"
                class="stroke-(--brand) transition-all duration-500"
              />
            </svg>
            <!-- 中心总数 -->
            <div v-if="shareTotal > 0" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div class="text-xl font-bold text-gray-700 dark:text-gray-200 tabular-nums">{{ shareTotal }}</div>
              <div class="text-[10px] text-gray-400">流程实例</div>
            </div>
            <div v-else class="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none">
              暂无数据
            </div>
          </div>
          <!-- 图例 -->
          <div class="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-(--brand)" /> 进行中 {{ shareRunning }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-(--brand-bright)" /> 已完成 {{ shareFinished }}
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Tickets, CircleCheck, Timer, FolderOpened } from '@element-plus/icons-vue'
import { fetchDashboardStats, type DashboardStats } from '@/api/dashboard'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'Dashboard' })

const authStore = useAuthStore()

const loading = ref(true)
const stats = ref<DashboardStats | null>(null)

/** KPI 卡片定义（视觉沿用原有配色语言） */
const kpiCards = computed(() => [
  {
    label: '我的待办任务',
    value: stats.value?.todoCount ?? 0,
    icon: Tickets,
    iconBoxClass: 'bg-(--brand-tint) text-(--brand) dark:bg-[#2b332e] dark:text-(--brand-soft)',
    valueClass: 'text-gray-800 dark:text-gray-100'
  },
  {
    label: '我的已办任务',
    value: stats.value?.doneCount ?? 0,
    icon: CircleCheck,
    iconBoxClass: 'bg-(--color-accent-100) text-accent-600 dark:bg-[#2b332e] dark:text-(--brand-glow)',
    valueClass: 'text-gray-800 dark:text-gray-100'
  },
  {
    label: '进行中流程',
    value: stats.value?.runningCount ?? 0,
    icon: Timer,
    iconBoxClass: 'bg-safety-50 text-safety-500 dark:bg-[#2b332e] dark:text-safety-500',
    valueClass: 'text-safety-500'
  },
  {
    label: '已部署流程定义',
    value: stats.value?.definitionCount ?? 0,
    icon: FolderOpened,
    iconBoxClass: 'bg-gradient-to-br from-(--brand) to-(--brand-bright) text-white',
    valueClass: 'text-gray-800 dark:text-gray-100'
  }
])

const trend = computed(() => stats.value?.trend ?? [])
const trendTotal = computed(() => trend.value.reduce((sum, p) => sum + (p.count || 0), 0))

/** 柱状图几何计算：300×120 视窗，7 根柱均分宽度，柱子居中于每份（与下方日期栅格对齐） */
const trendBars = computed(() => {
  const points = trend.value
  if (!points.length) return []
  const max = Math.max(...points.map((p) => p.count), 1)
  const slot = 300 / points.length
  const barWidth = 18
  return points.map((p, i) => {
    const x = i * slot + (slot - barWidth) / 2
    const maxHeight = 92
    const height = p.count > 0 ? Math.max((p.count / max) * maxHeight, 10) : 4
    const y = 120 - height
    const isMax = p.count > 0 && p.count === max
    return { x, y, width: barWidth, height, opacity: p.count === 0 ? 0.25 : isMax ? 1 : 0.55 + 0.3 * (p.count / max) }
  })
})

const shareRunning = computed(() => stats.value?.statusShare?.running ?? 0)
const shareFinished = computed(() => stats.value?.statusShare?.finished ?? 0)
const shareTotal = computed(() => shareRunning.value + shareFinished.value)

/** 环形图：r=46 周长 ≈ 289.03 */
const donutCircumference = 2 * Math.PI * 46
const finishedArc = computed(() =>
  shareTotal.value === 0 ? 0 : (shareFinished.value / shareTotal.value) * donutCircumference
)
const runningArc = computed(() =>
  shareTotal.value === 0 ? 0 : (shareRunning.value / shareTotal.value) * donutCircumference
)

function formatCount(n?: number): string {
  return n == null ? '--' : String(n)
}

async function loadStats() {
  loading.value = true
  try {
    const res = await fetchDashboardStats(authStore.user?.id)
    if (res.code === 200) {
      stats.value = res.data
    }
  } catch {
    // 统计加载失败时保持占位显示，不阻塞首页
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>
