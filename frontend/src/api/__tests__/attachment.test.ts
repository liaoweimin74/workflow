// ----- Task 146: 附件组件纯函数测试 -----
// bun run test -- src/api/__tests__/attachment.test.ts

import { describe, it, expect } from 'vitest'
import { formatFileSize, previewKindOf } from '../attachment'

describe('formatFileSize — 字节数人性化', () => {
  it('空值/非法值占位', () => {
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(undefined)).toBe('—')
    expect(formatFileSize(Number.NaN)).toBe('—')
  })

  it('B / KB / MB / GB 分档', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB')
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
  })
})

describe('previewKindOf — 预览类型判定', () => {
  it('图片：MIME 与扩展名双通道', () => {
    expect(previewKindOf({ contentType: 'image/png' })).toBe('image')
    expect(previewKindOf({ contentType: '', fileName: 'photo.JPG' })).toBe('image')
    expect(previewKindOf({ fileName: 'logo.svg' })).toBe('image')
  })

  it('PDF / 文本 / 音视频', () => {
    expect(previewKindOf({ contentType: 'application/pdf' })).toBe('pdf')
    expect(previewKindOf({ fileName: 'doc.pdf' })).toBe('pdf')
    expect(previewKindOf({ contentType: 'text/plain' })).toBe('text')
    expect(previewKindOf({ fileName: 'data.csv' })).toBe('text')
    expect(previewKindOf({ contentType: 'video/mp4' })).toBe('video')
    expect(previewKindOf({ fileName: 'song.mp3' })).toBe('audio')
  })

  it('office → 引导下载；未知类型 → unknown', () => {
    expect(previewKindOf({ fileName: '报告.docx' })).toBe('office')
    expect(previewKindOf({ fileName: '表格.xlsx' })).toBe('office')
    expect(previewKindOf({ contentType: 'application/octet-stream', fileName: 'blob.bin' })).toBe('unknown')
  })

  it('扩展名优先兜底：伪 MIME 仍按扩展名识别', () => {
    expect(previewKindOf({ contentType: 'application/octet-stream', fileName: 'a.png' })).toBe('image')
  })
})
