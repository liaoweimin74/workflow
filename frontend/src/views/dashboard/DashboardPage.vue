<template>
  <div class="dashboard-page">
    <!-- 欢迎横幅（品牌变量驱动，四态自适应：青墨/经典 × 亮/暗） -->
    <div class="bg-gradient-to-r from-[rgb(var(--brand-rgb)/0.06)] to-[rgb(var(--brand-bright-rgb)/0.04)] rounded-xl border border-[var(--el-border-color)] p-6 mb-4 flex items-center justify-between relative overflow-hidden">
      <div class="relative z-10">
        <h1 class="text-2xl font-bold text-(--brand) dark:text-(--brand-soft) mb-1">安全作业 · 工作流总览</h1>
        <p class="text-sm text-gray-400 dark:text-gray-500">石化工厂 · 安全作业管理平台</p>
      </div>
      <!-- 品牌色装饰波形/圆（内联 SVG，无第三方库） -->
      <svg class="w-40 h-24 shrink-0 opacity-80" viewBox="0 0 160 96" fill="none" aria-hidden="true">
        <circle cx="128" cy="24" r="18" class="fill-[rgb(var(--brand-bright-rgb)/0.25)]" opacity="0.6" />
        <circle cx="32" cy="72" r="30" class="fill-[rgb(var(--brand-rgb)/0.12)]" opacity="0.5" />
        <path d="M0 72 Q 30 56 60 66 T 120 60 T 160 64" class="stroke-(--brand-bright)" stroke-width="3" stroke-linecap="round" opacity="0.7" />
        <path d="M0 84 Q 30 72 60 80 T 120 74 T 160 78" class="stroke-(--brand)" stroke-width="2" stroke-linecap="round" opacity="0.35" />
      </svg>
    </div>

    <!-- 概览卡片（数据占位） -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="w-10 h-10 rounded-lg bg-[rgb(var(--brand-rgb)/0.1)] text-(--brand) dark:text-(--brand-soft) flex items-center justify-center mb-3">
          <el-icon :size="18"><Tickets /></el-icon>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">今日待作业</div>
        <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">--</div>
      </div>
      <div class="bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="w-10 h-10 rounded-lg bg-[rgb(var(--brand-bright-rgb)/0.12)] text-[var(--brand-bright)] flex items-center justify-center mb-3">
          <el-icon :size="18"><CircleCheck /></el-icon>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">已完成</div>
        <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">--</div>
      </div>
      <div class="bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="w-10 h-10 rounded-lg bg-safety-50 text-safety-500 dark:bg-[rgb(245_158_11/0.14)] dark:text-safety-500 flex items-center justify-center mb-3">
          <el-icon :size="18"><Warning /></el-icon>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">高风险提醒</div>
        <div class="text-2xl font-bold text-safety-500">--</div>
      </div>
      <div class="bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-(--brand) to-(--brand-bright) text-white flex items-center justify-center mb-3">
          <el-icon :size="18"><Monitor /></el-icon>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">设备总数</div>
        <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">--</div>
      </div>
    </div>

    <!-- 装饰图表区（内联 SVG，无第三方库；渐变/描边随风格变量） -->
    <div class="grid grid-cols-3 gap-4">
      <!-- 柱状趋势 -->
      <div class="col-span-2 bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4">作业趋势</div>
        <svg class="w-full h-28" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" class="[stop-color:var(--brand-soft)]" />
              <stop offset="100%" class="[stop-color:var(--brand-mid)]" />
            </linearGradient>
          </defs>
          <rect x="15" y="78" width="18" height="42" rx="4" fill="url(#trendGrad)" opacity="0.55" />
          <rect x="43" y="52" width="18" height="68" rx="4" fill="url(#trendGrad)" opacity="0.7" />
          <rect x="71" y="64" width="18" height="56" rx="4" fill="url(#trendGrad)" opacity="0.6" />
          <rect x="99" y="38" width="18" height="82" rx="4" fill="url(#trendGrad)" opacity="0.85" />
          <rect x="127" y="56" width="18" height="64" rx="4" fill="url(#trendGrad)" opacity="0.65" />
          <rect x="155" y="28" width="18" height="92" rx="4" fill="url(#trendGrad)" />
          <rect x="183" y="46" width="18" height="74" rx="4" fill="url(#trendGrad)" opacity="0.75" />
          <rect x="211" y="34" width="18" height="86" rx="4" fill="url(#trendGrad)" opacity="0.9" />
          <rect x="239" y="62" width="18" height="58" rx="4" fill="url(#trendGrad)" opacity="0.6" />
          <rect x="267" y="44" width="18" height="76" rx="4" fill="url(#trendGrad)" opacity="0.8" />
        </svg>
      </div>
      <!-- 环形占比 -->
      <div class="bg-[var(--el-bg-color)] rounded-xl border border-[var(--el-border-color)] p-5 shadow-[0_1px_3px_rgb(var(--brand-rgb)/0.06)] dark:shadow-none">
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4">作业类型占比</div>
        <div class="flex items-center justify-center py-2">
          <svg class="w-32 h-32" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="46" fill="none" class="stroke-[rgb(var(--brand-rgb)/0.08)]" stroke-width="14" />
            <circle cx="60" cy="60" r="46" fill="none" class="stroke-(--brand-mid)" stroke-width="14" stroke-linecap="round" stroke-dasharray="206 283" transform="rotate(-90 60 60)" />
            <circle cx="60" cy="60" r="46" fill="none" class="stroke-(--brand-bright)" stroke-width="14" stroke-linecap="round" stroke-dasharray="48 283" stroke-dashoffset="-206" transform="rotate(-90 60 60)" opacity="0.85" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Tickets, CircleCheck, Warning, Monitor } from '@element-plus/icons-vue'

defineOptions({ name: 'Dashboard' })
</script>
