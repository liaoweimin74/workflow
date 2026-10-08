/**
 * 管理端·统计 —— StatsController 移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/stats（1 端点，挂 requireNotificationAdmin）
 * overview：totalMessages/totalRecipients/failedRetries（Java count() 返回 Long → Long→string 契约）
 */
/* mount: /api/v1/admin/notification/stats */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin } from "../../../lib/http";
import { queryOne } from "../../../lib/db";

const router = Router();
router.use(requireNotificationAdmin);

function countOf(table: string): number {
  return queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM ${table}`)!.c;
}

/** GET /overview —— 消息统计概览 */
router.get("/overview", (_req: Request, res: Response) => {
  ok(res, {
    totalMessages: String(countOf("MSG_MESSAGE")),
    totalRecipients: String(countOf("MSG_RECIPIENT")),
    failedRetries: String(countOf("MSG_DELIVERY_RETRY")),
  });
});

export default router;
