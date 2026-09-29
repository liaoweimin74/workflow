import http from '@/utils/http'
import type { R } from '@/types/common'
import type { PostVO, PostQueryParams, PostCreateForm, PostUpdateForm, PostOptionVO } from '@/types/post'

export function getPostList(params: PostQueryParams) {
  return http.get<any, R<{ rows: PostVO[]; total: number; page: number; size: number }>>('/posts', { params })
}

/** 启用岗位下拉选项（用户表单/成员组规则用）。 */
export function getPostOptions() {
  return http.get<any, R<PostOptionVO[]>>('/posts/options', { cache: true })
}

export function createPost(data: PostCreateForm) {
  return http.post<any, R<PostVO>>('/posts', data)
}

export function updatePost(id: number, data: PostUpdateForm) {
  return http.put<any, R<PostVO>>(`/posts/${id}`, data)
}

export function deletePost(id: number) {
  return http.delete<any, R<null>>(`/posts/${id}`)
}
