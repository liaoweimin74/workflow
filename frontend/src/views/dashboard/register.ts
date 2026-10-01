/**
 * 仪表盘组件设计器注册（Task 119）。
 *
 * 被 PageDesigner 消费：addComponent（拖拽面板）+ setComponentRuleConfig
 * （属性面板「配置数据源/图表」按钮）。运行时注册在 PageRendererPage 与
 * main.ts（FcDesigner.component）完成，这里只放 rule 工厂，保持单一职责。
 */

export const DASH_KPI_NAME = 'dash-kpi'
export const DASH_CHART_NAME = 'dash-chart'

/** KPI 指标卡拖入 rule（props 与 DashKpi.vue 对齐） */
export function dashKpiRule(): Record<string, unknown> {
  return {
    type: DASH_KPI_NAME,
    field: 'kpi' + Date.now(),
    title: 'KPI 指标卡',
    props: {
      title: '',
      subtitle: '',
      unit: '',
      agg: 'count',
      metric: null,
      dataSourceId: '',
      numberFormat: '',
    },
  }
}

/** 统计图拖入 rule（props 与 DashChart.vue 对齐） */
export function dashChartRule(): Record<string, unknown> {
  return {
    type: DASH_CHART_NAME,
    field: 'chart' + Date.now(),
    title: '统计图',
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
