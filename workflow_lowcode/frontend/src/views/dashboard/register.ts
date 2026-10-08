/**
 * 仪表盘组件设计器注册（Task 119 → Task 120 扩展）。
 *
 * 被 PageDesigner 消费：addComponent（拖拽面板）+ setComponentRuleConfig
 * （属性面板「配置」按钮）。运行时注册在 PageRendererPage 与
 * main.ts（FcDesigner.component）完成，这里只放 rule 工厂，保持单一职责。
 *
 * Task 120 组件族：dash-filter（筛选器）/ dash-goal（目标进度）/
 * dash-leaderboard（排行榜）/ dash-alert（告警标记）。
 */

export const DASH_KPI_NAME = 'dash-kpi'
export const DASH_CHART_NAME = 'dash-chart'
export const DASH_FILTER_NAME = 'dash-filter'
export const DASH_GOAL_NAME = 'dash-goal'
export const DASH_LEADERBOARD_NAME = 'dash-leaderboard'
export const DASH_ALERT_NAME = 'dash-alert'

/** KPI 指标卡拖入 rule（props 与 DashKpi.vue 对齐；Task 120 增加趋势/迷你图；Task 123 增加宽高） */
export function dashKpiRule(): Record<string, unknown> {
  return {
    type: DASH_KPI_NAME,
    field: 'kpi' + Date.now(),
    title: 'KPI 指标卡',
    col: { span: 24 },
    props: {
      title: '',
      subtitle: '',
      unit: '',
      agg: 'count',
      metric: null,
      dataSourceId: '',
      numberFormat: '',
      trendEnabled: false,
      trendGrain: 'day',
      trendField: '',
      sparkline: false,
      sparkRange: 12,
      span: 24,
      height: '',
    },
  }
}

/** 统计图拖入 rule（props 与 DashChart.vue 对齐；Task 120 增加 area/scatter/heatmap/funnel；Task 123 增加宽度栅格） */
export function dashChartRule(): Record<string, unknown> {
  return {
    type: DASH_CHART_NAME,
    field: 'chart' + Date.now(),
    title: '统计图',
    col: { span: 24 },
    props: {
      title: '',
      chartType: 'bar',
      group: '',
      timeGrain: null,
      agg: 'count',
      metric: null,
      sort: 'key',
      order: 'asc',
      limit: 0,
      dataSourceId: '',
      height: '260px',
      span: 24,
    },
  }
}

/** 筛选器拖入 rule（Task 120；Task 123 增加宽度栅格） */
export function dashFilterRule(): Record<string, unknown> {
  return {
    type: DASH_FILTER_NAME,
    field: 'filter' + Date.now(),
    title: '筛选器',
    col: { span: 24 },
    props: {
      filterType: 'date-range',
      field: '',
      label: '',
      placeholder: '',
      options: '',
      autoBroadcast: true,
      span: 24,
    },
  }
}

/** 目标进度拖入 rule（Task 120；Task 123 增加宽高） */
export function dashGoalRule(): Record<string, unknown> {
  return {
    type: DASH_GOAL_NAME,
    field: 'goal' + Date.now(),
    title: '目标进度',
    col: { span: 24 },
    props: {
      title: '',
      target: 100,
      unit: '',
      agg: 'count',
      metric: null,
      dataSourceId: '',
      numberFormat: '',
      span: 24,
      height: '',
    },
  }
}

/** 排行榜拖入 rule（Task 120；Task 123 增加宽高） */
export function dashLeaderboardRule(): Record<string, unknown> {
  return {
    type: DASH_LEADERBOARD_NAME,
    field: 'board' + Date.now(),
    title: '排行榜',
    col: { span: 24 },
    props: {
      title: '',
      group: '',
      agg: 'count',
      metric: null,
      timeGrain: null,
      limit: 5,
      dataSourceId: '',
      numberFormat: '',
      span: 24,
      height: '',
    },
  }
}

/** 告警标记拖入 rule（Task 120；Task 123 增加宽高） */
export function dashAlertRule(): Record<string, unknown> {
  return {
    type: DASH_ALERT_NAME,
    field: 'alert' + Date.now(),
    title: '告警标记',
    col: { span: 24 },
    props: {
      title: '',
      unit: '',
      agg: 'count',
      metric: null,
      dataSourceId: '',
      numberFormat: '',
      condition: 'gt',
      threshold: 0,
      alertText: '',
      span: 24,
      height: '',
    },
  }
}

/** 属性面板注入的配置按钮（与 page-table 的数据源按钮同款式） */
export function dashConfigButton(label: string, onClick: () => void): Record<string, unknown> {
  return {
    type: 'button',
    field: 'dashConfigTrigger',
    title: label === '配置图表' ? '' : '数据源',
    children: [label],
    native: true,
    style: { width: '100%', borderColor: '#2E73FF', color: '#2E73FF' },
    props: { size: 'small' },
    on: { click: onClick },
  }
}
