import http from '@/utils/http'
import type { R } from '@/types/common'
import type {
  MemberGroupVO,
  GroupMemberVO,
  MemberGroupQueryParams,
  MemberGroupCreateForm,
  MemberGroupUpdateForm,
} from '@/types/memberGroup'

/** 成员组分页列表（keyword 匹配名称/说明）。 */
export function getMemberGroupList(params: MemberGroupQueryParams) {
  return http.get<any, R<{ rows: MemberGroupVO[]; total: number; page: number; size: number }>>('/member-groups', { params })
}

export function createMemberGroup(data: MemberGroupCreateForm) {
  return http.post<any, R<MemberGroupVO>>('/member-groups', data)
}

export function updateMemberGroup(id: number, data: MemberGroupUpdateForm) {
  return http.put<any, R<MemberGroupVO>>(`/member-groups/${id}`, data)
}

export function deleteMemberGroup(id: number) {
  return http.delete<any, R<null>>(`/member-groups/${id}`)
}

/** 组成员分页（全部为手动添加成员；keyword 匹配用户名/昵称）。 */
export function getGroupMembers(groupId: number, params: { page?: number; size?: number; keyword?: string }) {
  return http.get<any, R<{ rows: GroupMemberVO[]; total: number; page: number; size: number }>>(
    `/member-groups/${groupId}/members`,
    { params },
  )
}

/** 批量添加成员。 */
export function addGroupMembers(groupId: number, userIds: number[]) {
  return http.post<any, R<null>>(`/member-groups/${groupId}/members`, { userIds })
}

/** 批量移除成员。 */
export function removeGroupMembers(groupId: number, userIds: number[]) {
  return http.post<any, R<null>>(`/member-groups/${groupId}/members/remove`, { userIds })
}
