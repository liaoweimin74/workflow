export interface TreeNode {
  id: number
  label: string
  code: string
  /** 负责人用户 id（V43）。 */
  leaderId: number | null
  /** 负责人展示名（nickname 优先、回落 username）。 */
  leaderName: string | null
  parentId: number
  sortOrder: number
  status: number
  children: TreeNode[]
}

export interface OrgCreateForm {
  name: string
  code: string
  parentId?: number
  /** 负责人用户 id（V43）。 */
  leaderId?: number | null
  sortOrder?: number
}

export interface OrgUpdateForm {
  name?: string
  code?: string
  parentId?: number
  /** 负责人用户 id，显式传 null 清空（V43）。 */
  leaderId?: number | null
  sortOrder?: number
  status?: number
}