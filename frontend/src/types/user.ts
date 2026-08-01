export interface UserVO {
  id: number
  username: string
  nickname: string
  email: string
  phone: string
  avatar: string
  orgId: number
  orgName: string
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
  status?: number
}

export interface UserCreateForm {
  username: string
  nickname: string
  email?: string
  phone?: string
  orgId?: number
  roleIds?: number[]
}

export interface UserUpdateForm {
  nickname?: string
  email?: string
  phone?: string
  orgId?: number
  roleIds?: number[]
}