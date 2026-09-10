import http from '@/utils/http'
import type { R } from '@/types/common'

/** 看板统计响应 */
export interface DashboardStats {
  /** 我的待办任务数 */
  todoCount: number
  /** 我的已办结任务数 */
  doneCount: number
  /** 进行中流程实例数 */
  runningCount: number
  /** 已部署流程定义数（最新版本） */
  definitionCount: number
  /** 我发起的流程总数 */
  startedByMeCount: number
  /** 近 7 日发起流程趋势 */
  trend: Array<{ date: string; count: number }>
  /** 流程状态占比 */
  statusShare: {
    running: number
    finished: number
  }
}

/** 获取首页看板统计数据 */
export function fetchDashboardStats(userId?: number | string): Promise<R<DashboardStats>> {
  return http.get('/v1/dashboard/stats', { params: userId != null ? { userId } : {} })
}
