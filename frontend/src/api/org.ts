import http from '@/utils/http'
import type { R } from '@/types/common'
import type { TreeNode, OrgCreateForm, OrgUpdateForm } from '@/types/org'

export function getOrgTree() {
  return http.get<any, R<TreeNode[]>>('/orgs/tree')
}

export function createOrg(data: OrgCreateForm) {
  return http.post<any, R<TreeNode>>('/orgs', data)
}

export function updateOrg(id: number, data: OrgUpdateForm) {
  return http.put<any, R<TreeNode>>(`/orgs/${id}`, data)
}

export function deleteOrg(id: number) {
  return http.delete<any, R<null>>(`/orgs/${id}`)
}