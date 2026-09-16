/**
 * dashboard.ts — /api/v1/dashboard/stats（Task 13-8 补齐：首页看板）
 * 对齐 DashboardController：5 KPI + 近 7 日趋势（date "M/d"）+ statusShare{running,finished}。
 * 统计口径（Flowable 查询 → SQLite 等价）：
 *  - todoCount：pending 且（assignee=me 或候选含我）且实例 running
 *  - doneCount：completed/cancelled 且 assignee=me（Flowable finished 含 deleted→cancelled）
 *  - runningCount：STATUS='running' 实例数
 *  - definitionCount：latest version 的部署定义数（按 KEY_ 去重取最大版本）
 *  - startedByMeCount：START_USER_ID=me 全量实例
 *  - trend：近 7 日按 START_TIME 自然日计数（本地时区，date 格式 "M/d"）
 *  - statusShare：running=max(全部-running终态, runningCount)；finished=全部-running终态
 */
import { Router } from 'express';
import { all, one } from '../lib/db';
import { authGuard, ah, ok, type AuthedRequest } from '../lib/http';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/api/v1/dashboard/stats',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const userId = typeof q['userId'] === 'string' && q['userId'].trim() !== '' ? q['userId'].trim() : null;

    const todoCount = userId
      ? Number(one(
          `SELECT COUNT(*) AS C FROM WF_TASK_INST T JOIN WF_PROC_INST P ON P.ID = T.PROC_INST_ID
           WHERE T.STATUS = 'pending' AND P.STATUS = 'running' AND (T.ASSIGNEE = ? OR EXISTS (SELECT 1 FROM WF_TASK_CANDIDATE C WHERE C.TASK_ID = T.ID AND C.TYPE='user' AND C.CANDIDATE_ID = ?))`,
          [userId, userId],
        )?.['C'] ?? 0)
      : 0;

    const doneCount = userId
      ? Number(one(
          `SELECT COUNT(*) AS C FROM WF_TASK_INST WHERE STATUS IN ('completed','cancelled') AND ASSIGNEE = ?`,
          [userId],
        )?.['C'] ?? 0)
      : 0;

    const runningCount = Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST WHERE STATUS = 'running'`)?.['C'] ?? 0);

    const definitionCount = Number(
      one(`SELECT COUNT(*) AS C FROM (SELECT KEY_, MAX(VERSION) AS MV FROM WF_PROC_DEPLOY GROUP BY KEY_)`)?.['C'] ?? 0,
    );

    const startedByMeCount = userId
      ? Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST WHERE START_USER_ID = ?`, [userId])?.['C'] ?? 0)
      : 0;

    // 近 7 日趋势（本地时区自然日；SQLite START_TIME 为 "yyyy-MM-dd HH:mm:ss" 文本）
    const trend: Array<{ date: string; count: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const p = (n: number) => String(n).padStart(2, '0');
      const dayStart = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`;
      const dayEnd = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 23:59:59`;
      const cnt = Number(
        one(`SELECT COUNT(*) AS C FROM WF_PROC_INST WHERE START_TIME >= ? AND START_TIME <= ?`, [dayStart, dayEnd])?.['C'] ?? 0,
      );
      trend.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, count: cnt });
    }

    // 状态占比：Flowable historic all = 全部实例（HI 表即终态+在途快照）；finished = 有 END_TIME 的
    const startedTotal = Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST`)?.['C'] ?? 0);
    const finishedTotal = Number(one(`SELECT COUNT(*) AS C FROM WF_PROC_INST WHERE STATUS IN ('completed','terminated')`)?.['C'] ?? 0);
    const runningTotal = Math.max(startedTotal - finishedTotal, runningCount);

    ok(res, {
      todoCount,
      doneCount,
      runningCount,
      definitionCount,
      startedByMeCount,
      trend,
      statusShare: { running: runningTotal, finished: finishedTotal },
    });
  }),
);
