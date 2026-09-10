import { NextRequest, NextResponse } from "next/server";

/**
 * 网关代理中间件
 *
 * 沙箱仅对外暴露一个端口（经 Caddy 默认转发到 Next.js 3000），
 * 而工作流低代码平台由独立服务组成：
 *   - Java 后端 (Spring Boot + Flowable) : localhost:8080
 *   - Vue 前端 (Vite dev server)          : localhost:5173 (base=/lowcode/)
 *
 * 通过 middleware rewrite 实现同端口反向代理：
 *   /api/v1/*     -> http://localhost:8080/api/v1/*     （后端 REST API）
 *   /lowcode/*    -> http://localhost:5173/lowcode/*    （Vue 前端）
 *   /api/portal/* -> 保留给 Next.js 门户控制面（服务监督状态接口）
 */
const BACKEND_ORIGIN = "http://localhost:8080";
const FRONTEND_ORIGIN = "http://localhost:5173";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 门户自身控制面接口交由 Next.js 处理
  if (pathname.startsWith("/api/portal")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, BACKEND_ORIGIN));
  }

  if (pathname === "/lowcode" || pathname.startsWith("/lowcode/")) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, FRONTEND_ORIGIN));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/lowcode/:path*", "/lowcode", "/api/:path*"],
};
