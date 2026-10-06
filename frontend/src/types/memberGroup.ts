/**
 * 成员组类型（Task 142：去业务表单化，对齐后端 MemberGroupController 契约）。
 * 自动规则机制已移除（Task 141 决策），成员均为手动添加。
 */

/** 成员组 VO。 */
export interface MemberGroupVO {
  id: number
  groupName: string
  description: string | null
  /** 状态：1 启用 0 停用。 */
  status: number
  /** 有效成员数。 */
  memberCount: number
  createdAt: string
}

/** 成员组成员行 VO（全部为手动添加）。 */
export interface GroupMemberVO {
  userId: number
  username: string
  nickname: string | null
  orgName: string | null
  postName: string | null
  /** 固定 'manual'（历史契约兼容）。 */
  source: 'manual'
  sourceLabel: string
  joinedAt: string | null
}

export interface MemberGroupQueryParams {
  page?: number
  size?: number
  keyword?: string
}

export interface MemberGroupCreateForm {
  groupName: string
  description?: string
}

export interface MemberGroupUpdateForm {
  groupName?: string
  description?: string
  status?: number
}
