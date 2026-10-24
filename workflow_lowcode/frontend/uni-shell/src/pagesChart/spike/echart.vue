<template>
  <view class="lc-spike">
    <text class="lc-spike__title">Task 7.1 spike：Uni ECharts 双端渲染验证</text>
    <view class="lc-spike__chart">
      <uni-echarts custom-style="width: 100%; height: 240px" :option="barOption" />
    </view>
    <view class="lc-spike__chart">
      <uni-echarts custom-style="width: 100%; height: 240px" :option="pieOption" />
    </view>
  </view>
</template>

<script setup lang="ts">
// spike 载体：按需注册沿用 web 端 useEcharts.ts 清单（Bar/Line/Pie + Grid/Tooltip/Legend
// + CanvasRenderer；scatter/heatmap/funnel/title/visualMap 是 dashboard 面清单，图表页
// 出码首版不需要）。option 形状即 7.3 出码要产出的形状（buildChartDataset 语义聚合）。
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ref } from 'vue'
import UniEcharts from 'uni-echarts'

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const barOption = ref({
  tooltip: { trigger: 'axis' },
  legend: {},
  grid: { left: 40, right: 16, top: 32, bottom: 28 },
  xAxis: { type: 'category', data: ['研发', '市场', '交付'] },
  yAxis: { type: 'value' },
  series: [
    { type: 'bar', name: '金额', data: [120, 200, 150] },
    { type: 'line', name: '数量', data: [30, 42, 25] },
  ],
})

const pieOption = ref({
  tooltip: { trigger: 'item' },
  series: [
    {
      type: 'pie',
      radius: ['30%', '52%'],
      data: [
        { name: '已发货', value: 1048 },
        { name: '待发货', value: 735 },
        { name: '已取消', value: 210 },
      ],
    },
  ],
})
</script>

<style scoped>
.lc-spike {
  padding: 24rpx;
}
.lc-spike__title {
  font-size: 28rpx;
  color: #303133;
}
.lc-spike__chart {
  margin-top: 16rpx;
}
</style>
