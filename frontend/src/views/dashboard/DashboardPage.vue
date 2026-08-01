<template>
  <div class="dashboard-page">
    <!-- 欢迎横幅 -->
    <div class="bg-white rounded-xl border border-gray-100 p-6 mb-4">
      <h1 class="text-xl font-semibold text-gray-800 mb-1">欢迎使用工作流管理系统</h1>
      <p class="text-sm text-gray-400">石化工厂 · 安全作业管理平台</p>
    </div>

    <!-- 概览卡片 -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="text-xs text-gray-400 mb-2">今日待作业</div>
        <div class="text-2xl font-bold text-gray-800">--</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="text-xs text-gray-400 mb-2">已完成</div>
        <div class="text-2xl font-bold text-gray-800">--</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="text-xs text-gray-400 mb-2">高风险提醒</div>
        <div class="text-2xl font-bold text-safety-500">--</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-5">
        <div class="text-xs text-gray-400 mb-2">设备总数</div>
        <div class="text-2xl font-bold text-gray-800">--</div>
      </div>
    </div>
  </div>
</template>