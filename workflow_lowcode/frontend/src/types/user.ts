export interface UserVO {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  avatar: string
  orgId: number
  orgName: string
  /** 岗位 id（V43）。 */
  postId: number | null
  postName: string | null
  roleIds: number[]
  status: number
  createdAt: string
}

export interface UserQueryParams {
  page?: number
  size?: number
  username?: string
  nickname?: string
  orgId?: number
  orgIds?: number[]
  roleIds?: number[]
  status?: number
}

export interface SelectedUser {
  id: number
  nickname: string
  username: string
  orgName: string
}

export interface UserCreateForm {
  username: string
  nickname: string
  email?: string
  phone?: string
  orgId?: number
  postId?: number | null
  roleIds?: number[]
}

export interface UserUpdateForm {
  nickname?: string
  email?: string
  phone?: string
  orgId?: number
  /** 显式传 null 清空岗位。 */
  postId?: number | null
  roleIds?: number[]
}