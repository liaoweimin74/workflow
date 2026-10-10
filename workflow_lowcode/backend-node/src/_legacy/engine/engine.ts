/**
 * 自研工作流引擎核心运行时（Task 13-6）——替代 Flowable。
 * 语义依据 docs/migration/engine-semantics.md C 章（40 项运行时语义清单）。
 *
 * 模型：令牌驱动。WF_EXEC_TOKEN 一行 = 一个执行流位置；
 *   - userTask 到达 → 落任务（WF_TASK_INST + WF_TASK_CANDIDATE），令牌等待；
 *   - MI 会签/或签/依次 → 每个审批人一个子令牌（MI_GROUP_ID 分组计数）；
 *   - 网关 → exclusive 单令牌选线 / parallel·inclusive 分叉多令牌与汇合等待；
 *   - endEvent → 令牌收敛，全部 ACTIVE 令牌归零则实例完结。
 * 历史轨迹 WF_ACTIVITY_INST 完整记录节点与 sequenceFlow（对齐 Flowable ACT_HI_ACTINST 形态）。
 */
import { exec, query, queryOne, tx } from "../db";
import { nowStr, uuid32 } from "../dialect";
import { EngineException, BusinessException } from "../errors";
import { evalExpression, resolveVarRef, type UelValue } from "./expression";
import { parseBpmn, parseNodeConfigs, parseProcessConfig } from "./parser";
import type { DiagramIR, FlowIR, NodeConfig, NodeIR, ProcessConfig } from "./types";

// ---------- IR 缓存（进程内，部署快照不可变） ----------
const irCache = new Map<string, DiagramIR>();

export interface DeployRow {
  ID: string; DRAFT_ID: string; PROC_KEY: string; PROC_NAME: string | null; VERSION: number;
  DIAGRAM_JSON: string | null; NODE_CONFIGS_JSON: string | null; PROCESS_CONFIG_JSON: string | null;
  DEPLOYED_AT: string | null; DEPLOYED_BY: string | null; TENANT_ID: string | null;
}

export function loadDeployById(id: string): DeployRow | null {
  return queryOne<DeployRow>("SELECT * FROM WF_PROC_DEPLOY WHERE ID = ?", [id]);
}

export function loadLatestDeployByKey(procKey: string): DeployRow | null {
  // 历史实例无 DEPLOY_ID 时的兜底：按 PROC_KEY 找最新版本
  return queryOne<DeployRow>("SELECT * FROM WF_PROC_DEPLOY WHERE PROC_KEY = ? ORDER BY VERSION DESC LIMIT 1", [procKey]);
}

export function loadDeployForInstance(instId: string): DeployRow | null {
  const inst = queryOne<{ DEPLOY_ID: string | null; PROC_KEY: string }>(
    "SELECT DEPLOY_ID, PROC_KEY FROM WF_PROC_INST WHERE ID = ?", [instId]);
  if (!inst) return null;
  return inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID) : loadLatestDeployByKey(inst.PROC_KEY);
}

export function getIR(deploy: DeployRow): DiagramIR {
  const cached = irCache.get(deploy.ID);
  if (cached) return cached;
  const xml = deploy.DIAGRAM_JSON ?? "";
  const ir = parseBpmn(
    typeof xml === "string" ? xml : String(xml),
    parseNodeConfigs(deploy.NODE_CONFIGS_JSON),
    parseProcessConfig(deploy.PROCESS_CONFIG_JSON),
  );
  irCache.set(deploy.ID, ir);
  return ir;
}

export function nodeConfigOf(ir: DiagramIR, nodeId: string): NodeConfig | null {
  return (ir.process && (ir as unknown as { __cfg?: Record<string, NodeConfig> }).__cfg?.[nodeId]) ?? null;
}

/** NODE_CONFIGS_JSON 的访问辅助：deploy 层面保存 nodeId→config */
export function configMapOf(deploy: DeployRow): Record<string, NodeConfig> {
  return parseNodeConfigs(deploy.NODE_CONFIGS_JSON);
}

// ---------- 实例/令牌/任务基础行 ----------

export interface InstRow {
  ID: string; PROC_KEY: string; PROC_NAME: string | null; PROC_VERSION: number | null;
  DRAFT_ID: string | null; DEPLOY_ID: string | null; BUSINESS_KEY: string | null; TITLE: string | null;
  START_USER: string | null; START_TIME: string | null; END_TIME: string | null; STATUS: string;
  DELETE_REASON: string | null; TENANT_ID: string | null; VARIABLES_JSON: string | null;
  CURRENT_NODE_KEYS: string | null; FORM_DATA_ID: string | null;
  /** callActivity 子流程链接（Task 16）：子实例 → 父实例 / 父图中调用活动节点 */
  PARENT_ID: string | null; PARENT_NODE_KEY: string | null;
}

export interface TokenRow {
  ID: string; PROC_INST_ID: string; NODE_KEY: string; STATUS: string;
  MI_GROUP_ID: string | null; MI_INDEX: number | null; CREATED_AT: string;
  /** 嵌套 subProcess 作用域链（Task 17）："/"分隔祖先 subProcess 节点 id；NULL=顶层 */
  SCOPE: string | null;
}

export interface TaskRow {
  ID: string; PROC_INST_ID: string; PROC_KEY: string | null; NODE_KEY: string; NODE_NAME: string | null;
  ASSIGNEE: string | null; OWNER: string | null; CANDIDATES_JSON: string | null; STATUS: string;
  PRIORITY: number | null; CLAIM_TIME: string | null; START_TIME: string | null; END_TIME: string | null;
  COMPLETED_BY: string | null; DELETE_REASON: string | null; DELEGATION: string | null;
  FORM_DEF_ID: string | null; MI_GROUP_ID: string | null; MI_INDEX: number | null; MI_TOTAL: number | null;
  TENANT_ID: string | null;
}

export function getInst(instId: string): InstRow {
  const inst = queryOne<InstRow>("SELECT * FROM WF_PROC_INST WHERE ID = ?", [instId]);
  if (!inst) throw new BusinessException("流程实例不存在", 404);
  return inst;
}

export function getVariables(inst: InstRow | { VARIABLES_JSON: string | null }): Record<string, UelValue> {
  if (!inst.VARIABLES_JSON) return {};
  try {
    const v = JSON.parse(inst.VARIABLES_JSON);
    return typeof v === "object" && v !== null ? v : {};
  } catch { return {}; }
}

function saveVariables(instId: string, vars: Record<string, UelValue>): void {
  exec("UPDATE WF_PROC_INST SET VARIABLES_JSON = ? WHERE ID = ?", [JSON.stringify(vars), instId]);
}

function setVar(instId: string, name: string, value: UelValue): void {
  const inst = queryOne<{ VARIABLES_JSON: string | null }>("SELECT VARIABLES_JSON FROM WF_PROC_INST WHERE ID = ?", [instId]);
  const vars = getVariables({ VARIABLES_JSON: inst?.VARIABLES_JSON ?? null });
  vars[name] = value;
  saveVariables(instId, vars);
}

export function getTask(taskId: string): TaskRow {
  const t = queryOne<TaskRow>("SELECT * FROM WF_TASK_INST WHERE ID = ?", [taskId]);
  if (!t) throw new BusinessException("任务不存在", 404);
  return t;
}

function activeTokens(instId: string): TokenRow[] {
  return query<TokenRow>("SELECT * FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE' ORDER BY CREATED_AT, ID", [instId]);
}

function evalCtx(inst: InstRow, extra?: Record<string, UelValue>): Record<string, UelValue> {
  return { ...getVariables(inst), ...(extra ?? {}) };
}

// ---------- 轨迹 / 评论 ----------

function recordActivity(inst: InstRow, ir: DiagramIR, nodeKey: string, status: string, opts: {
  endTime?: string | null; assignee?: string | null; action?: string | null; comment?: string | null; miGroupId?: string | null;
} = {}): string {
  const node = ir.nodeById[nodeKey];
  const id = uuid32();
  const now = nowStr();
  exec(
    `INSERT INTO WF_ACTIVITY_INST (ID, PROC_INST_ID, NODE_KEY, NODE_NAME, NODE_TYPE, STATUS, START_TIME, END_TIME, ASSIGNEE, ACTION, COMMENT, MI_GROUP_ID, TENANT_ID)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, inst.ID, nodeKey, node?.name ?? nodeKey, node?.type ?? "sequenceFlow", status,
      opts.endTime ? now : now, opts.endTime ?? null, opts.assignee ?? null, opts.action ?? null, opts.comment ?? null, opts.miGroupId ?? null, inst.TENANT_ID ?? "default"],
  );
  return id;
}

function completeRunningActivities(instId: string, nodeKey: string, status = "COMPLETED", miGroupId?: string | null): void {
  if (miGroupId) {
    exec("UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = ? WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'RUNNING' AND MI_GROUP_ID = ?",
      [nowStr(), status, instId, nodeKey, miGroupId]);
  } else {
    exec("UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = ? WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'RUNNING'",
      [nowStr(), status, instId, nodeKey]);
  }
}

function addComment(inst: InstRow, taskId: string, userId: string, action: string, comment: string | null, targetUserId?: string | null): void {
  exec(
    `INSERT INTO WF_TASK_COMMENT (ID, ACTION, COMMENT, CREATED_AT, PROCESS_INSTANCE_ID, TARGET_USER_ID, TASK_ID, TENANT_ID, USER_ID)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [uuid32(), action, comment, nowStr(), inst.ID, targetUserId ?? null, taskId, inst.TENANT_ID ?? "default", userId],
  );
}

// ---------- 后置逻辑（backend logic 执行器：http 实装 / bean·script 记录 TODO） ----------

const BACKEND_BEAN_REGISTRY: Array<{ beanName: string; beanClass: string; description: string; methods: string[] }> = [
  { beanName: "httpExecutor", beanClass: "builtin", description: "HTTP 后置逻辑（内置）", methods: ["invoke"] },
  { beanName: "scriptExecutor", beanClass: "builtin", description: "Groovy→JS 脚本后置逻辑（内置示例）", methods: ["eval"] },
];

function runBackendLogic(inst: InstRow, ir: DiagramIR, deploy: DeployRow, nodeId: string, trigger: "ENTER" | "COMPLETE", ctx: Record<string, UelValue>): void {
  const cfg = configMapOf(deploy)[nodeId];
  const items = cfg?.backendLogic ?? [];
  const procCfg = ir.processConfig;
  // __PROCESS__ 级 backendLogic 目前设计器不存在，预留
  for (const item of items) {
    if (!item.enabled || item.trigger !== trigger) continue;
    try {
      if (item.type === "http" && item.http) {
        // {{var}} 占位替换（对齐 VariableResolver），执行后 resultVar 回写
        const url = new URL(subst(item.http.url, ctx));
        for (const q of item.http.queryParams ?? []) url.searchParams.set(q.target, String(ctx[q.source] ?? ""));
        const method = (item.http.method ?? "GET").toUpperCase();
        let body: string | undefined;
        if (["POST", "PUT", "DELETE"].includes(method)) {
          const bodyObj: Record<string, unknown> = {};
          for (const b of item.http.bodyParams ?? []) bodyObj[b.target] = ctx[b.source] ?? null;
          body = JSON.stringify(bodyObj);
        }
        // 同步 fetch 在 bun 下可 await——引擎为同步流，采用 fire-and-forget + TODO：重试/超时对齐后续补
        void fetch(url, { method, headers: item.http.headers, body }).then(async (r) => {
          const text = await r.text();
          if (item.resultVar) setVar(inst.ID, item.resultVar, text);
        }).catch(() => {
          if (item.errorAction === "FAIL_FLOW") console.error(`[engine] backendLogic FAIL_FLOW http ${url}`);
        });
      } else if (item.type === "bean") {
        // TODO: 白名单反射调用对齐 @BackendLogicBean；当前记录日志
        console.log(`[engine] backendLogic bean ${item.bean?.beanName}.${item.bean?.methodName} @ ${nodeId}`);
        if (item.resultVar) setVar(inst.ID, item.resultVar, null);
      } else if (item.type === "script") {
        // TODO: groovy→js 转译执行；当前记录日志
        console.log(`[engine] backendLogic script(${item.script?.language ?? "groovy"}) @ ${nodeId}`);
        if (item.resultVar) setVar(inst.ID, item.resultVar, null);
      }
    } catch (e) {
      if (item.errorAction === "FAIL_FLOW") throw new EngineException(`后置逻辑执行失败: ${(e as Error).message}`);
      console.error("[engine] backendLogic error(IGNORE_CONTINUE):", (e as Error).message);
    }
  }
  void procCfg;
}

function subst(tpl: string, ctx: Record<string, UelValue>): string {
  return tpl.replace(/\{\{\s*([\w$]+)\s*\}\}/g, (_m, name: string) => {
    const v = ctx[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

// ---------- 任务分配（C.2 分配规则） ----------

function isInitiatorNode(node: NodeIR): boolean {
  return node.nodeRole === "initiator" || node.assignee === "${initiator}";
}

interface Assignment { assignee: string | null; candidates: string[]; mi: { userId: string; index: number }[]; }

/**
 * dept_head 主管解析（Task 16，Node 版增强——Java 从未实现）：
 * 发起人所在组织主管 → 无主管沿父组织逐级向上找（最多 10 层）。
 * 返回用户 ID 字符串（SYS_* 主键 Long→String 语义）。
 */
export function resolveDeptHead(userId: string): string | null {
  const u = queryOne<{ ORG_ID: string | null }>("SELECT ORG_ID FROM SYS_USER WHERE ID = ? AND IS_DELETED = 0", [String(userId)]);
  let orgId = u?.ORG_ID != null ? String(u.ORG_ID) : null;
  for (let hops = 0; orgId && hops < 10; hops++) {
    const org = queryOne<{ LEADER_ID: string | null; PARENT_ID: string | null }>(
      "SELECT LEADER_ID, PARENT_ID FROM SYS_ORGANIZATION WHERE ID = ? AND IS_DELETED = 0", [orgId]);
    if (!org) return null;
    if (org.LEADER_ID) return String(org.LEADER_ID);
    orgId = org.PARENT_ID != null ? String(org.PARENT_ID) : null;
  }
  return null;
}

function resolveAssignment(inst: InstRow, deploy: DeployRow, node: NodeIR): Assignment {
  const vars = getVariables(inst);
  const cfg = configMapOf(deploy)[node.id];
  const approval = cfg?.approval;
  const ctx = evalCtx(inst);

  // 1) 配置 multiMode（会签/或签/依次）→ MI：approverList = approval.userIds
  if (approval?.multiMode && String(approval.multiMode) !== "" && approval.userIds?.length) {
    return { assignee: null, candidates: [], mi: approval.userIds.map((u, i) => ({ userId: String(u), index: i + 1 })) };
  }
  // 1.5) 配置 type=dept_head：发起人所在部门主管（逐级向上；Node 版增强，见 resolveDeptHead）
  if (approval?.type === "dept_head") {
    const starterId = String((vars["initiator"] as string | null) ?? inst.START_USER ?? "");
    const head = starterId ? resolveDeptHead(starterId) : null;
    if (head) return { assignee: head, candidates: [], mi: [] };
    // 找不到主管：宽松落空任务，由管理员在管理端认领（与 expression 失败同策略）
  }
  // 2) 配置 userIds：单人 assignee / 多人候选（对齐 Java：设计器老配置无 type 字段，仅凭 userIds 分配）
  if (approval?.userIds?.length) {
    const ids = approval.userIds.map(String);
    if (ids.length === 1) return { assignee: ids[0], candidates: [], mi: [] };
    return { assignee: null, candidates: ids, mi: [] };
  }
  // 2.5) 配置 expression：${var} 变量表达式求值出审批人（设计器"表达式"分配；Java 未实现，此为 Node 版增强）
  const expr = (approval?.expression ?? "") as string;
  if (expr && expr.trim()) {
    const resolved = resolveVarRef(expr.trim(), ctx);
    if (resolved) return { assignee: resolved, candidates: [], mi: [] };
    // 表达式求值失败：宽松落空（与 XML assignee 变量缺失一致），由管理员在管理端认领
  }
  // 3) XML 属性：assignee（变量或固定 ID）
  if (node.assignee) {
    const resolved = resolveVarRef(node.assignee, ctx);
    if (resolved !== null) return { assignee: resolved, candidates: [], mi: [] };
    // ${manager} 变量缺失：Flowable 会以异常失败；这里宽松落到候选空任务（TODO 对齐 FAIL）
    return { assignee: null, candidates: [], mi: [] };
  }
  // 4) XML candidateUsers
  if (node.candidateUsers?.length) {
    const ids = node.candidateUsers.map((u) => resolveVarRef(u, ctx) ?? u);
    if (ids.length === 1) return { assignee: ids[0], candidates: [], mi: [] };
    return { assignee: null, candidates: ids, mi: [] };
  }
  void vars;
  return { assignee: null, candidates: [], mi: [] };
}

function taskFormDefId(deploy: DeployRow, ir: DiagramIR, nodeId: string): string | null {
  const cfg = configMapOf(deploy)[nodeId];
  return cfg?.form?.formDefId ?? ir.processConfig?.form?.formDefId ?? null;
}

function createTask(inst: InstRow, node: NodeIR, a: { assignee?: string | null; candidates?: string[]; miGroupId?: string | null; miIndex?: number | null; miTotal?: number | null }): TaskRow {
  const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
  const ir = getIR(deploy);
  const id = uuid32();
  const now = nowStr();
  const candidates = a.candidates ?? [];
  exec(
    `INSERT INTO WF_TASK_INST (ID, PROC_INST_ID, PROC_KEY, NODE_KEY, NODE_NAME, ASSIGNEE, OWNER, CANDIDATES_JSON, STATUS, PRIORITY, START_TIME, FORM_DEF_ID, MI_GROUP_ID, MI_INDEX, MI_TOTAL, TENANT_ID)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, inst.ID, inst.PROC_KEY, node.id, node.name ?? node.id, a.assignee ?? null, null,
      candidates.length ? JSON.stringify(candidates) : null, "PENDING", null, now,
      taskFormDefId(deploy, ir, node.id), a.miGroupId ?? null, a.miIndex ?? null, a.miTotal ?? null, inst.TENANT_ID ?? "default"],
  );
  for (const uid of candidates) {
    exec("INSERT INTO WF_TASK_CANDIDATE (ID, TASK_ID, PROC_INST_ID, USER_ID, CREATED_AT) VALUES (?,?,?,?,?)",
      [uuid32(), id, inst.ID, uid, now]);
  }
  const task = queryOne<TaskRow>("SELECT * FROM WF_TASK_INST WHERE ID = ?", [id])!;
  recordActivity(inst, ir, node.id, "RUNNING", { assignee: a.assignee ?? null, miGroupId: a.miGroupId ?? null });
  return task;
}

// ---------- 核心推进 ----------

function moveToken(inst: InstRow, ir: DiagramIR, token: TokenRow, flow: FlowIR): void {
  recordActivity(inst, ir, flow.id, "COMPLETED", { endTime: nowStr() });
  exec("UPDATE WF_EXEC_TOKEN SET NODE_KEY = ? WHERE ID = ?", [flow.targetRef, token.ID]);
  token.NODE_KEY = flow.targetRef;
}

function setTokenStatus(tokenId: string, status: string): void {
  exec("UPDATE WF_EXEC_TOKEN SET STATUS = ? WHERE ID = ?", [status, tokenId]);
}

function finishInstance(inst: InstRow, ir: DiagramIR, deploy: DeployRow): void {
  const remaining = queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE'", [inst.ID]);
  if ((remaining?.C ?? 0) > 0) return;
  const now = nowStr();
  exec("UPDATE WF_PROC_INST SET STATUS = 'COMPLETED', END_TIME = ?, CURRENT_NODE_KEYS = NULL WHERE ID = ?", [now, inst.ID]);
  // endEvent 节点 COMPLETE 后置逻辑（对齐 ACTIVITY_COMPLETED(endEvent)）
  const endNodes = ir.process.nodes.filter((n) => n.type === "endEvent");
  for (const n of endNodes) runBackendLogic(inst, ir, deploy, n.id, "COMPLETE", evalCtx(inst));
  // callActivity 语义（Task 16）：子实例完结 → outParams 回写父实例 + 父令牌离开调用活动继续推进
  if (inst.PARENT_ID) resumeParentAfterChild(getInst(inst.ID));
}

/** 默认出线：无条件的第一条（-exclusiveGateway 兜底语义） */
function defaultOut(ir: DiagramIR, nodeId: string): FlowIR | null {
  const outs = ir.outgoing[nodeId] ?? [];
  return outs.find((f) => !f.condition) ?? outs[0] ?? null;
}

// ---------- callActivity 子流程展开（Task 16，对齐 Flowable CallActivityBehavior） ----------

function calledElementOf(deploy: DeployRow, ir: DiagramIR, nodeId: string): string | null {
  const cfg = configMapOf(deploy)[nodeId]?.callActivity;
  return cfg?.calledElement ?? ir.nodeById[nodeId]?.calledElement ?? null;
}

/**
 * 令牌到达调用活动：创建子流程实例并驱动到首个等待点。
 * - 变量：initiator 继承父 START_USER，再按 inParams（source=父变量 → target=子变量）映射；
 * - START_USER/BUSINESS_KEY/TENANT 继承父实例，PARENT_ID/PARENT_NODE_KEY 回链；
 * - 子实例在父事务内同步推进（泵为重入安全：外层循环每令牌重读最新状态）。
 */
function createChildInstance(parent: InstRow, parentDeploy: DeployRow, node: NodeIR, calledElement: string): InstRow {
  const childDeploy = loadLatestDeployByKey(calledElement);
  if (!childDeploy) throw new EngineException(`子流程定义未部署: ${calledElement}`);
  const childIr = getIR(childDeploy);
  const startNode = childIr.process.nodes.find((n) => n.type === "startEvent");
  if (!startNode) throw new EngineException(`子流程 ${calledElement} 缺少开始事件`);

  const inParams = configMapOf(parentDeploy)[node.id]?.callActivity?.inParams ?? [];
  const parentVars = getVariables(parent);
  const childVars: Record<string, UelValue> = { initiator: parent.START_USER };
  for (const m of inParams) {
    if (m.source && m.target && m.source in parentVars) childVars[m.target] = parentVars[m.source];
  }

  const childId = uuid32();
  const now = nowStr();
  exec(
    `INSERT INTO WF_PROC_INST (ID, PROC_KEY, PROC_NAME, PROC_VERSION, DRAFT_ID, DEPLOY_ID, BUSINESS_KEY, TITLE, START_USER, START_TIME, STATUS, TENANT_ID, VARIABLES_JSON, PARENT_ID, PARENT_NODE_KEY)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [childId, childDeploy.PROC_KEY, childDeploy.PROC_NAME, childDeploy.VERSION, childDeploy.DRAFT_ID, childDeploy.ID,
      parent.BUSINESS_KEY, `${parent.TITLE ?? parent.PROC_NAME ?? parent.PROC_KEY} / 子流程:${childDeploy.PROC_NAME ?? calledElement}`,
      parent.START_USER, now, "RUNNING", parent.TENANT_ID ?? "default", JSON.stringify(childVars), parent.ID, node.id],
  );
  exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
    [uuid32(), childId, startNode.id, "ACTIVE", now]);
  // 父图：调用活动进入 RUNNING（完结由 resumeParentAfterChild 收尾）
  recordActivity(parent, getIR(parentDeploy), node.id, "RUNNING", {});

  const childInst = getInst(childId);
  recordActivity(childInst, childIr, startNode.id, "COMPLETED", { endTime: now });
  runBackendLogic(childInst, childIr, childDeploy, startNode.id, "ENTER", evalCtx(childInst));
  pump(childInst, childDeploy);
  return getInst(childId);
}

/**
 * 子实例完结 → 恢复父实例：outParams 回写 → 调用活动轨迹完结 → 令牌沿默认出线离开并泵父实例。
 * 幂等：令牌已被推进（同步完成场景）则无操作。
 */
function resumeParentAfterChild(child: InstRow): void {
  if (!child.PARENT_ID || !child.PARENT_NODE_KEY) return;
  const parent = queryOne<InstRow>("SELECT * FROM WF_PROC_INST WHERE ID = ?", [child.PARENT_ID]);
  if (!parent || parent.STATUS !== "RUNNING") return;
  const parentDeploy = parent.DEPLOY_ID ? loadDeployById(parent.DEPLOY_ID) : loadLatestDeployByKey(parent.PROC_KEY);
  if (!parentDeploy) return;
  const parentIr = getIR(parentDeploy);
  const parentNodeKey = child.PARENT_NODE_KEY;

  // 1) outParams：子变量 source → 父变量 target（后续网关条件可依赖）
  const outParams = configMapOf(parentDeploy)[parentNodeKey]?.callActivity?.outParams ?? [];
  if (outParams.length) {
    const childVars = getVariables(child);
    const parentVars = getVariables(parent);
    for (const m of outParams) {
      if (m.source && m.target && m.source in childVars) parentVars[m.target] = childVars[m.source];
    }
    saveVariables(parent.ID, parentVars);
  }
  // 2) 调用活动轨迹完结
  completeRunningActivities(parent.ID, parentNodeKey);
  // 3) 令牌离开调用活动
  const token = queryOne<TokenRow>(
    "SELECT * FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'ACTIVE' ORDER BY CREATED_AT LIMIT 1",
    [parent.ID, parentNodeKey]);
  if (token) {
    const f = defaultOut(parentIr, parentNodeKey);
    if (f) {
      // outParams 已回写，重载父实例行再推进（避免后续网关/分配用旧变量快照）
      const freshParent = getInst(parent.ID);
      moveToken(freshParent, parentIr, token, f);
      pump(freshParent, parentDeploy);
    }
  }
}

/** 运行中子实例（一层） */
function runningChildIds(instId: string): string[] {
  return query<InstRow>("SELECT ID FROM WF_PROC_INST WHERE PARENT_ID = ? AND STATUS = 'RUNNING'", [instId]).map((r) => r.ID);
}

/** 深度收集全部运行中后代实例（级联终止/挂起用，防环） */
export function runningDescendantIds(instId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([instId]);
  const queue = [instId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const c of runningChildIds(cur)) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      queue.push(c);
    }
  }
  return out;
}

/**
 * 令牌泵：循环处理所有可推进的 ACTIVE 令牌，直到全部等待（userTask）或实例结束。
 * 每步处理一个令牌的一个原子动作，避免重入。
 */
function pump(inst: InstRow, deploy: DeployRow): void {
  const ir = getIR(deploy);
  let guard = 0;
  for (;;) {
    if (++guard > 10000) throw new EngineException("推进步数超限（疑似死循环图）");
    const tokens = activeTokens(inst.ID);
    if (!tokens.length) { finishInstance(inst, ir, deploy); return; }
    let progressed = false;
    let finished = false;
    for (const snap of tokens) {
      // 重入安全：callActivity 同步完成子实例时会重入泵推进本令牌，
      // 快照可能已过期——重读最新状态，非 ACTIVE / 节点已变则跳过，避免双重推进。
      const fresh = queryOne<TokenRow>("SELECT * FROM WF_EXEC_TOKEN WHERE ID = ?", [snap.ID]);
      if (!fresh || fresh.STATUS !== "ACTIVE" || fresh.NODE_KEY !== snap.NODE_KEY) continue;
      const token = fresh;
      const node = ir.nodeById[token.NODE_KEY];
      if (!node) { setTokenStatus(token.ID, "DONE"); progressed = true; continue; }
      switch (node.type) {
        case "startEvent": {
          completeRunningActivities(inst.ID, node.id);
          const f = defaultOut(ir, node.id);
          if (!f) throw new EngineException(`开始事件 ${node.id} 无出线`);
          moveToken(inst, ir, token, f);
          progressed = true;
          break;
        }
        case "endEvent": {
          setTokenStatus(token.ID, "DONE");
          completeRunningActivities(inst.ID, node.id);
          if (token.SCOPE) {
            // 内层 subProcess 结束事件（Task 17）：本执行流终结；同作用域全部终结后弹栈出子图
            const sep = token.SCOPE.lastIndexOf("/");
            const parentScope = sep >= 0 ? token.SCOPE.slice(0, sep) : "";
            const subId = sep >= 0 ? token.SCOPE.slice(sep + 1) : token.SCOPE;
            const remaining = queryOne<{ C: number }>(
              "SELECT COUNT(*) C FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE' AND SCOPE = ?",
              [inst.ID, token.SCOPE]);
            if ((remaining?.C ?? 0) === 0) {
              // 子图收尾：subProcess 节点轨迹完结 → 令牌复用为延续令牌沿默认出线离开（多终点并行时最后一个出口统一继续）
              completeRunningActivities(inst.ID, subId);
              const f = defaultOut(ir, subId);
              if (f) {
                exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'ACTIVE', NODE_KEY = ?, SCOPE = ? WHERE ID = ?",
                  [f.targetRef, parentScope || null, token.ID]);
                token.STATUS = "ACTIVE";
                token.NODE_KEY = f.targetRef;
                token.SCOPE = parentScope || null;
                moveToken(inst, ir, token, f);
              }
              // 无出线的死端子图：令牌保持 DONE（实例可能就此收敛）
            }
            progressed = true;
            break;
          }
          progressed = true;
          finished = true;
          break;
        }
        case "userTask": {
          if (enterUserTask(inst, deploy, ir, token, node)) progressed = true;
          break;
        }
        case "serviceTask": {
          completeRunningActivities(inst.ID, node.id);
          runBackendLogic(inst, ir, deploy, node.id, "ENTER", evalCtx(inst));
          runBackendLogic(inst, ir, deploy, node.id, "COMPLETE", evalCtx(inst));
          const f = defaultOut(ir, node.id);
          if (!f) throw new EngineException(`服务任务 ${node.id} 无出线`);
          moveToken(inst, ir, token, f);
          progressed = true;
          break;
        }
        case "exclusiveGateway": {
          const ctx = evalCtx(inst);
          const outs = ir.outgoing[node.id] ?? [];
          let chosen: FlowIR | null = null;
          for (const f of outs) {
            if (!f.condition) { if (!chosen) chosen = f; continue; }
            if (evalExpression(f.condition, ctx) === true) { chosen = f; break; }
          }
          if (!chosen) throw new EngineException(`排他网关 ${node.id} 无满足条件的出线`);
          completeRunningActivities(inst.ID, node.id);
          moveToken(inst, ir, token, chosen);
          progressed = true;
          break;
        }
        case "parallelGateway":
        case "inclusiveGateway": {
          const outs = ir.outgoing[node.id] ?? [];
          const ins = ir.incomingCount[node.id] ?? 1;
          const atNode = activeTokens(inst.ID).filter((t) => t.NODE_KEY === node.id);
          if (ins > 1 && atNode.length < ins) break; // 汇合等待
          // 汇合完成：消耗全部到达令牌
          for (const t of atNode) setTokenStatus(t.ID, "DONE");
          completeRunningActivities(inst.ID, node.id);
          let targets: FlowIR[];
          if (node.type === "parallelGateway") targets = outs;
          else {
            const ctx = evalCtx(inst);
            targets = outs.filter((f) => !f.condition || evalExpression(f.condition, ctx) === true);
            if (!targets.length) targets = outs.filter((f) => !f.condition);
            if (!targets.length) throw new EngineException(`包含网关 ${node.id} 无可用出线`);
          }
          if (!targets.length) throw new EngineException(`并行网关 ${node.id} 无出线`);
          for (const f of targets) {
            exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
              [uuid32(), inst.ID, f.targetRef, "ACTIVE", nowStr()]);
          }
          progressed = true;
          break;
        }
        case "callActivity": {
          const called = calledElementOf(deploy, ir, node.id);
          if (!called) throw new EngineException(`调用活动 ${node.id} 未配置子流程（calledElement）`);
          const child = queryOne<InstRow>(
            "SELECT * FROM WF_PROC_INST WHERE PARENT_ID = ? AND PARENT_NODE_KEY = ? ORDER BY START_TIME DESC LIMIT 1",
            [inst.ID, node.id]);
          if (child && child.STATUS === "RUNNING") {
            // 等待子流程：令牌停在调用活动，本轮不推进
            break;
          }
          if (!child) {
            // 首次到达：建子实例并在父事务内同步推进（子流程若一路直达终点，
            // finishInstance → resumeParentAfterChild 会重入泵把本令牌推离，外层快照检查会跳过）
            createChildInstance(inst, deploy, node, called);
            progressed = true;
          } else {
            // 兜底：子实例已完结但令牌仍在此（finishInstance 恢复链路中断的补挂）
            resumeParentAfterChild(getInst(child.ID));
            progressed = true;
          }
          break;
        }
        case "subProcess": {
          // 嵌套图展开（Task 17，对齐 Flowable 嵌入子流程）：subProcess 轨迹置 RUNNING，
          // 令牌压入作用域（SCOPE 入栈）进入内图开始事件；内图 endEvent 弹栈出图（见 endEvent 分支）。
          const innerStart = (node.children?.nodes ?? []).find((n) => n.type === "startEvent");
          if (!innerStart || !node.children) {
            // 无内图（解析降级）：保持旧透传行为
            completeRunningActivities(inst.ID, node.id);
            const f = defaultOut(ir, node.id);
            if (f) { moveToken(inst, ir, token, f); progressed = true; }
            break;
          }
          recordActivity(inst, ir, node.id, "RUNNING", {});
          const scope = token.SCOPE ? `${token.SCOPE}/${node.id}` : node.id;
          exec("UPDATE WF_EXEC_TOKEN SET NODE_KEY = ?, SCOPE = ? WHERE ID = ?", [innerStart.id, scope, token.ID]);
          token.NODE_KEY = innerStart.id;
          token.SCOPE = scope;
          progressed = true;
          break;
        }
      }
      if (finished) break;
    }
    if (finished) { finishInstance(inst, ir, deploy); return; }
    if (!progressed) return;
  }
}

/** userTask 到达：建任务/展开 MI。返回是否产生推进（供泵判定）。 */
function enterUserTask(inst: InstRow, deploy: DeployRow, ir: DiagramIR, token: TokenRow, node: NodeIR): boolean {
  const existing = queryOne<{ C: number }>(
    "SELECT COUNT(*) C FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'PENDING' AND MI_GROUP_ID IS ?",
    [inst.ID, node.id, token.MI_GROUP_ID ?? null]);
  if ((existing?.C ?? 0) > 0) return false; // 已在等待

  if (token.MI_GROUP_ID) return false; // MI 子令牌等待各自任务

  const assignment = resolveAssignment(inst, deploy, node);
  if (assignment.mi.length > 1 || (assignment.mi.length === 1 && (configMapOf(deploy)[node.id]?.approval?.multiMode ?? "") !== "")) {
    // MI：每审批人一个子令牌 + 一个任务
    const groupId = uuid32();
    const total = assignment.mi.length;
    if (configMapOf(deploy)[node.id]?.approval?.multiMode === "sequential") {
      // 依次（Task 17）：仅展开第一个审批人；完成后由 completeTask 链式创建下一位
      const first = assignment.mi[0];
      exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, MI_GROUP_ID, MI_INDEX, CREATED_AT) VALUES (?,?,?,?,?,?,?)",
        [uuid32(), inst.ID, node.id, "ACTIVE", groupId, first.index, nowStr()]);
      createTask(inst, node, { assignee: first.userId, miGroupId: groupId, miIndex: first.index, miTotal: total });
      setTokenStatus(token.ID, "DONE");
      setVar(inst.ID, "approverList", assignment.mi.map((m) => m.userId));
      if (getVariables(inst)["rejected"] === undefined) setVar(inst.ID, "rejected", false);
      return true;
    }
    for (const sub of assignment.mi) {
      const subToken = uuid32();
      exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, MI_GROUP_ID, MI_INDEX, CREATED_AT) VALUES (?,?,?,?,?,?,?)",
        [subToken, inst.ID, node.id, "ACTIVE", groupId, sub.index, nowStr()]);
      createTask(inst, node, { assignee: sub.userId, miGroupId: groupId, miIndex: sub.index, miTotal: total });
    }
    setTokenStatus(token.ID, "DONE"); // 组根令牌已展开
    // MI 审批人注入语义（MultiInstanceApproverListener）：approverList + rejected=false
    setVar(inst.ID, "approverList", assignment.mi.map((m) => m.userId));
    if (getVariables(inst)["rejected"] === undefined) setVar(inst.ID, "rejected", false);
    return true;
  }
  createTask(inst, node, { assignee: assignment.assignee, candidates: assignment.candidates });
  return true;
}

/** 发起人节点任务自动 complete（InitiatorNodeResolver 语义，C.1） */
function isInitiatorNodeWith(deploy: DeployRow, node: NodeIR): boolean {
  return isInitiatorNode(node);
}

// ---------- 对外 API ----------

export interface StartResult { id: string; processDefinitionId: string; processDefinitionKey: string; businessKey: string | null; tenantId: string | null; }

/** C.1 启动：按 key 最新版本 → 建实例 → 首节点 → 发起人自动 complete → 推进 */
export function startProcess(input: {
  procKey: string; starter: string; variables?: Record<string, UelValue>; businessKey?: string | null;
  formDefId?: string | null; tenantId?: string | null;
}): StartResult {
  const deploy = loadLatestDeployByKey(input.procKey);
  if (!deploy) throw new BusinessException(`流程定义不存在: ${input.procKey}`, 404);
  const ir = getIR(deploy);
  const startNode = ir.process.nodes.find((n) => n.type === "startEvent");
  if (!startNode) throw new EngineException("缺少开始事件");
  const now = nowStr();
  const vars: Record<string, UelValue> = { initiator: input.starter, ...(input.variables ?? {}) };
  const instId = uuid32();
  const tenant = input.tenantId ?? "default";

  // 编号规则（Task 17，Java 未实现的迁移缺口）：numberRule.enabled 时按 pattern 生成业务编号。
  // 占位符：{{year}}/{{month}}/{{day}}/{{seq}}/{{seq:N}}（N 位零填充）；序号按 流程key+年月 逐月重置（WF_ENGINE_SEQ）。
  // 结果写入变量 businessNo；未显式传 businessKey 时同步充当 BUSINESS_KEY/TITLE（实例列表「编号」列可见）。
  const numRule = ir.processConfig?.numberRule;
  let businessNo: string | null = null;
  if (numRule?.enabled && numRule.pattern && String(numRule.pattern).trim()) {
    businessNo = generateBusinessNo(String(numRule.pattern), deploy.PROC_KEY);
    vars["businessNo"] = businessNo;
  }
  const effectiveBusinessKey = input.businessKey ?? businessNo;

  tx(() => {
    exec(
      `INSERT INTO WF_PROC_INST (ID, PROC_KEY, PROC_NAME, PROC_VERSION, DRAFT_ID, DEPLOY_ID, BUSINESS_KEY, TITLE, START_USER, START_TIME, STATUS, TENANT_ID, VARIABLES_JSON)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [instId, deploy.PROC_KEY, deploy.PROC_NAME, deploy.VERSION, deploy.DRAFT_ID, deploy.ID,
        effectiveBusinessKey, effectiveBusinessKey ?? deploy.PROC_NAME, input.starter, now, "RUNNING", tenant, JSON.stringify(vars)],
    );
    exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
      [uuid32(), instId, startNode.id, "ACTIVE", now]);
    const inst = getInst(instId);
    recordActivity(inst, ir, startNode.id, "COMPLETED", { endTime: now });
    // PROCESS_STARTED → start 节点 ENTER 后置逻辑
    runBackendLogic(inst, ir, deploy, startNode.id, "ENTER", evalCtx(inst));
  });

  const inst = getInst(instId);
  pump(inst, deploy);

  // 发起人节点自动 complete：定位 initiator 节点（wf:nodeRole=initiator 兜底第一个 userTask）上 PENDING 任务
  const irAfter = getIR(deploy);
  const initiatorNode =
    irAfter.process.nodes.find((n) => n.type === "userTask" && isInitiatorNodeWith(deploy, n)) ??
    irAfter.process.nodes.find((n) => n.type === "userTask");
  if (initiatorNode) {
    const t = queryOne<TaskRow>(
      "SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'PENDING' ORDER BY START_TIME LIMIT 1",
      [instId, initiatorNode.id]);
    if (t) {
      completeTask({ taskId: t.ID, userId: input.starter, variables: {}, comment: null, action: "submit" });
    }
  }

  // 表单数据落库（form_data，非快照）——对齐 ProcessInstanceController.start
  if (input.formDefId) {
    try {
      exec(
        `INSERT INTO WF_FORM_DATA (ID, CREATED_AT, CREATED_BY, DATA_JSON, FORM_DEF_ID, FORM_VERSION, IS_SNAPSHOT, PROCESS_INSTANCE_ID, TENANT_ID)
         SELECT ?, ?, ?, ?, ?, COALESCE(PUBLISHED_VERSION, VERSION), 0, ?, ? FROM WF_FORM_DEF WHERE ID = ?`,
        [uuid32(), nowStr(), input.starter, JSON.stringify(vars), input.formDefId, instId, tenant, input.formDefId],
      );
    } catch { /* 表单保存失败不影响流程启动 */ }
  }
  return { id: instId, processDefinitionId: deploy.ID, processDefinitionKey: deploy.PROC_KEY, businessKey: input.businessKey ?? null, tenantId: tenant };
}

/**
 * 编号规则生成（numberRule，Task 17）：{{year}}/{{month}}/{{day}}/{{seq}}/{{seq:N}}。
 * 序号存 WF_ENGINE_SEQ（SEQ_KEY = number:{procKey}:{yyyyMM}），按月重置；自增非原子（单进程事件循环内串行，风险可接受）。
 */
function generateBusinessNo(pattern: string, procKey: string): string {
  const d = new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const seqKey = `number:${procKey}:${year}${month}`;
  const cur = queryOne<{ SEQ_VALUE: number }>("SELECT SEQ_VALUE FROM WF_ENGINE_SEQ WHERE SEQ_KEY = ?", [seqKey]);
  let next: number;
  if (cur) {
    next = Number(cur.SEQ_VALUE) + 1;
    exec("UPDATE WF_ENGINE_SEQ SET SEQ_VALUE = ? WHERE SEQ_KEY = ?", [next, seqKey]);
  } else {
    next = 1;
    exec("INSERT INTO WF_ENGINE_SEQ (SEQ_KEY, SEQ_VALUE) VALUES (?,?)", [seqKey, next]);
  }
  return pattern
    .replace(/\{\{\s*year\s*\}\}/gi, year)
    .replace(/\{\{\s*month\s*\}\}/gi, month)
    .replace(/\{\{\s*day\s*\}\}/gi, day)
    .replace(/\{\{\s*seq\s*:\s*(\d+)\s*\}\}/gi, (_m, n: string) => String(next).padStart(Number(n) || 1, "0"))
    .replace(/\{\{\s*seq\s*\}\}/gi, String(next));
}

export interface CompleteResult { processFinished: boolean; nextTask: { id: string; name: string; assignee: string | null } | null; }

/** C.3 完成任务：变量合并 → MI 计数（all/any + rejected 短路）→ advance */
export function completeTask(input: {
  taskId: string; userId: string; variables?: Record<string, UelValue>; comment?: string | null; action?: string;
}): CompleteResult {
  return tx(() => {
    const task = getTask(input.taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    const inst = getInst(task.PROC_INST_ID);
    if (inst.STATUS !== "RUNNING") throw new BusinessException("流程实例不在运行中", 400);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const node = ir.nodeById[task.NODE_KEY];
    const now = nowStr();
    const action = input.action ?? "approve";

    // 委派任务：先 resolveTask 语义（owner 收回任务，不完成）
    if (task.DELEGATION === "PENDING") {
      exec("UPDATE WF_TASK_INST SET ASSIGNEE = COALESCE(OWNER, ASSIGNEE), DELEGATION = NULL WHERE ID = ?", [task.ID]);
      addComment(inst, task.ID, input.userId, "resolve", input.comment ?? null, task.OWNER);
      return { processFinished: false, nextTask: nextTaskOf(inst.ID) };
    }

    // 变量合并
    if (input.variables && Object.keys(input.variables).length) {
      const vars = getVariables(inst);
      Object.assign(vars, input.variables);
      saveVariables(inst.ID, vars);
    }
    exec("UPDATE WF_TASK_INST SET STATUS = 'COMPLETED', END_TIME = ?, COMPLETED_BY = ? WHERE ID = ?",
      [now, input.userId, task.ID]);
    addComment(inst, task.ID, input.userId, action, input.comment ?? null);
    completeRunningActivities(inst.ID, task.NODE_KEY, "COMPLETED", task.MI_GROUP_ID ?? undefined);
    // TASK_COMPLETED → 节点 COMPLETE 后置逻辑
    if (node) runBackendLogic(inst, ir, deploy, node.id, "COMPLETE", evalCtx(getInst(inst.ID)));

    const token = queryOne<TokenRow>(
      "SELECT * FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'ACTIVE' ORDER BY CREATED_AT LIMIT 1",
      [inst.ID, task.NODE_KEY]);

    if (task.MI_GROUP_ID) {
      // MI 计数：all=全部完成 / any=≥1 完成 / sequential=依次逐位（Task 17）；rejected=true 任一触发整体终止（C.4）
      const groupTasks = query<TaskRow>("SELECT * FROM WF_TASK_INST WHERE MI_GROUP_ID = ?", [task.MI_GROUP_ID]);
      const pending = groupTasks.filter((t) => t.STATUS === "PENDING");
      const completed = groupTasks.filter((t) => t.STATUS === "COMPLETED");
      const rejected = getVariables(getInst(inst.ID))["rejected"] === true;
      const mode = configMapOf(deploy)[task.NODE_KEY]?.approval?.multiMode ?? "countersign";
      const done = rejected || (mode === "or_sign" ? completed.length >= 1 : pending.length === 0);
      if (!done) {
        // 取消被拒绝短路时其余任务
        if (rejected) {
          for (const p of pending) {
            exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = 'rejected' WHERE ID = ?", [now, p.ID]);
            completeRunningActivities(inst.ID, p.NODE_KEY, "CANCELED", p.MI_GROUP_ID ?? undefined);
          }
        }
        return { processFinished: false, nextTask: nextTaskOf(inst.ID) };
      }
      // sequential 未走完：本位令牌终结，链式展开下一位（同组新子令牌+新任务；组仍等待）
      if (mode === "sequential" && !rejected) {
        const total = task.MI_TOTAL ?? groupTasks.length;
        const completedCount = completed.length;
        if (completedCount < total) {
          const approverList = getVariables(inst)["approverList"];
          const nextUser = Array.isArray(approverList) ? approverList[completedCount] : undefined;
          const nextIdx = (task.MI_INDEX ?? completedCount) + 1;
          if (nextUser != null && nextUser !== "") {
            exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'DONE' WHERE PROC_INST_ID = ? AND MI_GROUP_ID = ? AND MI_INDEX = ? AND STATUS = 'ACTIVE'",
              [inst.ID, task.MI_GROUP_ID, task.MI_INDEX]);
            exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, MI_GROUP_ID, MI_INDEX, CREATED_AT) VALUES (?,?,?,?,?,?,?)",
              [uuid32(), inst.ID, task.NODE_KEY, "ACTIVE", task.MI_GROUP_ID, nextIdx, now]);
            createTask(getInst(inst.ID), node, { assignee: String(nextUser), miGroupId: task.MI_GROUP_ID, miIndex: nextIdx, miTotal: total });
            return { processFinished: false, nextTask: nextTaskOf(inst.ID) };
          }
          // approverList 缺失/越界：按组完结收尾（降组容错）
        }
      }
      // 完成条件满足：清空组令牌，创建组延续令牌并立即沿默认出线离开（不得重入 userTask）
      exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'DONE' WHERE PROC_INST_ID = ? AND MI_GROUP_ID = ?", [inst.ID, task.MI_GROUP_ID]);
      for (const p of pending) {
        exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = 'mi-completed' WHERE ID = ?", [now, p.ID]);
        completeRunningActivities(inst.ID, p.NODE_KEY, "CANCELED", p.MI_GROUP_ID ?? undefined);
      }
      const contId = uuid32();
      exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
        [contId, inst.ID, task.NODE_KEY, "ACTIVE", now]);
      const contToken = queryOne<TokenRow>("SELECT * FROM WF_EXEC_TOKEN WHERE ID = ?", [contId])!;
      const contFlow = defaultOut(ir, task.NODE_KEY);
      if (contFlow) moveToken(getInst(inst.ID), ir, contToken, contFlow);
      pump(getInst(inst.ID), deploy);
      return { processFinished: isFinished(inst.ID), nextTask: nextTaskOf(inst.ID) };
    }

    // 单实例任务：令牌沿出线推进
    if (token) {
      const f = defaultOut(ir, task.NODE_KEY);
      if (!f) throw new EngineException(`节点 ${task.NODE_KEY} 无出线`);
      moveToken(getInst(inst.ID), ir, token, f);
    }
    pump(getInst(inst.ID), deploy);
    return { processFinished: isFinished(inst.ID), nextTask: nextTaskOf(inst.ID) };
  });
}

function isFinished(instId: string): boolean {
  const inst = queryOne<{ STATUS: string }>("SELECT STATUS FROM WF_PROC_INST WHERE ID = ?", [instId]);
  return inst?.STATUS === "COMPLETED" || inst?.STATUS === "CANCELED" || inst?.STATUS === "REJECTED";
}

function nextTaskOf(instId: string): CompleteResult["nextTask"] {
  const t = queryOne<TaskRow>("SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'PENDING' ORDER BY START_TIME LIMIT 1", [instId]);
  return t ? { id: t.ID, name: t.NODE_NAME ?? t.NODE_KEY, assignee: t.ASSIGNEE } : null;
}

// ---------- 驳回 / 拒绝 / 终止（C.5） ----------

/** InitiatorNodeResolver：wf:nodeRole=initiator → 兜底第一个 userTask */
export function resolveInitiatorNode(ir: DiagramIR): NodeIR | null {
  return ir.process.nodes.find((n) => n.type === "userTask" && n.nodeRole === "initiator")
    ?? ir.process.nodes.find((n) => n.type === "userTask") ?? null;
}

/** 驳回 = 退回发起人节点（changeActivityState 语义） */
export function rejectTask(taskId: string, userId: string, comment: string | null): CompleteResult {
  return tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    const inst = getInst(task.PROC_INST_ID);
    if (inst.STATUS !== "RUNNING") throw new BusinessException("流程实例不在运行中", 400);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const initiatorNode = resolveInitiatorNode(ir);
    if (!initiatorNode) throw new EngineException("未找到发起人节点，无法驳回");
    if (initiatorNode.id === task.NODE_KEY) throw new BusinessException("当前已在发起节点，不能驳回", 400);

    const now = nowStr();
    // 设变量 rejected=true（终止 MI）；取消当前令牌
    setVar(inst.ID, "rejected", true);
    exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'CANCELED' WHERE PROC_INST_ID = ?", [inst.ID]);
    exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = 'reject' WHERE STATUS = 'PENDING' AND PROC_INST_ID = ?",
      [now, inst.ID]);
    exec("UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = 'CANCELED' WHERE PROC_INST_ID = ? AND STATUS = 'RUNNING'", [now, inst.ID]);
    // 级联取消运行中子实例（callActivity 链不能孤儿运行）
    for (const cid of runningDescendantIds(inst.ID)) {
      terminateInstanceInner(cid, "reject", "CANCELED");
    }
    addComment(inst, task.ID, userId, "reject", comment ?? null);

    // changeActivityState：发起人节点新令牌 + 新任务
    const assignee = getVariables(inst)["initiator"] as string | null ?? inst.START_USER;
    exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
      [uuid32(), inst.ID, initiatorNode.id, "ACTIVE", now]);
    const newInst = getInst(inst.ID);
    createTask(newInst, initiatorNode, { assignee });
    exec("UPDATE WF_PROC_INST SET CURRENT_NODE_KEYS = ? WHERE ID = ?", [JSON.stringify([initiatorNode.id]), inst.ID]);
    // variableMappings 写回（发起人重新填报后变量刷新）——TODO dataMappings 聚合
    return { processFinished: false, nextTask: nextTaskOf(inst.ID) };
  });
}

/**
 * 发起人撤回（recall）：把运行中实例拉回发起人节点重新提交。
 * 守卫：仅发起人本人 / 实例运行中 / 发起节点之后的审批节点尚无完成记录（否则审批已实质开始）。
 */
export function recallInstance(procInstId: string, userId: string, comment: string | null): CompleteResult {
  return tx(() => {
    const inst = getInst(procInstId);
    if (inst.STATUS !== "RUNNING") throw new BusinessException("流程实例不在运行中，无法撤回", 400);
    // 发起人取值链：START_USER → 变量 initiator（Flowable 历史数据可能未记录 START_USER）
    const recallVars = getVariables(inst);
    const initiatorId = String(inst.START_USER ?? (recallVars["initiator"] as string | null) ?? "");
    if (!initiatorId) throw new BusinessException("无法确定流程发起人，无法撤回", 400);
    if (initiatorId !== String(userId)) throw new BusinessException("仅流程发起人可以撤回", 403);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const initiatorNode = resolveInitiatorNode(ir);
    if (!initiatorNode) throw new EngineException("未找到发起人节点，无法撤回");
    if (initiatorNode.id === (currentNodeKeys(inst.ID)[0] ?? "")) {
      throw new BusinessException("流程仍在发起节点，无需撤回", 400);
    }
    // 守卫：后续审批节点已有完成记录 → 审批已实质开始
    const doneElsewhere = queryOne<{ C: number }>(
      `SELECT COUNT(*) AS C FROM WF_ACTIVITY_INST
       WHERE PROC_INST_ID = ? AND END_TIME IS NOT NULL AND NODE_TYPE = 'userTask' AND NODE_KEY != ?`,
      [inst.ID, initiatorNode.id],
    );
    if ((doneElsewhere?.C ?? 0) > 0) throw new BusinessException("审批已进入后续节点完成，不可撤回", 400);

    const now = nowStr();
    const pending = query<TaskRow>(`SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'`, [inst.ID]);
    setVar(inst.ID, "recalled", true);
    exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'CANCELED' WHERE PROC_INST_ID = ?", [inst.ID]);
    exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = 'recall' WHERE STATUS = 'PENDING' AND PROC_INST_ID = ?",
      [now, inst.ID]);
    exec("UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = 'CANCELED' WHERE PROC_INST_ID = ? AND STATUS = 'RUNNING'", [now, inst.ID]);
    // 级联取消运行中子实例（callActivity 链不能孤儿运行）
    for (const cid of runningDescendantIds(inst.ID)) {
      terminateInstanceInner(cid, "recall", "CANCELED");
    }
    addComment(inst, pending[0]?.ID ?? null, userId, "recall", comment ?? null);

    // 回到发起人节点重新提交
    const assignee = getVariables(inst)["initiator"] as string | null ?? inst.START_USER;
    exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, CREATED_AT) VALUES (?,?,?,?,?)",
      [uuid32(), inst.ID, initiatorNode.id, "ACTIVE", now]);
    const fresh = getInst(inst.ID);
    createTask(fresh, initiatorNode, { assignee });
    exec("UPDATE WF_PROC_INST SET CURRENT_NODE_KEYS = ? WHERE ID = ?", [JSON.stringify([initiatorNode.id]), inst.ID]);
    return { processFinished: false, nextTask: nextTaskOf(inst.ID) };
  });
}

/** 拒绝 = 终止流程（deleteProcessInstance 语义） */
export function refuseTask(taskId: string, userId: string, comment: string | null): { processFinished: true } {
  return tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    const inst = getInst(task.PROC_INST_ID);
    addComment(inst, task.ID, userId, "refuse", comment ?? null);
    terminateInstanceInner(inst.ID, comment ?? "refuse", "REJECTED");
    return { processFinished: true };
  });
}

export function terminateInstance(instId: string, reason: string | null): void {
  tx(() => terminateCascade(instId, reason ?? "terminate", "CANCELED", new Set()));
}

/** 级联终止：实例 + 全部运行中后代子实例（callActivity 链，防环） */
function terminateCascade(instId: string, reason: string, status: string, seen: Set<string>): void {
  if (seen.has(instId)) return;
  seen.add(instId);
  terminateInstanceInner(instId, reason, status);
  for (const c of runningChildIds(instId)) terminateCascade(c, reason, status, seen);
}

function terminateInstanceInner(instId: string, reason: string, status: string): void {
  const now = nowStr();
  exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = ? WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'", [now, reason, instId]);
  exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'CANCELED' WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE'", [instId]);
  exec("UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = 'CANCELED' WHERE PROC_INST_ID = ? AND STATUS = 'RUNNING'", [now, instId]);
  exec("UPDATE WF_PROC_INST SET STATUS = ?, END_TIME = ?, DELETE_REASON = ?, CURRENT_NODE_KEYS = NULL WHERE ID = ?",
    [status, now, reason, instId]);
}

export function suspendInstance(instId: string): void {
  // 级联挂起：子实例一并挂起（对齐 Flowable 挂起级联语义）
  for (const id of [instId, ...runningDescendantIds(instId)]) {
    exec("UPDATE WF_PROC_INST SET STATUS = 'SUSPENDED' WHERE ID = ? AND STATUS = 'RUNNING'", [id]);
  }
}

export function resumeInstance(instId: string): void {
  for (const id of [instId, ...runningDescendantIdsSuspended(instId)]) {
    exec("UPDATE WF_PROC_INST SET STATUS = 'RUNNING' WHERE ID = ? AND STATUS = 'SUSPENDED'", [id]);
  }
}

/** 深度收集挂起中的后代实例（恢复用） */
function runningDescendantIdsSuspended(instId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([instId]);
  const queue = [instId];
  while (queue.length) {
    const cur = queue.shift()!;
    const kids = query<InstRow>("SELECT ID FROM WF_PROC_INST WHERE PARENT_ID = ? AND STATUS = 'SUSPENDED'", [cur]).map((r) => r.ID);
    for (const c of kids) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      queue.push(c);
    }
  }
  return out;
}

// ---------- 加签 / 转签 / 转办 / 委派（C.6） ----------

/** 加签：MI=addMultiInstanceExecution（每人一个新子实例，受完成条件约束）；非 MI=addCandidateUser */
export function addSign(taskId: string, userId: string, targetUserIds: string[], comment: string | null): void {
  tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    const inst = getInst(task.PROC_INST_ID);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const node = ir.nodeById[task.NODE_KEY];
    const now = nowStr();
    if (task.MI_GROUP_ID) {
      const total = queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_TASK_INST WHERE MI_GROUP_ID = ?", [task.MI_GROUP_ID])?.C ?? 0;
      const seqMode = configMapOf(deploy)[node.id]?.approval?.multiMode === "sequential";
      targetUserIds.forEach((uid, i) => {
        const idx = total + i + 1;
        exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, MI_GROUP_ID, MI_INDEX, CREATED_AT) VALUES (?,?,?,?,?,?,?)",
          [uuid32(), inst.ID, task.NODE_KEY, "ACTIVE", task.MI_GROUP_ID, idx, now]);
        createTask(inst, node, { assignee: uid, miGroupId: task.MI_GROUP_ID!, miIndex: idx, miTotal: null });
      });
      // 更新组内任务 MI_TOTAL
      const newTotal = total + targetUserIds.length;
      exec("UPDATE WF_TASK_INST SET MI_TOTAL = ? WHERE MI_GROUP_ID = ?", [newTotal, task.MI_GROUP_ID]);
      // 依次模式：新加签人追加到链条末尾（后续链式展开从 approverList 取人）
      if (seqMode) {
        const list = getVariables(inst)["approverList"];
        if (Array.isArray(list)) setVar(inst.ID, "approverList", [...list.map(String), ...targetUserIds.map(String)]);
      }
    } else {
      for (const uid of targetUserIds) {
        exec("INSERT INTO WF_TASK_CANDIDATE (ID, TASK_ID, PROC_INST_ID, USER_ID, CREATED_AT) VALUES (?,?,?,?,?)",
          [uuid32(), task.ID, inst.ID, uid, now]);
      }
      const existing: string[] = task.CANDIDATES_JSON ? JSON.parse(task.CANDIDATES_JSON) : [];
      const merged = Array.from(new Set([...existing, ...targetUserIds]));
      exec("UPDATE WF_TASK_INST SET CANDIDATES_JSON = ? WHERE ID = ?", [JSON.stringify(merged), task.ID]);
    }
    addComment(inst, task.ID, userId, "add_sign", comment ?? null, targetUserIds.join(","));
  });
}

/** 转签 forwardSign：MI 实例级换人 = 删旧实例（不计完成）+ 加新实例 */
export function forwardSign(taskId: string, userId: string, fromUserId: string, toUserId: string, comment: string | null): void {
  tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    const inst = getInst(task.PROC_INST_ID);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const node = ir.nodeById[task.NODE_KEY];
    const now = nowStr();
    if (!task.MI_GROUP_ID) throw new BusinessException("转签仅支持多实例（会签/或签/依次）任务", 400);
    // 删旧实例（不计完成数）：任务 CANCELED + 子令牌 DONE
    const oldTasks = query<TaskRow>("SELECT * FROM WF_TASK_INST WHERE MI_GROUP_ID = ? AND ASSIGNEE = ? AND STATUS = 'PENDING'", [task.MI_GROUP_ID, fromUserId]);
    for (const t of oldTasks) {
      exec("UPDATE WF_TASK_INST SET STATUS = 'CANCELED', END_TIME = ?, DELETE_REASON = 'forward_sign' WHERE ID = ?", [now, t.ID]);
      exec("UPDATE WF_EXEC_TOKEN SET STATUS = 'DONE' WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND MI_GROUP_ID = ? AND STATUS = 'ACTIVE' AND MI_INDEX = ?",
        [inst.ID, t.NODE_KEY, t.MI_GROUP_ID, t.MI_INDEX]);
      completeRunningActivities(inst.ID, t.NODE_KEY, "CANCELED", t.MI_GROUP_ID ?? undefined);
    }
    const seqMode = configMapOf(deploy)[node.id]?.approval?.multiMode === "sequential";
    // 加新实例：依次模式沿用原位次（链式顺序不变）；会签/或签追加到组尾
    const total = queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_TASK_INST WHERE MI_GROUP_ID = ?", [task.MI_GROUP_ID])?.C ?? 0;
    for (const t of oldTasks) {
      const reuseIdx = seqMode ? t.MI_INDEX : null;
      const idx = reuseIdx ?? total + 1;
      exec("INSERT INTO WF_EXEC_TOKEN (ID, PROC_INST_ID, NODE_KEY, STATUS, MI_GROUP_ID, MI_INDEX, CREATED_AT) VALUES (?,?,?,?,?,?,?)",
        [uuid32(), inst.ID, task.NODE_KEY, "ACTIVE", task.MI_GROUP_ID, idx, now]);
      createTask(inst, node, { assignee: toUserId, miGroupId: task.MI_GROUP_ID, miIndex: idx, miTotal: reuseIdx ? t.MI_TOTAL : null });
      if (seqMode && reuseIdx) {
        // 同步 approverList 对应位（链式展开按位取人）
        const list = getVariables(inst)["approverList"];
        if (Array.isArray(list) && reuseIdx - 1 < list.length) {
          list[reuseIdx - 1] = String(toUserId);
          setVar(inst.ID, "approverList", list);
        }
      }
    }
    addComment(inst, task.ID, userId, "forward_sign", comment ?? null, toUserId);
  });
}

/** 转办 transfer：setAssignee（唯一强制权限校验 allowTransfer） */
export function transferTask(taskId: string, userId: string, toUser: string, reason: string | null): void {
  tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    if (String(toUser) === String(task.ASSIGNEE)) throw new BusinessException("转办目标与当前办理人相同", 400);
    const inst = getInst(task.PROC_INST_ID);
    const deploy = inst.DEPLOY_ID ? loadDeployById(inst.DEPLOY_ID)! : loadLatestDeployByKey(inst.PROC_KEY)!;
    const ir = getIR(deploy);
    const node = ir.nodeById[task.NODE_KEY];
    const cfg = node ? configMapOf(deploy)[node.id] : null;
    // extractOperations：流程级 AND 节点级（仅 transfer 强制校验，对齐 Java 现状）
    const procAllow = ir.processConfig?.approvalPolicy?.operations?.allowTransfer ?? true;
    const nodeAllow = cfg?.operations?.allowTransfer ?? true;
    if (!(procAllow && nodeAllow)) throw new BusinessException("当前节点不允许转办", 403);
    exec("UPDATE WF_TASK_INST SET ASSIGNEE = ? WHERE ID = ?", [toUser, task.ID]);
    exec("UPDATE WF_ACTIVITY_INST SET ASSIGNEE = ? WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'RUNNING'", [toUser, inst.ID, task.NODE_KEY]);
    exec("INSERT INTO WF_TASK_TRANSFER (ID, CREATED_AT, FROM_USER, PROCESS_INSTANCE_ID, REASON, TASK_ID, TENANT_ID, TO_USER) VALUES (?,?,?,?,?,?,?,?)",
      [uuid32(), nowStr(), userId, inst.ID, reason, task.ID, inst.TENANT_ID ?? "default", toUser]);
    addComment(inst, task.ID, userId, "transfer", reason, toUser);
  });
}

/** 委派 delegate：delegateTask 语义（owner=原办理人，DELEGATION=PENDING；complete 时 resolve 回 owner） */
export function delegateTask(taskId: string, userId: string, toUser: string, comment: string | null): void {
  tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务已完成或已取消", 400);
    if (String(toUser) === String(task.ASSIGNEE)) throw new BusinessException("委派目标与当前办理人相同", 400);
    const inst = getInst(task.PROC_INST_ID);
    exec("UPDATE WF_TASK_INST SET OWNER = ?, DELEGATION = 'PENDING', ASSIGNEE = ? WHERE ID = ?", [task.ASSIGNEE, toUser, task.ID]);
    addComment(inst, task.ID, userId, "delegate", comment ?? null, toUser);
  });
}

// ---------- 认领 ----------

export function claimTask(taskId: string, userId: string): void {
  tx(() => {
    const task = getTask(taskId);
    if (task.STATUS !== "PENDING") throw new BusinessException("任务不可认领", 400);
    if (task.ASSIGNEE) throw new BusinessException("任务已被认领", 400);
    const cands = task.CANDIDATES_JSON ? (JSON.parse(task.CANDIDATES_JSON) as string[]) : [];
    if (cands.length && !cands.includes(String(userId))) throw new BusinessException("不是该任务的候选人", 403);
    exec("UPDATE WF_TASK_INST SET ASSIGNEE = ?, CLAIM_TIME = ? WHERE ID = ?", [String(userId), nowStr(), task.ID]);
    exec("UPDATE WF_ACTIVITY_INST SET ASSIGNEE = ? WHERE PROC_INST_ID = ? AND NODE_KEY = ? AND STATUS = 'RUNNING'",
      [String(userId), task.PROC_INST_ID, task.NODE_KEY]);
  });
}

// ---------- 预测（ProcessTaskPredictionService 对齐） ----------

export interface PredictionNode { nodeId: string; nodeName: string; nodeType: string; assignees: string[]; assigneeNames: string[]; }
export interface PredictionResult { nodes: PredictionNode[]; branchStops: PredictionNode[]; finished: boolean; }

/** 静态遍历 + 表达式求值：无条件出线继续深入；有条件出线按变量求值，不可判定即标记分支停止；到 endEvent 停止；visited 防环 */
export function predict(procDefId: string | null, procKey: string | null, startUser: string, variables: Record<string, UelValue>): PredictionResult {
  const deploy = procDefId ? loadDeployById(procDefId) : procKey ? loadLatestDeployByKey(procKey) : null;
  if (!deploy) throw new BusinessException("流程定义不存在", 404);
  const ir = getIR(deploy);
  const start = ir.process.nodes.find((n) => n.type === "startEvent");
  if (!start) throw new EngineException("缺少开始事件");
  const nodes: PredictionNode[] = [];
  const branchStops: PredictionNode[] = [];
  const visited = new Set<string>();
  const ctx: Record<string, UelValue> = { initiator: startUser, ...variables };
  let finished = false;

  const nicknameOf = (uid: string): string | null =>
    queryOne<{ NICKNAME: string | null }>("SELECT NICKNAME FROM SYS_USER WHERE ID = ?", [String(uid)])?.NICKNAME ?? null;
  const assigneesOf = (dep: DeployRow, node: NodeIR): string[] => {
    const cfg = configMapOf(dep)[node.id];
    if (cfg?.approval?.type === "dept_head") {
      const head = resolveDeptHead(startUser);
      if (head) return [head];
    }
    if (cfg?.approval?.userIds?.length) return cfg.approval.userIds.map(String);
    if (node.assignee) {
      const r = resolveVarRef(node.assignee, ctx);
      if (r) return [r];
    }
    return node.candidateUsers ?? [];
  };
  const toPred = (dep: DeployRow, node: NodeIR, ids: string[]): PredictionNode => ({
    nodeId: node.id, nodeName: node.name ?? node.id, nodeType: node.type,
    assignees: ids, assigneeNames: ids.map((u) => nicknameOf(u) ?? u),
  });

  // walk(dep, g, ...): 支持跨图遍历——callActivity 展开子流程图（深度限 3，防循环调用）
  const walk = (dep: DeployRow, g: DiagramIR, nodeId: string, visited: Set<string>, depth: number): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = g.nodeById[nodeId];
    if (!node) return;
    if (node.type === "endEvent") { finished = true; return; }
    if (node.type === "userTask") nodes.push(toPred(dep, node, assigneesOf(dep, node)));
    if (node.type === "serviceTask") nodes.push(toPred(dep, node, []));
    if (node.type === "callActivity") {
      nodes.push(toPred(dep, node, []));
      const called = configMapOf(dep)[node.id]?.callActivity?.calledElement ?? node.calledElement;
      if (called && depth < 3) {
        const childDeploy = loadLatestDeployByKey(called);
        const childStart = childDeploy ? getIR(childDeploy).process.nodes.find((n) => n.type === "startEvent") : undefined;
        if (childDeploy && childStart) walk(childDeploy, getIR(childDeploy), childStart.id, new Set(), depth + 1);
      }
      const f0 = defaultOut(g, node.id);
      if (f0) walk(dep, g, f0.targetRef, visited, depth);
      return;
    }
    if (node.type === "exclusiveGateway" || node.type === "inclusiveGateway") {
      const outs = g.outgoing[node.id] ?? [];
      const condOuts = outs.filter((f) => f.condition);
      const freeOuts = outs.filter((f) => !f.condition);
      if (!condOuts.length) { for (const f of freeOuts) walk(dep, g, f.targetRef, visited, depth); return; }
      const ctxFull = { ...ctx };
      const matched = condOuts.filter((f) => {
        try { return evalExpression(f.condition!, ctxFull) === true; } catch { return false; }
      });
      if (node.type === "exclusiveGateway") {
        if (matched.length) walk(dep, g, matched[0].targetRef, visited, depth);
        else if (freeOuts.length) walk(dep, g, freeOuts[0].targetRef, visited, depth);
        else branchStops.push(toPred(dep, node, []));
      } else {
        if (matched.length) for (const f of matched) walk(dep, g, f.targetRef, visited, depth);
        else if (freeOuts.length) for (const f of freeOuts) walk(dep, g, f.targetRef, visited, depth);
        else branchStops.push(toPred(dep, node, []));
      }
      return;
    }
    if (node.type === "parallelGateway") {
      for (const f of g.outgoing[node.id] ?? []) walk(dep, g, f.targetRef, visited, depth);
      return;
    }
    if (node.type === "subProcess" && node.children) {
      // 嵌套图展开（Task 17）：进入内图开始事件游走，出图后沿默认出线继续（visited 全局防环）
      const innerStart = node.children.nodes.find((n) => n.type === "startEvent");
      if (innerStart) walk(dep, g, innerStart.id, visited, depth);
    }
    const f = defaultOut(g, node.id);
    if (f) walk(dep, g, f.targetRef, visited, depth);
  };
  walk(deploy, ir, start.id, visited, 0);
  return { nodes, branchStops, finished };
}

// ---------- 查询辅助（模块层复用） ----------

export function pendingTasksOfUser(userId: string): TaskRow[] {
  const byAssignee = query<TaskRow>("SELECT * FROM WF_TASK_INST WHERE ASSIGNEE = ? AND STATUS = 'PENDING' ORDER BY START_TIME DESC", [String(userId)]);
  const cand = query<{ TASK_ID: string }>("SELECT TASK_ID FROM WF_TASK_CANDIDATE WHERE USER_ID = ?", [String(userId)]);
  let byCandidate: TaskRow[] = [];
  if (cand.length) {
    const ph = cand.map(() => "?").join(",");
    byCandidate = query<TaskRow>(
      `SELECT * FROM WF_TASK_INST WHERE ID IN (${ph}) AND STATUS = 'PENDING' AND ASSIGNEE IS NULL ORDER BY START_TIME DESC`,
      cand.map((c) => c.TASK_ID));
  }
  return [...byAssignee, ...byCandidate];
}

/** 实例当前活跃节点（去重，对齐高亮 active 语义） */
export function currentNodeKeys(instId: string): string[] {
  const rows = query<{ NODE_KEY: string }>("SELECT DISTINCT NODE_KEY FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'PENDING'", [instId]);
  if (rows.length) return rows.map((r) => r.NODE_KEY);
  return query<{ NODE_KEY: string }>("SELECT DISTINCT NODE_KEY FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ? AND STATUS = 'ACTIVE'", [instId])
    .map((r) => r.NODE_KEY);
}
