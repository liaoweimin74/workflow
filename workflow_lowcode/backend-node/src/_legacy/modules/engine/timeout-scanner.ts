/**
 * 任务超时调度器（补齐迁移缺口：节点超时 remind / escalate，engine-semantics.md F 章缺口 4）
 *
 * 设计器 UserTaskProperty 已支持配置 NodeConfig.timeout = { duration: 小时, action: 'remind'|'escalate' }，
 * Java 版从未实现调度；本模块以 setInterval 周期扫描补齐该语义：
 *  1. 仅扫描 PENDING 任务且实例 RUNNING（挂起实例不计时，对齐 Flowable 作业挂起语义）；
 *  2. deadline = START_TIME + duration 小时；未到不处理；
 *  3. 每个超时周期只触发一次（按周期窗口查 WF_TASK_REMIND 判重，任务持续滞留会按周期重复提醒）；
 *  4. action=remind   → 站内信 + SSE 通知办理人；
 *     action=escalate → 站内信 + SSE 通知办理人与全部 ROLE_ADMIN 用户，优先级 HIGH，并记审批意见 action=escalate。
 *
 * 定时器随 index.ts 启动；scanTimeouts() 导出供手动触发/测试。
 */
import { exec, query, queryOne } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import { configMapOf, loadDeployForInstance } from "../../lib/engine/engine";
import type { TaskRow } from "../../lib/engine/engine";
import { dispatchMessageEvent } from "../notification/internal";

const TASK = "WF_TASK_INST";
const INST = "WF_PROC_INST";
const SCAN_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 15_000;

export interface TimeoutHit {
  taskId: string;
  taskName: string | null;
  action: "remind" | "escalate";
  overdueHours: number;
  notified: string[];
}

/** 解析任务节点的超时配置（configMapOf 与引擎既定取配置模式一致） */
function timeoutCfgOf(task: TaskRow): { duration: number; action: "remind" | "escalate" } | null {
  const deploy = loadDeployForInstance(task.PROC_INST_ID);
  if (!deploy) return null;
  try {
    const cfg = configMapOf(deploy)[task.NODE_KEY];
    const duration = Number(cfg?.timeout?.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const action = cfg?.timeout?.action === "escalate" ? "escalate" : "remind";
    return { duration, action };
  } catch {
    return null; // 配置解析失败不阻塞扫描
  }
}

/** 当前超时周期起点（START_TIME + (period-1)*duration 小时），用于周期判重；与 nowStr 同为本地时帧 */
function fmtLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function periodStartOf(startIso: string, durationHours: number): string {
  const startMs = new Date(startIso.replace(" ", "T")).getTime();
  const elapsed = Date.now() - startMs;
  const period = Math.floor(elapsed / (durationHours * 3600_000)); // ≥1（已超时）
  return fmtLocal(startMs + (period - 1) * durationHours * 3600_000);
}

function adminIds(): string[] {
  return query<{ ID: number }>(
    "SELECT u.ID FROM SYS_USER u JOIN SYS_USER_ROLE ur ON ur.USER_ID = u.ID JOIN SYS_ROLE r ON r.ID = ur.ROLE_ID WHERE r.ROLE_CODE = 'ROLE_ADMIN' AND u.STATUS = 1 AND u.IS_DELETED = 0",
  ).map((r) => String(r.ID));
}

function overdueHoursOf(startIso: string): number {
  const startMs = new Date(startIso.replace(" ", "T")).getTime();
  return Math.floor((Date.now() - startMs) / 3600_000);
}

function fire(task: TaskRow, cfg: { duration: number; action: "remind" | "escalate" }, instName: string): TimeoutHit {
  const assignee = String(task.ASSIGNEE ?? task.OWNER ?? "");
  const recipients = cfg.action === "escalate" ? Array.from(new Set([assignee, ...adminIds()])).filter(Boolean) : [assignee].filter(Boolean);
  const hours = overdueHoursOf(task.START_TIME ?? nowStr());
  const prefix = cfg.action === "escalate" ? "任务超时升级" : "任务超时提醒";
  const title = `${prefix} — ${instName}`;
  const content = {
    text: `任务「${task.NODE_NAME ?? task.NODE_KEY}」已滞留 ${hours} 小时（超时阈值 ${cfg.duration} 小时），请尽快处理。`,
    taskName: task.NODE_NAME ?? task.NODE_KEY,
    processName: instName,
    overdueHours: hours,
    thresholdHours: cfg.duration,
  };
  const saved = dispatchMessageEvent(
    {
      senderType: "SYSTEM",
      title,
      content,
      priority: cfg.action === "escalate" ? "HIGH" : "NORMAL",
      category: "WORKFLOW",
      messageType: "TIMEOUT",
      linkJson: { type: "task", taskId: task.ID, processInstanceId: task.PROC_INST_ID },
    },
    recipients,
    ["IN_APP"],
  );
  // 催办留痕（REMIND_FROM=timeout 前缀与人工催办区分，周期判重依赖它）
  exec(
    "INSERT INTO WF_TASK_REMIND (ID, PROCESS_INSTANCE_ID, REMIND_FROM, REMIND_TIME, REMIND_TO, TASK_ID, TENANT_ID) VALUES (?,?,?,?,?,?,?)",
    [uuid32(), task.PROC_INST_ID, `timeout:${cfg.action}`, nowStr(), assignee, task.ID, task.TENANT_ID ?? "default"],
  );
  if (cfg.action === "escalate") {
    exec(
      "INSERT INTO WF_TASK_COMMENT (ID, ACTION, COMMENT, CREATED_AT, PROCESS_INSTANCE_ID, TASK_ID, TENANT_ID, USER_ID) VALUES (?,?,?,?,?,?,?,?)",
      [uuid32(), "escalate", `任务超时 ${hours} 小时，已升级通知管理员（消息 #${saved["id"] ?? ""}）`, nowStr(), task.PROC_INST_ID, task.ID, task.TENANT_ID ?? "default", assignee || null],
    );
  }
  return { taskId: task.ID, taskName: task.NODE_NAME, action: cfg.action, overdueHours: hours, notified: recipients };
}

/** 扫描一轮超时任务；返回本轮触发清单（含 remind/escalate） */
export function scanTimeouts(): TimeoutHit[] {
  const tasks = query<TaskRow & { INST_STATUS?: string; INST_NAME?: string }>(
    `SELECT t.*, i.STATUS AS INST_STATUS,
            COALESCE(d2.PROC_NAME, i.PROC_NAME, i.PROC_KEY) AS INST_NAME
     FROM ${TASK} t
     JOIN ${INST} i ON i.ID = t.PROC_INST_ID
     LEFT JOIN WF_PROC_DEPLOY d2 ON d2.ID = COALESCE(i.DEPLOY_ID,
       (SELECT dd.ID FROM WF_PROC_DEPLOY dd WHERE dd.PROC_KEY = i.PROC_KEY ORDER BY dd.VERSION DESC LIMIT 1))
     WHERE t.STATUS = 'PENDING' AND i.STATUS = 'RUNNING'`,
  );
  const hits: TimeoutHit[] = [];
  for (const t of tasks) {
    const cfg = timeoutCfgOf(t);
    if (!cfg) continue;
    const start = t.START_TIME ?? "";
    if (!start) continue;
    const deadlineMs = new Date(start.replace(" ", "T")).getTime() + cfg.duration * 3600_000;
    if (Date.now() < deadlineMs) continue; // 未超时
    // 周期判重：当前周期窗口内已有 timeout 留痕则跳过
    const periodStart = periodStartOf(start, cfg.duration);
    const dup = queryOne<{ C: number }>(
      "SELECT COUNT(*) C FROM WF_TASK_REMIND WHERE TASK_ID = ? AND REMIND_FROM LIKE 'timeout%' AND REMIND_TIME >= ?",
      [t.ID, periodStart],
    );
    if ((dup?.C ?? 0) > 0) continue;
    try {
      hits.push(fire(t, cfg, t.INST_NAME ?? t.PROC_KEY ?? ""));
    } catch (e) {
      console.error(`[timeout-scanner] fire failed task=${t.ID}:`, (e as Error).message);
    }
  }
  return hits;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** 启动超时扫描（60s 周期，首次延迟 15s） */
export function startTimeoutScanner(): void {
  if (timer) return;
  setTimeout(() => {
    timer = setInterval(() => {
      try {
        const hits = scanTimeouts();
        for (const h of hits) {
          console.log(`[timeout-scanner] ${h.action} task=${h.taskId} overdue=${h.overdueHours}h notified=${h.notified.join(",")}`);
        }
      } catch (e) {
        console.error("[timeout-scanner] scan failed:", (e as Error).message);
      }
    }, SCAN_INTERVAL_MS);
    console.log(`[timeout-scanner] started (every ${SCAN_INTERVAL_MS / 1000}s)`);
  }, INITIAL_DELAY_MS);
}
