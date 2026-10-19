<template>
  <div class="stat-card" :class="`trend-${trend}`">
    <div class="hd">
      <span class="title">{{ title || '未命名指标' }}</span>
      <el-tag size="small" :type="trend === 'down' ? 'danger' : 'success'">{{ trend === 'down' ? '↓' : '↑' }}</el-tag>
    </div>
    <div class="value">
      {{ value }}<span class="unit">{{ unit }}</span>
    </div>
    <div v-if="showRemark" class="remark">{{ remark }}</div>
    <div class="accent" :style="{ background: accent }">强调色：{{ accent }}</div>
    <div class="foot">
      <span class="tag">material:stat-card</span>
      <span v-if="autoRefresh" class="tick">自动刷新 {{ refreshInterval }}s · 已刷新 {{ ticks }} 次</span>
      <span v-else class="tick">自动刷新已关闭</span>
    </div>
  </div>
</template>

<script setup>
// 组件型物料示例（change: remote-materials 二期）：全部展示内容都来自宿主属性面板写入的
// rule.props，用于端到端验证 manifest.meta → 面板控件 → rule.props → 组件 props 这条链路。
// 组件名/依赖约定与页面型物料一致：宿主依赖保持裸导入（external），element-plus 组件用全局注册名。
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  value: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  trend: { type: String, default: 'up' },
  refreshInterval: { type: Number, default: 30 },
  autoRefresh: { type: Boolean, default: false },
  remark: { type: String, default: '' },
  accent: { type: String, default: '#2E73FF' },
})

const ticks = ref(0)
let timer = null
if (props.autoRefresh && props.refreshInterval > 0) {
  timer = setInterval(() => (ticks.value += 1), props.refreshInterval * 1000)
}
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<style scoped>
.stat-card {
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 8px;
  background: var(--el-bg-color, #fff);
  min-width: 180px;
}
.hd {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.value {
  margin: 6px 0 4px;
  font-size: 26px;
  font-weight: 600;
  color: var(--el-color-primary, #2e73ff);
}
.trend-down .value {
  color: var(--el-color-danger, #f56c6c);
}
.unit {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 400;
  color: var(--el-text-color-secondary, #909399);
}
.remark {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.accent {
  margin-top: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #fff;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder, #a8abb2);
}
</style>
