import { NextRequest, NextResponse } from "next/server";
import { ensureAllServices, collectStatus } from "@/lib/service-supervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/services — 查询平台服务运行状态 */
export async function GET() {
  const status = await collectStatus();
  return NextResponse.json({ code: 200, msg: "ok", data: status });
}

/** POST /api/portal/services — 确保服务已拉起（幂等），并返回最新状态 */
export async function POST(_req: NextRequest) {
  const status = await ensureAllServices();
  return NextResponse.json({ code: 200, msg: "ok", data: status });
}
