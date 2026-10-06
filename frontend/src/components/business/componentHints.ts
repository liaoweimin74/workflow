/**
 * 系统组件说明文案构造器（Task 148）。
 *
 * 附件（SystemAttachment）/ 图片（SystemImage）组件的说明性文字不再内联渲染在
 * 组件内部（原 sa-tip / si-tip），改为由设计器物料注册写入 form-create 规则的
 * `info` 字段——form-create 原生在字段 label 后渲染 ？ 图标，鼠标悬浮弹出说明
 * （@form-create/element-ui makeInfo，设计器画布与运行时渲染均生效）。
 *
 * 本模块是两端（组件内派生逻辑删除后）唯一的文案事实源：
 * - 设计器 addComponent 的 rule() 初始 info 与 watch（属性面板变更）都调用这里
 * - 纯函数、无副作用，便于单测
 */

export interface AttachmentHintCfg {
  limit?: number | string
  multiSelect?: boolean
  maxSizeMB?: number | string
  accept?: string | string[]
}

/** 附件组件说明文案：大小上限 / 数量上限 / 一次多选 / 类型限制。 */
export function attachmentHintText(cfg: AttachmentHintCfg): string {
  const parts: string[] = [`单个不超过 ${cfg.maxSizeMB || 10}MB`]
  const isMulti = Number(cfg.limit) !== 1
  if (isMulti && Number(cfg.limit) > 0) parts.push(`最多 ${cfg.limit} 个`)
  if (isMulti && cfg.multiSelect !== false) parts.push('可一次多选')
  const accept = Array.isArray(cfg.accept) ? cfg.accept.join(',') : cfg.accept || ''
  if (accept) parts.push(`支持 ${accept}`)
  return parts.join('，')
}

export interface ImageHintCfg {
  limit?: number | string
  multiSelect?: boolean
  maxSizeMB?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  maxHeight?: number | string
}

function num0(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 图片组件说明文案：大小上限 / 数量上限 / 宽高范围 / 一次多选 / 支持格式。 */
export function imageHintText(cfg: ImageHintCfg): string {
  const parts: string[] = [`单张不超过 ${cfg.maxSizeMB || 10}MB`]
  const isMulti = Number(cfg.limit) !== 1
  if (isMulti && Number(cfg.limit) > 0) parts.push(`最多 ${cfg.limit} 张`)
  const minW = num0(cfg.minWidth)
  const maxW = num0(cfg.maxWidth)
  const minH = num0(cfg.minHeight)
  const maxH = num0(cfg.maxHeight)
  if (minW > 0 || maxW > 0 || minH > 0 || maxH > 0) {
    const range = (min: number, max: number) =>
      min > 0 && max > 0 ? `${min}~${max}px` : min > 0 ? `≥${min}px` : max > 0 ? `≤${max}px` : '不限'
    parts.push(`宽 ${range(minW, maxW)} × 高 ${range(minH, maxH)}`)
  }
  if (isMulti && cfg.multiSelect !== false) parts.push('可一次多选')
  parts.push('支持 JPG/PNG/GIF/WebP/BMP/SVG/ICO/AVIF')
  return parts.join('，')
}
