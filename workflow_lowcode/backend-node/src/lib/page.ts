/**
 * page.ts — 分页双信封（实测对齐）
 *
 * PageResult   {total, page, size, rows}      —— system 模块（/api/users 等）
 * PageResponse {content, pageNumber, pageSize, totalElements, totalPages} —— v1 低代码
 *
 * 实测基准（8080 /api/users?page=1&size=2）：total 数字、rows 数组；1-based 分页。
 */
import { all, one, type Row } from './db';

export interface PageResultShape<T> {
  total: number;
  page: number;
  size: number;
  rows: T[];
}

export interface PageResponseShape<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}

/** PageResult 构造（total long → JSON 数字，实测行为） */
export function pageResult<T>(total: number, page: number, size: number, rows: T[]): PageResultShape<T> {
  return { total: Number(total), page, size, rows };
}

/** PageResponse 构造（totalPages = ceil(total/size)，size=0 → 0，对齐 Java） */
export function pageResponse<T>(content: T[], pageNumber: number, pageSize: number, totalElements: number): PageResponseShape<T> {
  return {
    content,
    pageNumber,
    pageSize,
    totalElements: Number(totalElements),
    totalPages: pageSize > 0 ? Math.ceil(totalElements / pageSize) : 0,
  };
}

/** 解析 ?page=&size=（1-based；缺省 page=1 size=10，对齐 UserServiceImpl） */
export function parsePaging(
  q: Record<string, unknown>,
  dflt: { page?: number; size?: number; pageKey?: string; sizeKey?: string } = {},
): { page: number; size: number; offset: number } {
  const pageKey = dflt.pageKey ?? 'page';
  const sizeKey = dflt.sizeKey ?? 'size';
  const rawPage = Number(q[pageKey]);
  const rawSize = Number(q[sizeKey]);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : (dflt.page ?? 1);
  const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : (dflt.size ?? 10);
  return { page, size, offset: (page - 1) * size };
}

/** COUNT + LIMIT 查询组合帮手（baseFrom 如 "SYS_USER"；whereSql 以 WHERE/空串开头） */
export function pagedQuery(
  baseFrom: string,
  whereSql: string,
  params: unknown[],
  offset: number,
  size: number,
): { rows: Row[]; total: number } {
  const totalRow = one(`SELECT COUNT(*) AS C FROM ${baseFrom} ${whereSql}`, params);
  const total = Number(totalRow?.['C'] ?? 0);
  const rows = all(`SELECT * FROM ${baseFrom} ${whereSql} LIMIT ? OFFSET ?`, [...params, size, offset]);
  return { rows, total };
}
