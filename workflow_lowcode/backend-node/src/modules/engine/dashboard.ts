/**
 * 看板统计——DashboardController 移植（Task 13-6）
 * mount 前缀：/api/v1/dashboard（1 端点：GET /stats）
 * 对齐 Java 输出：todoCount/doneCount/runningCount/definitionCount/startedByMeCount + 近 7 日趋势。
 */
/* mount: /api/v1/dashboard */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { query, queryOne } from "../../lib/db";

const router = Router();

router.get("/stats", (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || req.loginUser?.userId || "";

  const todoCount = userId
    ? (queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_TASK_INST WHERE ASSIGNEE = ? AND STATUS = 'PENDING'", [userId])?.C ?? 0)
    : 0;
  const doneCount = userId
    ? (queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_TASK_INST WHERE (COALESCE(COMPLETED_BY, ASSIGNEE) = ?) AND STATUS = 'COMPLETED'", [userId])?.C ?? 0)
    : 0;
  const runningCount = queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_PROC_INST WHERE STATUS = 'RUNNING'")?.C ?? 0;
  // definitionCount：latestVersion 语义 = 按 key 分组取最新版的个数
  const definitionCount = queryOne<{ C: number }>(
    "SELECT COUNT(DISTINCT PROC_KEY) C FROM WF_PROC_DEPLOY d WHERE VERSION = (SELECT MAX(VERSION) FROM WF_PROC_DEPLOY x WHERE x.PROC_KEY = d.PROC_KEY)")?.C ?? 0;
  const startedByMeCount = userId
    ? (queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_PROC_INST WHERE START_USER = ?", [userId])?.C ?? 0)
    : 0;

  // 近 7 日发起趋势
  const trend: Array<{ date: string; started: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const day = d.toISOString().slice(0, 10);
    const next = new Date(d.getTime() + 86400_000).toISOString().slice(0, 10);
    const c = queryOne<{ C: number }>(
      "SELECT COUNT(*) C FROM WF_PROC_INST WHERE START_TIME >= ? AND START_TIME < ?", [`${day} 00:00:00`, `${next} 00:00:00`])?.C ?? 0;
    trend.push({ date: day, started: c });
  }

  ok(res, {
    todoCount, doneCount, runningCount, definitionCount, startedByMeCount,
    startedTrend: trend,
  });
});

export default router;
