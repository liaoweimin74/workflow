/** 成员组 VO（对齐后端 MemberGroupVO，V43）。 */
export interface MemberGroupVO {
  id: number
  groupName: string
  description: string | null
  /** 有效成员数（手动 ∪ 规则匹配，去重）。 */
  memberCount: number
  /** 手动添加成员数。 */
  manualCount: number
  /** 自动规则数。 */
  ruleCount: number
  createdAt: string
}

/** 成员来源：manual=直接添加 position=按岗位规则 org=按组织规则。 */
export type GroupMemberSource = 'manual' | 'position' | 'org'

export interface GroupMemberVO {
  userId: number
  username: string
  nickname: string | null
  orgName: string | null
  postName: string | null
  source: GroupMemberSource
  sourceLabel: string
  /** 加入时间（手动成员为行创建时间；规则匹配成员为 null）。 */
  joinedAt: string | null
}

export interface GroupRuleVO {
  id: number
  ruleType: 'position' | 'org'
  ruleTypeName: string
  ruleValue: number
  /** 维度取值展示名（岗位名/组织名）。 */
  ruleValueLabel: string
  createdAt: string
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
}
