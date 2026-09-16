/**
 * shared.ts — 工作流模块（process-category / process-definition）公共小件（Task 13-6a）
 *
 * tenantOf 与 form.ts 内同名函数同语义：TenantProvider.getTenantId 对齐 ——
 * 缺失/空白 X-Tenant-Id → TenantNotSetException（HTTP 400 "Tenant ID is not set. ..."）。
 * 13-6a 抽出为共享模块（原 form.ts 内实现保持不动，避免回归）。
 */
import type { AuthedRequest } from '../lib/http';
import { TenantNotSetError } from '../lib/errors';

export function tenantOf(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new TenantNotSetError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

/** query 参数首个值（Express query 值可能是数组） */
export function qs(req: AuthedRequest, name: string): string | null {
  const v = req.query[name];
  if (v == null) return null;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? (v[0] as string) : null;
  return typeof v === 'string' ? v : null;
}

/**
 * @RequestParam int 绑定（对齐 Spring MVC，8080 实测）：
 *  - 缺省：有 default 用 default，否则 HTTP500 "Required request parameter 'x' ..."
 *  - 非整数：HTTP500 "Method parameter 'x': Failed to convert ... 'int'; For input string: \"raw\""
 */
export function intParam(req: AuthedRequest, name: string, dflt?: number): number {
  const raw = qs(req, name);
  if (raw == null) {
    if (dflt !== undefined) return dflt;
    throw new Error(`Required request parameter '${name}' for method parameter type String is not present`);
  }
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n)) {
    throw new Error(
      `Method parameter '${name}': Failed to convert value of type 'java.lang.String' to required type 'int'; For input string: "${raw}"`,
    );
  }
  return n;
}

/** @RequestParam String 绑定：缺失 → HTTP500（消息与 int 同款，类型名为 String） */
export function strParam(req: AuthedRequest, name: string): string {
  const raw = qs(req, name);
  if (raw == null) {
    throw new Error(`Required request parameter '${name}' for method parameter type String is not present`);
  }
  return raw;
}

/** StringUtils.hasText */
export function hasText(v: string | null | undefined): boolean {
  return v != null && v.trim().length > 0;
}
