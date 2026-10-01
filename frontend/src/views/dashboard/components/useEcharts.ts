/**
 * echarts 按需注册（Task 119 仪表盘）。
 *
 * 只引入仪表盘需要的图表与组件，控制包体（tree-shaking 后 ~250KB 量级）。
 * 全局单例注册一次，各图表组件共享；主题色与平台主色（翡翠绿系）对齐，
 * 避开 indigo/blue 主导的默认配色。
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart, HeatmapChart, FunnelChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

let registered = false

export function ensureEcharts(): typeof echarts {
  if (!registered) {
    echarts.use([
      BarChart,
      LineChart,
      PieChart,
      ScatterChart,
      HeatmapChart,
      FunnelChart,
      GridComponent,
      TooltipComponent,
      LegendComponent,
      TitleComponent,
      VisualMapComponent,
      CanvasRenderer,
    ])
    registered = true
  }
  return echarts
}

/** 仪表盘系列色板：翡翠为主，配琥珀/青/玫瑰/紫，饼图多扇区可辨。 */
export const DASH_PALETTE = [
  '#10b981',
  '#f59e0b',
  '#14b8a6',
  '#f43f5e',
  '#8b5cf6',
  '#84cc16',
  '#ec4899',
  '#06b6d4',
]

/** Canvas 能力探测：jsdom（测试）/异常终端无 2d 上下文，图表退化为空态而非抛错。 */
export function canvasAvailable(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('2d')
  } catch {
    return false
  }
}

/** 读取 CSS 变量的文本色（暗色模式下 echarts 文字跟随主题）。 */
export function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}
