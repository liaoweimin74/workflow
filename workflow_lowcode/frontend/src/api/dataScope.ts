import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 数据范围（DataScope）配置接口（对齐后端 DataScopeController）。
 *
 * 语义提醒（与后端四条不变量一致）：配置是**收紧**而非开关——某数据源没有任何命中规则时
 * 行为与从前相同（全租户可见）；管理员不受范围约束。
 */

/** 约束的动作：READ 读（列表/聚合/单条）/ WRITE 写（修改/删除） */
export type DataScopeAction = 'READ' | 'WRITE'

/** 主体类型 */
export type DataScopeSubject = 'ROLE' | 'USER' | 'ORG' | 'MEMBER_GROUP'

/** 范围类型：ALL 全部 / SELF 仅本人 / CUSTOM 自定义列等值 */
export type DataScopeType = 'ALL' | 'SELF' | 'CUSTOM'

/** 规则视图（对齐后端 DataScopeDTO） */
export interface DataScopeDTO {
  id: number | null
  dataSourceId: string
  action: DataScopeAction
  subjectType: DataScopeSubject
  subjectKey: string
  scopeType: DataScopeType
  scopeColumn: string | null
  scopeValue: string | null
}

/** 保存请求（对齐后端 DataScopeSaveRequest；缺省 action=READ、subjectType=ROLE） */
export interface DataScopeSaveRequest {
  dataSourceId: string
  action?: DataScopeAction
  subjectType?: DataScopeSubject
  subjectKey: string
  scopeType: DataScopeType
  scopeColumn?: string | null
  scopeValue?: string | null
}

/** 生效预览（对齐后端 DataScopeEffectiveVO） */
export interface DataScopeEffectiveVO {
  dataSourceId: string
  action: DataScopeAction
  userId: number | null
  username: string | null
  /** 该主体可命中的标识集合，形如 ROLE:clerk / USER:200 / ORG:77 / MEMBER_GROUP:9 */
  subjects: string[]
  matchedRules: DataScopeDTO[]
  effectiveRule: DataScopeDTO | null
  /** true = 无行级限制（无命中、命中 ALL、或管理员） */
  unrestricted: boolean
  /** 实际叠加到查询上的列 → 值条件 */
  condition: Record<string, unknown>
}

export const dataScopeApi = {
  /** 某数据源的全部规则（不分动作） */
  list(dataSourceId: string): Promise<R<DataScopeDTO[]>> {
    return http.get('/v1/data-scopes', { params: { dataSourceId } })
  },

  /** 保存规则（同数据源 + 同动作 + 同主体覆盖） */
  save(data: DataScopeSaveRequest): Promise<R<DataScopeDTO>> {
    return http.post('/v1/data-scopes', data)
  },

  /** 删除规则 */
  remove(id: number): Promise<R<void>> {
    return http.delete(`/v1/data-scopes/${id}`)
  },

  /** 生效预览：指定用户（省略则为当前登录人）在某数据源某动作上实际受什么限制 */
  effective(params: {
    dataSourceId: string
    action?: DataScopeAction
    userId?: number
  }): Promise<R<DataScopeEffectiveVO>> {
    return http.get('/v1/data-scopes/effective', { params })
  },
}
