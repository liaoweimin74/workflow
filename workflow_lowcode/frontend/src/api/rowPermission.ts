import http from '@/utils/http'
import type { R } from '@/types/common'
import type { DataScopeAction, DataScopeCondition, DataScopeSubject } from '@/api/dataScope'

/**
 * 权限对象（对象视角）与覆盖度盘点接口。
 *
 * 一个权限对象 = 一组条件（组内 AND）+ 若干关联数据源。授权（角色 × 对象 × 读写轴）
 * 的唯一写入口是「角色管理 → 数据权限」，这里只读回显。多个对象同时命中取并集（对象间 OR）。
 */

/** 对象上的一条授权（只读回显；写入走角色管理） */
export interface RowPermissionGrant {
  action: DataScopeAction
  subjectType: DataScopeSubject
  subjectKey: string
}

export interface RowPermissionDTO {
  id: number
  name: string
  remark: string | null
  /** 组内 AND；空数组只可能来自历史/手工数据（保存入口拒绝） */
  conditions: DataScopeCondition[]
  dataSourceIds: string[]
  grants: RowPermissionGrant[]
}

export interface RowPermissionSaveRequest {
  /** 编辑已有对象时传 id；新建留空 */
  id?: number | null
  name: string
  remark?: string | null
  conditions: DataScopeCondition[]
  dataSourceIds: string[]
}

/** 候选条件列（后端按各源可筛性给交集，前端不再自行推断） */
export interface RowPermissionColumnOption {
  key: string
  label: string
}

export type RowScopeCoverageStatus = 'COVERED' | 'EXEMPT' | 'GAP'

/** 豁免记录（撤销只软撤销，记录永不删除） */
export interface RowScopeExemptionVO {
  id: number
  dataSourceId: string
  action: DataScopeAction
  reason: string
  createdBy: string | null
  createdAt: string
  revokedBy: string | null
  revokedAt: string | null
}

/** 某数据源某读写轴的覆盖情况 */
export interface RowScopeAxisCoverage {
  action: DataScopeAction
  status: RowScopeCoverageStatus
  /** 该轴上有关键授权的权限对象名称（COVERED 的依据） */
  permissionNames: string[]
  /** 生效中的豁免；已覆盖的轴也可能挂着一条历史豁免，提示管理员撤销 */
  exemption: RowScopeExemptionVO | null
}

export interface RowScopeSourceCoverage {
  dataSourceId: string
  name: string
  type: string
  read: RowScopeAxisCoverage
  write: RowScopeAxisCoverage
}

/** 覆盖度报告：仅统计启用且可施加范围（FORM / SQL）的数据源 × 读写两轴 */
export interface RowScopeCoverageVO {
  sources: RowScopeSourceCoverage[]
  totalAxes: number
  coveredAxes: number
  exemptAxes: number
  gapAxes: number
}

export const rowPermissionApi = {
  /** 全部权限对象（新到旧） */
  list(): Promise<R<RowPermissionDTO[]>> {
    return http.get('/v1/row-permissions')
  },

  get(id: number): Promise<R<RowPermissionDTO>> {
    return http.get(`/v1/row-permissions/${id}`)
  },

  /** 保存对象：关联数据源与主体授权按全量替换处理 */
  save(data: RowPermissionSaveRequest): Promise<R<RowPermissionDTO>> {
    return http.post('/v1/row-permissions', data)
  },

  /** 候选条件列：所选数据源都能施加范围条件的列交集（没选源时为空） */
  columnCandidates(dataSourceIds: string[]): Promise<R<RowPermissionColumnOption[]>> {
    return http.get('/v1/row-permissions/column-candidates', {
      params: { dataSourceIds: dataSourceIds.join(',') },
    })
  },

  remove(id: number): Promise<R<void>> {
    return http.delete(`/v1/row-permissions/${id}`)
  },

  /** 覆盖度盘点 */
  coverage(): Promise<R<RowScopeCoverageVO>> {
    return http.get('/v1/row-scope/coverage')
  },

  /** 豁免记录（含已撤销） */
  exemptions(): Promise<R<RowScopeExemptionVO[]>> {
    return http.get('/v1/row-scope/exemptions')
  },

  /** 登记豁免：理由必填；同一数据源同一轴只能有一条生效记录 */
  exempt(data: {
    dataSourceId: string
    action: DataScopeAction
    reason: string
  }): Promise<R<RowScopeExemptionVO>> {
    return http.post('/v1/row-scope/exemptions', data)
  },

  /** 撤销豁免（软撤销，留痕） */
  revokeExemption(id: number): Promise<R<RowScopeExemptionVO>> {
    return http.post(`/v1/row-scope/exemptions/${id}/revoke`)
  },
}
