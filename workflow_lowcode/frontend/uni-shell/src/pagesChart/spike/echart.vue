<template>
  <view class="lc-spike">
    <text class="lc-spike__title">Task 7.1/7.2 spike：Uni ECharts + dash 自绘卡</text>
    <view class="lc-spike__chart">
      <uni-echarts custom-style="width: 100%; height: 240px" :option="barOption" />
    </view>
    <!-- 7.3 dash-chart 片段形状（.lc-dchart）：uni-echarts v-if option + 空态（emit 形状同构） -->
    <view class="lc-dchart">
      <text class="lc-dchart__title">发起趋势</text>
      <uni-echarts v-if="chartAOption" custom-style="width: 100%; height: 480rpx" :option="chartAOption" />
      <text v-else class="lc-dchart__empty">{{ chartALoading ? '加载中…' : '暂无数据' }}</text>
    </view>
    <!-- 7.2 dash-kpi 片段形状（.lc-kpi）：value 唯一运行期绑定 + null 占位 -->
    <view class="lc-kpi">
      <view class="lc-kpi__head">
        <text class="lc-kpi__title">发货金额</text>
      </view>
      <text class="lc-kpi__subtitle">近 30 天</text>
      <view class="lc-kpi__value-row">
        <text v-if="kpiAValue === null" class="lc-kpi__value">--</text>
        <text v-else class="lc-kpi__value">{{ kpiAValue ?? '--' }}</text>
        <text v-if="kpiAUnit" class="lc-kpi__unit">{{ kpiAUnit }}</text>
      </view>
    </view>
    <!-- 7.2 dash-notice 片段形状（.lc-notice list 形态） -->
    <view class="lc-notice">
      <view class="lc-notice__head">
        <text class="lc-notice__title">公告</text>
        <text v-if="noticeATotal" class="lc-notice__count">{{ noticeATotal }}</text>
      </view>
      <view v-if="noticeARows.length" class="lc-notice__list">
        <view v-for="row in noticeARows" :key="row.id" class="lc-notice__item">
          <view class="lc-notice__item-line">
            <text class="lc-notice__item-title">{{ row.title }}</text>
            <text v-if="row.readStatus !== 'SENT'" class="lc-notice__tag">未读</text>
          </view>
          <text class="lc-notice__item-meta">{{ String(row.createdAt ?? '').replace('T', ' ').slice(0, 16) }}</text>
        </view>
      </view>
      <text v-else class="lc-notice__empty">{{ noticeALoading ? '加载中…' : '暂无公告' }}</text>
    </view>
    <!-- 7.2 dash-todo 片段形状（.lc-todo）：meta 行含模板字面量嵌套（mp-weixin 编译端验证点） -->
    <view class="lc-todo">
      <view class="lc-todo__head">
        <text class="lc-todo__title">我的待办</text>
        <text v-if="todoATotal" class="lc-todo__count">{{ todoATotal }}</text>
      </view>
      <view v-if="todoARows.length" class="lc-todo__list">
        <view v-for="row in todoARows" :key="row.taskId" class="lc-todo__item">
          <view class="lc-todo__item-main">
            <text class="lc-todo__item-title">{{ row.processName }}</text>
            <text v-if="(row.priority ?? 0) >= 100" class="lc-todo__tag lc-todo__tag--urgent">加急</text>
            <text v-else-if="(row.priority ?? 0) >= 75" class="lc-todo__tag">重要</text>
            <text v-if="row.reminded" class="lc-todo__tag">已催办</text>
          </view>
          <text class="lc-todo__item-meta">{{ [row.initiatorName ? `发起人${row.initiatorName}` : '', row.currentNodeName ? `节点${row.currentNodeName}` : '', row.createTime ? String(row.createTime).replace('T', ' ').slice(0, 16) : ''].filter(Boolean).join(' · ') }}</text>
        </view>
      </view>
      <text v-else class="lc-todo__empty">{{ todoAEmpty || (todoALoading ? '加载中…' : '') }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
// spike 载体：7.1 图表（echarts.use 按需注册沿用 web useEcharts.ts 图表页子集）+
// 7.2 dash 三卡片段形状（useUniKpi/useUniNotice/useUniTodo 数据面接线同产物 emit 形状；
// 请求走注入面缺省 uniRequest，无后端时静默降级为空态/占位——不阻塞构建验证）。
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, onMounted, ref } from 'vue'
import { useUniChart, useUniKpi, useUniNotice, useUniTodo } from '@lc/runtime-uni/dash'
import { buildUniAggregateOption } from '@lc/runtime-uni/charts'
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

// 7.3 dash-chart 片段形状接线（emitDashChart 产物同构：useUniChart + computed option）
const chartA = useUniChart({ refId: ds.refId, group: 'start_time', agg: 'count' })
const { rows: chartARows, loading: chartALoading } = chartA
const chartAOption = computed(() => buildUniAggregateOption('line', chartARows, '发起趋势'))

// dash 片段形状接线（ds 常量为产物同形占位；404/无网时走静默降级）
const ds = { id: 'ds_a', refId: 'ds-builtin-process-definitions' }
const kpiAUnit = '元'
const kpiA = useUniKpi({ refId: ds.refId, agg: 'count' })
const { value: kpiAValue } = kpiA
const noticeA = useUniNotice({ limit: 5 })
const { rows: noticeARows, total: noticeATotal, loading: noticeALoading } = noticeA
const todoAUserId = uni.getStorageSync('lc_user_id')
const todoA = useUniTodo({ view: 'todo', limit: 5, orderBy: 'priority', userId: String(todoAUserId ?? '') })
const { rows: todoARows, total: todoATotal, empty: todoAEmpty, loading: todoALoading } = todoA

onMounted(() => {
  void kpiA.reload()
  void noticeA.reload()
  void todoA.reload()
  void chartA.reload()
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
.lc-dchart {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 12rpx;
}
.lc-dchart__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}
.lc-dchart__empty {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #c0c4cc;
}
.lc-kpi {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 12rpx;
}
.lc-kpi__head {
  display: flex;
}
.lc-kpi__title {
  font-size: 26rpx;
  color: #909399;
}
.lc-kpi__subtitle {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #c0c4cc;
}
.lc-kpi__value-row {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
}
.lc-kpi__value {
  font-size: 44rpx;
  font-weight: 600;
  color: #303133;
}
.lc-kpi__unit {
  margin-left: 8rpx;
  font-size: 24rpx;
  color: #909399;
}
.lc-notice {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 12rpx;
}
.lc-notice__head {
  display: flex;
  justify-content: space-between;
}
.lc-notice__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}
.lc-notice__count {
  font-size: 24rpx;
  color: #909399;
}
.lc-notice__list {
  margin-top: 12rpx;
}
.lc-notice__item {
  padding: 12rpx 0;
}
.lc-notice__item-line {
  display: flex;
  align-items: center;
}
.lc-notice__item-title {
  font-size: 26rpx;
  color: #303133;
}
.lc-notice__tag {
  margin-left: 8rpx;
  padding: 2rpx 8rpx;
  font-size: 20rpx;
  color: #e6a23c;
  background-color: #fdf6ec;
  border-radius: 6rpx;
}
.lc-notice__item-meta {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #c0c4cc;
}
.lc-notice__empty {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #c0c4cc;
}
.lc-todo {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 12rpx;
}
.lc-todo__head {
  display: flex;
  justify-content: space-between;
}
.lc-todo__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
}
.lc-todo__count {
  font-size: 24rpx;
  color: #909399;
}
.lc-todo__list {
  margin-top: 12rpx;
}
.lc-todo__item {
  padding: 12rpx 0;
}
.lc-todo__item-main {
  display: flex;
  align-items: center;
}
.lc-todo__item-title {
  font-size: 26rpx;
  color: #303133;
}
.lc-todo__tag {
  margin-left: 8rpx;
  padding: 2rpx 8rpx;
  font-size: 20rpx;
  color: #909399;
  background-color: #f4f4f5;
  border-radius: 6rpx;
}
.lc-todo__tag--urgent {
  color: #f56c6c;
  background-color: #fef0f0;
}
.lc-todo__item-meta {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #c0c4cc;
}
.lc-todo__empty {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #c0c4cc;
}
</style>
