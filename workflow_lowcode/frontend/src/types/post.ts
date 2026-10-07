/** 岗位 VO（对齐后端 PostVO，V43）。 */
export interface PostVO {
  id: number
  postCode: string
  postName: string
  description: string | null
  sortOrder: number | null
  status: number
  createdAt: string
}

export interface PostQueryParams {
  page?: number
  size?: number
  keyword?: string
  status?: number
}

export interface PostCreateForm {
  postCode: string
  postName: string
  description?: string
  sortOrder?: number
  status?: number
}

export interface PostUpdateForm {
  postCode?: string
  postName?: string
  description?: string
  sortOrder?: number
  status?: number
}

/** 启用岗位下拉选项。 */
export interface PostOptionVO {
  id: number
  postCode: string
  postName: string
}
