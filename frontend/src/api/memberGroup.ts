import http from '@/utils/http'
import type { R } from '@/types/common'
import type {
  MemberGroupVO,
  GroupMemberVO,
  GroupRuleVO,
  MemberGroupQueryParams,
  MemberGroupCreateForm,
  MemberGroupUpdateForm,
} from '@/types/memberGroup'

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

/** 有效成员分页（手动 ∪ 规则匹配，含来源标记）。 */
export function getGroupMembers(groupId: number, params: { page?: number; size?: number; keyword?: string }) {
  return http.get<any, R<{ rows: GroupMemberVO[]; total: number; page: number; size: number }>>(
    `/member-groups/${groupId}/members`,
    { params },
  )
}

/** 批量添加手动成员。 */
export function addGroupMembers(groupId: number, userIds: number[]) {
  return http.post<any, R<null>>(`/member-groups/${groupId}/members`, { userIds })
}

/** 批量移除手动成员（仅直接添加部分）。 */
export function removeGroupMembers(groupId: number, userIds: number[]) {
  return http.post<any, R<null>>(`/member-groups/${groupId}/members/remove`, { userIds })
}

/** 自动匹配规则列表。 */
export function getGroupRules(groupId: number) {
  return http.get<any, R<GroupRuleVO[]>>(`/member-groups/${groupId}/rules`)
}

/** 添加自动匹配规则（position=按岗位 / org=按组织机构）。 */
export function addGroupRule(groupId: number, ruleType: 'position' | 'org', ruleValue: number) {
  return http.post<any, R<GroupRuleVO>>(`/member-groups/${groupId}/rules`, { ruleType, ruleValue })
}

/** 删除自动匹配规则。 */
export function removeGroupRule(groupId: number, ruleId: number) {
  return http.delete<any, R<null>>(`/member-groups/${groupId}/rules/${ruleId}`)
}
