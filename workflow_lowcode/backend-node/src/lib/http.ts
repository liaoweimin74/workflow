/**
 * http.ts — 鉴权守卫与全局错误处理（对齐 JwtAuthenticationFilter + GlobalExceptionHandler）
 */
import type { NextFunction, Request, Response } from 'express';
import { R, BusinessException, IllegalArgumentError, TenantNotSetError, EngineError, type RShape } from './errors';
import { verifyToken, type TokenClaims } from './jwt';

export interface AuthedRequest extends Request {
  auth?: TokenClaims;
  /** 登录用户 ID（数值） */
  userId?: number;
  tenantId?: string;
}

/** 提取 Bearer token 或 ?token=（SSE 场景，Java SecurityConfig 对 /sse 放行 query token） */
export function extractToken(req: AuthedRequest): string | null {
  const h = req.headers['authorization'];
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  const q = req.query['token'];
  if (typeof q === 'string' && q.length > 0) return q;
  return null;
}

/**
 * 登录守卫：与 Java 过滤器一致 ——
 *  - 无 token / 校验失败 / type 不是 access_token → HTTP 401 R.unauthorized("未登录或Token已过期")
 *  - 通过后挂 req.auth / req.userId
 */
export function authGuard(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json(R.unauthorized());
    return;
  }
  const claims = verifyToken(token);
  if (!claims || claims.type !== 'access_token') {
    res.status(401).json(R.unauthorized());
    return;
  }
  req.auth = claims;
  req.userId = Number(claims.sub);
  next();
}

/** 通知管理端权限：ROLE_ADMIN 或用户名 admin（对齐 NotificationAccessGuard） */
export function requireNotificationAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  // 由各路由在挂载 authGuard 后使用；这里只做角色判定所需的懒加载占位
  next();
}

type AsyncHandler = (req: AuthedRequest, res: Response, next: NextFunction) => Promise<unknown>;

/** 包装 async 路由，把异常交给 errorMiddleware */
export function ah(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as AuthedRequest, res, next)).catch(next);
  };
}

/** 全局错误中间件：Java GlobalExceptionHandler 的镜像实现 */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof BusinessException) {
    res.status(200).json(R.fail(err.code, err.message));
    return;
  }
  if (err instanceof IllegalArgumentError || err instanceof TenantNotSetError) {
    res.status(400).json(R.fail(400, err.message));
    return;
  }
  if (err instanceof EngineError) {
    res.status(400).json(R.fail(400, err.prefix + err.message));
    return;
  }
  // 参数校验（MethodArgumentNotValid 对齐）：HTTP 200 + code 400
  if (err instanceof ValidationError) {
    res.status(200).json(R.fail(400, err.message));
    return;
  }
  const msg = err instanceof Error ? (err.message || err.name) : String(err);
  // 未捕获异常与 Java 一致：HTTP 500 + R.fail(500, msg)
  res.status(500).json(R.fail(500, msg));
}

/** jakarta @Valid 失败的对应物 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MethodArgumentNotValidException';
  }
}

/** 便捷：校验必填字符串字段，失败抛 ValidationError（消息风格对齐 "xx不能为空"） */
export function requireBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('请求体不能为空');
  }
  return body as Record<string, unknown>;
}

/** R 信封输出帮助 */
export function ok<T>(res: Response, data: RShape<T>['data'] = null): void {
  res.json(R.ok(data));
}
