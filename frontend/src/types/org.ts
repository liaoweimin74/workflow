export interface TreeNode {
  id: number
  label: string
  code: string
  parentId: number
  sortOrder: number
  status: number
  children: TreeNode[]
}

export interface OrgCreateForm {
  name: string
  code: string
  parentId?: number
  sortOrder?: number
}

export interface OrgUpdateForm {
  name?: string
  code?: string
  sortOrder?: number
  status?: number
}