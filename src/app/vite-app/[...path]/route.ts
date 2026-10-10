/**
 * Vite 前端（localhost:5173，FRONTEND_BASE=/vite-app/ 子路径模式）手动反向代理。
 *
 * Task 25：为什么不用 next.config.ts 的 rewrites（/vite-app/:path*）：
 * 与 /lowcode/[...path]/route.ts 当初的教训完全相同——Next.js 服务器会把
 * query 里的无值参数 "k" 重序列化成 "k="（?vue&type=style&index=0&lang.css →
 * ?vue=&type=style&index=0&lang.css=）。Vite 不再把该 URL 识别为 Vue SFC
 * 样式模块（不以 .css 结尾），返回原始 CSS 而非 JS 包装模块；浏览器把它当
 * ES Module 解析即报 "SyntaxError: Unexpected token '.'"（用户实测：
 * FnEditor.vue:2），整个模块图加载失败 → 白屏。
 *
 * 因此复刻 /lowcode 的方案：路由处理器在 middleware 放行后接手，
 * 用 restoreRawSearch 还原原始 query，再手动 fetch 源站并透传响应（流式），
 * 彻底绕开 rewrite 的 query 改写。文件系统路由优先级高于 afterFiles
 * rewrites，本处理器自然接管全部 /vite-app/* 请求。
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FRONTEND_ORIGIN = "http://localhost:5173";

/**
 * 还原被 Next.js 服务器规范化前的原始 query（与 /lowcode 代理同逻辑）。
 * 所有空值参数 "k=" → "k"；对常规消费者两者语义等价（均解析为空串）。
 */
function restoreRawSearch(url: string): string {
  const qIndex = url.indexOf("?");
  if (qIndex < 0) return "";
  const search = url.slice(qIndex + 1);
  if (!search) return "";
  return `?${search.replace(/(^|&)([^&=]+)=(&|$)/g, "$1$2$3")}`;
}

// 逐跳头（RFC 7230）：不应在代理间透传
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function filterHeaders(headers: Headers, strip: string[]): [string, string][] {
  const out: [string, string][] = [];
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) return;
    if (strip.includes(lower)) return;
    out.push([key, value]);
  });
  return out;
}

async function proxy(req: Request): Promise<Response> {
  const upstreamUrl = new URL(req.url);
  const search = restoreRawSearch(req.url);
  const target = `${FRONTEND_ORIGIN}${upstreamUrl.pathname}${search}`;

  // 请求体为空时不能带 body（fetch 会报错）
  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const upstreamHeaders = new Headers(
    filterHeaders(req.headers, ["host", "content-length", "accept-encoding"]),
  );

  const upstream = await fetch(target, {
    method: req.method,
    headers: upstreamHeaders,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
    // @ts-expect-error duplex 是 undici 扩展参数
    duplex: "half",
    cache: "no-store",
  });

  // 源站响应头原样透传（去掉逐跳头与长度/编码头，由运行时按实际 body 处理）
  const respHeaders = new Headers(
    filterHeaders(upstream.headers, ["content-length", "content-encoding"]),
  );

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
