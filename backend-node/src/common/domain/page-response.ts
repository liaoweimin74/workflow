/**
 * 分页响应封装之一，逐字对齐 Java 侧 com.workflow.api.dto.PageResponse。
 *
 * ⚠️ 本项目**有三种分页形状并存**，不存在全局规律（见规格 §5.4.1）：
 *   - PageResponse（本文件）：content / pageNumber / pageSize / totalElements / totalPages
 *     使用者：Task · ProcessDesign · ProcessDefinition · ProcessInstance ·
 *             FormDefinition · PageDefinition · DataSource
 *   - PageResult（./page-result.ts）：total / page / size / rows
 *     使用者：User · Role · DictType · Notification · EventDefinition
 *   - 裸数组：Category · Menu · Organization · Template · Channel 等
 *
 * 实现端点时**必须按其 golden 样本选择**，不得凭猜测。
 *
 * 两个关键语义（对齐 Java 构造器）：
 *   - pageNumber 是 **1 基**（Java 侧为 `result.getNumber() + 1`）
 *   - totalPages = ceil(totalElements / pageSize)，pageSize <= 0 时为 0
 */
export class PageResponse<T> {
  content: T[]
  pageNumber: number
  pageSize: number
  totalElements: number
  totalPages: number

  constructor(content: T[], pageNumber: number, pageSize: number, totalElements: number) {
    this.content = content
    this.pageNumber = pageNumber
    this.pageSize = pageSize
    this.totalElements = totalElements
    this.totalPages = pageSize > 0 ? Math.ceil(totalElements / pageSize) : 0
  }
}

export function pageResponse<T>(
  content: T[],
  pageNumber: number,
  pageSize: number,
  totalElements: number,
): PageResponse<T> {
  return new PageResponse<T>(content, pageNumber, pageSize, totalElements)
}
