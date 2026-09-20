import { NextRequest, NextResponse } from "next/server";
import {
  getEngineStatus,
  switchBackendEngine,
  startJavaBuild,
  collectStatus,
  type EngineChoice,
} from "@/lib/service-supervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portal/engine — 查询当前引擎与 Java 版可用性 */
export async function GET() {
  const status = getEngineStatus();
  return NextResponse.json({ code: 200, msg: "ok", data: status });
}

/**
 * POST /api/portal/engine
 * body: { action: "switch", engine: "node" | "java" } — 切换后端引擎（杀 8080 旧进程并按新引擎拉起）
 * body: { action: "build-java" }                      — 后台一键构建 Java 版（JDK+Maven+jar）
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; engine?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 400, msg: "请求体必须是 JSON", data: null }, { status: 400 });
  }
  if (body.action === "build-java") {
    const r = startJavaBuild();
    return NextResponse.json({
      code: r.started ? 200 : 400,
      msg: r.started
        ? "Java 版构建已启动（后台进行，约 10~20 分钟），可稍后刷新查看进度"
        : (r.reason ?? "无法启动构建"),
      data: getEngineStatus(),
    });
  }
  if (body.action === "switch") {
    const engine = body.engine as EngineChoice | undefined;
    if (engine !== "node" && engine !== "java") {
      return NextResponse.json(
        { code: 400, msg: "engine 必须是 node 或 java", data: null },
        { status: 400 },
      );
    }
    const r = await switchBackendEngine(engine);
    const services = await collectStatus();
    return NextResponse.json({
      code: r.ok ? 200 : 400,
      msg: r.message,
      data: { services, engine: getEngineStatus() },
    });
  }
  return NextResponse.json(
    { code: 400, msg: "未知 action，支持 switch / build-java", data: null },
    { status: 400 },
  );
}
