<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 衣服（T恤）图标：领口 + 衣身，随 currentColor 取色以适配四态风格 -->
    <path
      d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"
    />
  </svg>
</template>

<script setup lang="ts">
// 自定义「衣服」图标：@element-plus/icons-vue 没有服装类图标，
// 这里用内联 SVG（currentColor 描边）实现，可直接放进 <el-icon> 里缩放取色。
defineOptions({ name: 'ShirtIcon' })
</script>
