/**
 * /lowcode（裸路径，无子段）→ /vite-app/ 307 跳转（Task 25）。
 * [...path] 捕获段要求至少一个子段，裸路径需单独处理；
 * 门户历史链接 /lowcode/ 先被 Next 规范化为 /lowcode（308），落地在此。
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request): Response {
  return Response.redirect(new URL("/vite-app/", new URL(req.url).origin).toString(), 307);
}

export const POST = GET;
export const HEAD = GET;
