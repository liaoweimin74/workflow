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

/**
 * 还原被 Next.js 服务器规范化前的原始 query。
 *
 * 背景：请求在到达 middleware 之前，Next.js 服务器已把无值参数
 * "k" 重序列化成 "k="（实测：?vue&type=style&index=0&lang.css →
 * ?vue=&type=style&index=0&lang.css=）。这会导致 Vite 不再把该 URL
 * 识别为 Vue SFC 样式模块（不再以 .css 结尾），返回原始 CSS 而非
 * JS 包装模块，浏览器按 JS 解析即报 "Unexpected token '.'"，
 * 整个模块图加载失败，经 3000 入口访问时页面白屏。
 *
 * 这里做精确逆向：把所有空值参数的 "=" 去掉（"k=" → "k"）。
 * 对常规消费者（Spring @RequestParam 等）"k" 与 "k=" 语义等价，均解析为空串，
 * 故此还原无副作用。
 */
function restoreRawSearch(url: string): string {
  const qIndex = url.indexOf("?");
  if (qIndex < 0) return "";
  const search = url.slice(qIndex + 1);
  if (!search) return "";
  const restored = search.replace(/(^|&)([^&=]+)=(&|$)/g, "$1$2$3");
  return `?${restored}`;
}

/**
 * 低代码 SPA 深链前缀白名单。
 *
 * 背景：Vue 前端挂在 /lowcode/（vite base），vue-router 用的是不含 base 的
 * 路由路径（如 /form/designer?id=xxx）。AI 话术生成的 Markdown 链接是
 * router 相对路径——正常点击已被前端拦截走 vue-router（自动补 base），
 * 但粘贴到新标签、Ctrl+点击、或从外部打开时浏览器会直接请求
 * :3000/form/designer → Next 门户无此页面 → 404。
 *
 * 这里按 vue-router 顶层路由的首段白名单做 307 重定向补上 /lowcode 前缀，
 * 与门户自有页面（/、/api/*、/lowcode/*）零冲突。
 */
const LOWCODE_FIRST_SEGMENTS = new Set([
  "login",
  "designer",
  "form",
  "page",
  "biz-data",
  "process",
  "system",
  "dashboard",
  "profile",
  "data-source",
  "messages",
  "404",
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const search = restoreRawSearch(req.url);

  // 门户自身控制面接口交由 Next.js 处理
  if (pathname.startsWith("/api/portal")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, BACKEND_ORIGIN));
  }

  // 低代码 SPA 深链缺 base 前缀：307 重定向补 /lowcode（保留 query）
  const firstSegment = pathname.split("/")[1] ?? "";
  if (firstSegment && LOWCODE_FIRST_SEGMENTS.has(firstSegment)) {
    const target = req.nextUrl.clone();
    target.pathname = `/lowcode${pathname}`;
    return NextResponse.redirect(target, 307);
  }

  if (pathname === "/lowcode") {
    // 用户入口 "/lowcode/" 会被 Next.js 服务器 308 重定向为 "/lowcode"
    // （默认 trailingSlash 规范化，发生在 middleware 之前，无法拦截），
    // 而 Vite 对无尾斜杠的 base 路径返回 404/"did you mean" 页面。
    // 因此 rewrite 目标必须显式带尾斜杠 "/lowcode/"：rewrite 是 Next.js
    // 服务端对源站的内部直连，不再经过尾斜杠规范化。无子路径、query
    // 已还原，无 rewrite 改写风险。
    return NextResponse.rewrite(new URL(`/lowcode/${search}`, FRONTEND_ORIGIN));
  }

  if (pathname.startsWith("/lowcode/")) {
    // 交给本地路由处理器 src/app/lowcode/[...path]/route.ts 手动反代：
    // NextResponse.rewrite 会在执行层再次改写 query（无值参数 k → k=），
    // 无法通过 middleware 层修复，详见 route.ts 头部注释
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/lowcode/:path*",
    "/lowcode",
    "/api/:path*",
    // 低代码 SPA 深链（缺 /lowcode 前缀时在 middleware 内 307 补齐）
    "/login",
    "/login/:path*",
    "/designer",
    "/designer/:path*",
    "/form/:path*",
    "/page/:path*",
    "/biz-data/:path*",
    "/process/:path*",
    "/system/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/profile",
    "/profile/:path*",
    "/data-source/:path*",
    "/messages/:path*",
    "/404",
  ],
};
