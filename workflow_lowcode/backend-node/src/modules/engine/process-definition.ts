/**
 * 已部署流程定义——ProcessDefinitionController 移植（Task 13-6）
 * mount 前缀：/api/v1/deployed-processes（8 端点）
 * XML 视图 = WF_PROC_DEPLOY.DIAGRAM_JSON（BPMN XML 字符串，供前端 bpmn-js 渲染）。
 */
/* mount: /api/v1/deployed-processes */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, mapRow, pageParams, query, queryOne } from "../../lib/db";
import { nowStr } from "../../lib/dialect";
import { loadLatestDeployByKey, resolveInitiatorNode, getIR } from "../../lib/engine/engine";
import { configMapOf } from "../../lib/engine/engine";
import { deployConfigViews } from "../../lib/engine/deploy";

const router = Router();

function viewDeploy(d: Record<string, unknown>) {
  const row = d as { ID: string; PROC_KEY: string; PROC_NAME: string | null; VERSION: number; DEPLOYED_AT: string | null; DRAFT_ID: string; TENANT_ID?: string | null };
  // 字段对齐 Java toMap（ProcessDefinitionController）：id/key/name/version/description/deploymentId/.../suspended
  return {
    id: row.ID, key: row.PROC_KEY, processKey: row.PROC_KEY, name: row.PROC_NAME, version: row.VERSION,
    description: null, deploymentId: row.ID, resourceName: null, diagramResourceName: null,
    tenantId: row.TENANT_ID ?? null, category: null, suspended: false,
    deployedAt: row.DEPLOYED_AT, draftId: row.DRAFT_ID,
  };
}

/**
 * 对齐 Java ProcessDefinitionController.resolveFormDefIds：
 * 发起人节点表单 > 流程级默认表单（表单与字段权限同层取，不跨层合并）
 */
function resolveFormDefIds(nodeConfigs: Record<string, Record<string, unknown>>, initiatorNodeId: string | null): {
  formDefId: string | null; fieldPermissions: unknown; initiatorFormDefId: string | null; processFormDefId: string | null;
} {
  const formOf = (cfg: Record<string, unknown> | undefined): { formDefId: string | null; fieldPermissions: unknown } | null => {
    const form = cfg?.form as Record<string, unknown> | undefined;
    if (!form || form.formDefId == null) return null;
    return { formDefId: String(form.formDefId), fieldPermissions: form.fieldPermissions ?? null };
  };
  const processCfg = formOf(nodeConfigs["__PROCESS__"]);
  const initiatorCfg = initiatorNodeId ? formOf(nodeConfigs[initiatorNodeId]) : null;
  const effective = initiatorCfg ?? processCfg;
  return {
    formDefId: effective?.formDefId ?? null,
    fieldPermissions: effective?.fieldPermissions ?? null,
    initiatorFormDefId: initiatorCfg?.formDefId ?? null,
    processFormDefId: processCfg?.formDefId ?? null,
  };
}

/** GET /：已部署定义分页列表（nameLike/keyLike） */
router.get("/", (req: Request, res: Response) => {
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const kw = (req.query.name as string) || (req.query.keyword as string) || "";
  const key = (req.query.key as string) || "";
  const conds: string[] = [];
  const params: unknown[] = [];
  if (kw) { conds.push("PROC_NAME LIKE ?"); params.push(`%${kw}%`); }
  if (key) { conds.push("PROC_KEY = ?"); params.push(key); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const total = (queryOne<{ C: number }>(`SELECT COUNT(*) C FROM WF_PROC_DEPLOY ${where}`, params)?.C ?? 0) as number;
  const rows = query(`SELECT * FROM WF_PROC_DEPLOY ${where} ORDER BY PROC_KEY, VERSION DESC LIMIT ? OFFSET ?`,
    [...params, size, offset] as never[]);
  ok(res, { content: rows.map(viewDeploy), pageNumber: page, pageSize: size, totalElements: total, totalPages: Math.ceil(total / size) });
});

/** GET /summaries：按 key 去重的最新定义列表（发起入口下拉用） */
router.get("/summaries", (_req: Request, res: Response) => {
  const rows = query<{ PROC_KEY: string }>("SELECT DISTINCT PROC_KEY FROM WF_PROC_DEPLOY");
  const out = rows.map((r) => viewDeploy(loadLatestDeployByKey(r.PROC_KEY) as unknown as Record<string, unknown>));
  ok(res, out);
});

/** GET /{id}：定义详情（含节点配置视图与发起节点解析） */
router.get("/:id", (req: Request, res: Response) => {
  const d = queryOne<Record<string, unknown>>("SELECT * FROM WF_PROC_DEPLOY WHERE ID = ?", [req.params.id]);
  if (!d) throw new BusinessException("流程定义不存在", 404);
  const { nodeConfigs, processConfig } = deployConfigViews(d as never);
  const ir = getIR(d as never);
  const initiator = resolveInitiatorNode(ir);
  const formIds = resolveFormDefIds(nodeConfigs as Record<string, Record<string, unknown>>, initiator?.id ?? null);
  ok(res, {
    ...viewDeploy(d),
    ...formIds,
    initiatorNode: initiator ? { nodeId: initiator.id, nodeName: initiator.name ?? initiator.id } : null,
    nodes: ir.process.nodes.map((n) => ({ nodeId: n.id, nodeName: n.name ?? n.id, nodeType: n.type, multiInstance: Boolean(n.multiInstance) })),
    nodeConfigs, processConfig,
  });
});

/** GET /{id}/xml：BPMN XML（R<String> 信封，对齐 Java getXml） */
router.get("/:id/xml", (req: Request, res: Response) => {
  const d = queryOne<{ DIAGRAM_JSON: string | null }>("SELECT DIAGRAM_JSON FROM WF_PROC_DEPLOY WHERE ID = ?", [req.params.id]);
  if (!d) throw new BusinessException("流程定义不存在", 404);
  const xml = typeof d.DIAGRAM_JSON === "string" ? d.DIAGRAM_JSON : JSON.stringify(d.DIAGRAM_JSON ?? "");
  ok(res, xml);
});

/** GET /key/{key}/versions：同 key 全部版本（倒序） */
router.get("/key/:key/versions", (req: Request, res: Response) => {
  const rows = query("SELECT * FROM WF_PROC_DEPLOY WHERE PROC_KEY = ? ORDER BY VERSION DESC", [req.params.key]);
  ok(res, rows.map(viewDeploy));
});

/** GET /versions/{procDefId}/editor：指定版本的编辑器数据（历史版本查看） */
router.get("/versions/:procDefId/editor", (req: Request, res: Response) => {
  const d = queryOne<Record<string, unknown>>("SELECT * FROM WF_PROC_DEPLOY WHERE ID = ?", [req.params.procDefId]);
  if (!d) throw new BusinessException("流程定义不存在", 404);
  const { nodeConfigs, processConfig } = deployConfigViews(d as never);
  ok(res, {
    ...viewDeploy(d), bpmnXml: (d as { DIAGRAM_JSON?: string }).DIAGRAM_JSON ?? "", nodeConfigs, processConfig, readonly: true,
  });
});

/** POST /{id}/suspend：停用（启动入口禁用；自研以 SUSPENDED 标记） */
router.post("/:id/suspend", (req: Request, res: Response) => {
  exec("UPDATE WF_PROC_DEPLOY SET DEPLOYED_BY = DEPLOYED_BY WHERE ID = ?", [req.params.id]);
  // 定义级停用标记：部署快照无状态列，用 WF_ENGINE_SEQ 旁路键记录（TODO: 增加状态列）
  setDeployFlag(req.params.id, "SUSPENDED");
  ok(res, null);
});

/** POST /{id}/activate：启用 */
router.post("/:id/activate", (req: Request, res: Response) => {
  setDeployFlag(req.params.id, "ACTIVE");
  ok(res, null);
});

function setDeployFlag(id: string, status: string): void {
  const seqKey = `wf_deploy_status:${id}`;
  const exists = queryOne("SELECT SEQ_KEY FROM WF_ENGINE_SEQ WHERE SEQ_KEY = ?", [seqKey]);
  if (exists) exec("UPDATE WF_ENGINE_SEQ SET SEQ_VALUE = ? WHERE SEQ_KEY = ?", [status === "SUSPENDED" ? 1 : 0, seqKey]);
  else exec("INSERT INTO WF_ENGINE_SEQ (SEQ_KEY, SEQ_VALUE) VALUES (?,?)", [seqKey, status === "SUSPENDED" ? 1 : 0]);
}

export function isDeploySuspended(id: string): boolean {
  return (queryOne<{ SEQ_VALUE: number }>("SELECT SEQ_VALUE FROM WF_ENGINE_SEQ WHERE SEQ_KEY = ?", [`wf_deploy_status:${id}`])?.SEQ_VALUE ?? 0) === 1;
}

// 供 start 校验引用
void nowStr; void configMapOf;

export default router;
