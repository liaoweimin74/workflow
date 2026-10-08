/**
 * 附件/图片 API（Task 146：系统组件·附件；Task 147：系统组件·图片）。
 *
 * 对应后端 AttachmentController（/api/attachments）：
 * - POST /attachments/upload          multipart(files[, bizType, bizRef]) → R<AttachmentVO[]>
 * - POST /attachments/upload-image    图片强校验上传（服务端读像素尺寸）→ R<AttachmentVO[]>
 * - GET  /attachments?ids=1,2,3       按 id 批量取元数据（组件回显）
 * - GET  /attachments/{id}/preview    内联预览（Content-Disposition: inline，二进制直出）
 * - GET  /attachments/{id}/download   附件式下载（Content-Disposition: attachment）
 * - GET  /attachments/{id}/thumbnail  缩略图（w 缺省 320；非位图回退原图字节）
 * - DELETE /attachments/{id}          软删
 *
 * 二进制（blob）响应由 utils/http.ts 响应拦截器原样放行（Task 146 同步改造），
 * R 包装响应解包出 {code,msg,data} 信封由调用方判 code。
 */
import http from '@/utils/http'

export interface AttachmentMeta {
  id: number
  /** 原始文件名 */
  fileName: string
  /** MIME 类型，可能为空（流式接口服务端兜底 application/octet-stream） */
  contentType: string | null
  /** 字节数 */
  fileSize: number
  /** 上传人 */
  createdBy: string | null
  /** 上传时间（ISO-8601 字符串，可能为 null） */
  createdAt: string | null
  /** 图片宽度 px（仅 upload-image 且位图解码成功时有值；Task 147） */
  width?: number | null
  /** 图片高度 px（同上） */
  height?: number | null
}

export interface AttachmentEnvelope<T> {
  code: number
  msg?: string
  data: T
}

/** 上传附件（组件按逐文件调用，便于逐个校验与精确报错；也支持一次多文件）。 */
export function uploadAttachments(files: File | File[], bizType?: string, bizRef?: string) {
  const fd = new FormData()
  const list = Array.isArray(files) ? files : [files]
  list.forEach((f) => fd.append('files', f))
  if (bizType) fd.append('bizType', bizType)
  if (bizRef) fd.append('bizRef', bizRef)
  return http.post('/attachments/upload', fd, { timeout: 120000 }) as unknown as Promise<AttachmentEnvelope<AttachmentMeta[]>>
}

/** 图片扩展名白名单（Task 147：与后端 AttachmentService.IMAGE_EXTENSIONS 对齐）。 */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'] as const

/** 图片组件默认 accept（input accept 语法）。 */
export const IMAGE_ACCEPT = 'image/*'

/** 文件是否为图片：MIME image/* 优先，伪 MIME（如 octet-stream）按扩展名兑底。 */
export function isImageFile(file: { name: string; type?: string }): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = (file.name || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** 图片上传（Task 147：后端强校验图片类型 + 服务端读像素尺寸返回 width/height）。 */
export function uploadImages(files: File | File[], bizType?: string, bizRef?: string) {
  const fd = new FormData()
  const list = Array.isArray(files) ? files : [files]
  list.forEach((f) => fd.append('files', f))
  if (bizType) fd.append('bizType', bizType)
  if (bizRef) fd.append('bizRef', bizRef)
  return http.post('/attachments/upload-image', fd, { timeout: 120000 }) as unknown as Promise<AttachmentEnvelope<AttachmentMeta[]>>
}

/** 按 id 批量取元数据（表单回显）。已删除/不存在的 id 不在返回 data 中。 */
export function getAttachmentsByIds(ids: number[]) {
  return http.get('/attachments', { params: { ids: ids.join(',') } }) as unknown as Promise<AttachmentEnvelope<AttachmentMeta[]>>
}

/** 取文件二进制（预览/下载共用；kind 仅决定服务端 Content-Disposition，前端行为一致）。 */
export function fetchAttachmentBlob(id: number, kind: 'preview' | 'download' = 'preview') {
  return http.get(`/attachments/${id}/${kind}`, { responseType: 'blob', timeout: 120000 }) as unknown as Promise<Blob>
}

/** 取缩略图二进制（Task 147；w 为最大边长 64~640，服务端位图缩放/非位图回退原图）。 */
export function fetchAttachmentThumbnail(id: number, w = 320) {
  return http.get(`/attachments/${id}/thumbnail`, { params: { w }, responseType: 'blob', timeout: 60000 }) as unknown as Promise<Blob>
}

/** 删除附件（软删）。表单字段移除文件时前端不调此接口——编辑态删除后未提交会令
 *  已保存数据引用悬空；服务端孤儿清理属后续 GC 范畴。 */
export function deleteAttachment(id: number) {
  return http.delete(`/attachments/${id}`) as unknown as Promise<AttachmentEnvelope<null>>
}

/** 字节数人性化：空/非法 → '—'；B 整数；KB/MB 一位小数；GB 两位小数。 */
export function formatFileSize(size: number | null | undefined): string {
  if (size == null || Number.isNaN(size)) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'office' | 'unknown'

const EXT_KIND: Record<string, PreviewKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', ico: 'image',
  pdf: 'pdf',
  txt: 'text', md: 'text', json: 'text', csv: 'text', log: 'text',
  mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio',
  doc: 'office', docx: 'office', xls: 'office', xlsx: 'office', ppt: 'office', pptx: 'office',
}

/** 预览类型判定：扩展名优先（伪 MIME 如 octet-stream 命中图片扩展名仍按扩展名），
 *  其次 MIME 前缀，均未命中 → unknown（前端引导下载）。 */
export function previewKindOf(meta: { contentType?: string | null; fileName?: string | null }): PreviewKind {
  const name = (meta?.fileName || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext]
  const type = (meta?.contentType || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('text/')) return 'text'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'unknown'
}
