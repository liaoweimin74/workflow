/**
 * 流程设计（草稿 CRUD/发布）——ProcessDesignController 移植（Task 13-6）
 * mount 前缀：/api/v1/process-definitions（7 端点）
 */
/* mount: /api/v1/process-definitions */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, mapRow, pageParams, query, queryOne, tx } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import { deployDraft, getDraft, loadDraftNodeConfigs } from "../../lib/engine/deploy";

const router = Router();

const DRAFT_TABLE = "WF_PROCESS_DRAFT";
const NODE_CONFIG_TABLE = "WF_NODE_CONFIG";

/** POST /drafts：新建草稿 { name, processKey?, categoryId?, bpmnXml? } */
router.post("/drafts", (req: Request, res: Response) => {
  const userId = req.loginUser!.userId;
  const body = req.body as { name?: string; processKey?: string; categoryId?: string; bpmnXml?: string };
  if (!body.name) throw new BusinessException("流程名称不能为空", 400);
  const id = uuid32();
  const processKey = body.processKey || `process-${id.slice(0, 8)}`;
  const now = nowStr();
  const bpmnXml = body.bpmnXml ?? `<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="${body.categoryId ?? ""}">\n  <process id="${processKey}" name="${body.name}" isExecutable="true">\n    <startEvent id="startEvent" name="开始"/>\n    <endEvent id="endEvent" name="结束"/>\n    <sequenceFlow id="flow1" sourceRef="startEvent" targetRef="endEvent"/>\n  </process>\n</definitions>`;
  exec(
    `INSERT INTO WF_PROCESS_DRAFT (ID, BPMN_XML, CATEGORY_ID, CREATED_AT, CREATED_BY, PROCESS_KEY, NAME, STATUS, TENANT_ID, UPDATED_AT, VERSION) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, bpmnXml, body.categoryId ?? null, now, userId, processKey, body.name, "DRAFT", req.headers["x-tenant-id"] as string || "default", now, 1],
  );
  ok(res, mapRow(DRAFT_TABLE, queryOne(`SELECT * FROM WF_PROCESS_DRAFT WHERE ID = ?`, [id])));
});

/** GET /drafts：分页列表（keyword/nameLike） */
router.get("/drafts", (req: Request, res: Response) => {
  const { page, size, offset } = pageParams(req.query as Record<string, unknown>);
  const kw = (req.query.keyword as string) || (req.query.name as string) || "";
  const where = kw ? "WHERE NAME LIKE ? OR PROCESS_KEY LIKE ?" : "";
  const params = kw ? [`%${kw}%`, `%${kw}%`] : [];
  const total = (queryOne<{ C: number }>(`SELECT COUNT(*) C FROM WF_PROCESS_DRAFT ${where}`, params)?.C ?? 0) as number;
  const rows = query(`SELECT * FROM WF_PROCESS_DRAFT ${where} ORDER BY UPDATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, offset] as never[]);
  ok(res, {
    content: rows.map((r) => mapRow(DRAFT_TABLE, r)),
    pageNumber: page, pageSize: size, totalElements: total, totalPages: Math.ceil(total / size),
  });
});

/** GET /{id}/editor：编辑器数据 = 草稿 + bpmnXml + nodeConfigs + processConfig */
router.get("/:id/editor", (req: Request, res: Response) => {
  const draft = getDraft(req.params.id);
  const configs = loadDraftNodeConfigs(draft.ID);
  ok(res, {
    id: draft.ID, name: draft.NAME, processKey: draft.PROCESS_KEY, status: draft.STATUS,
    version: draft.VERSION, categoryId: draft.CATEGORY_ID, bpmnXml: draft.BPMN_XML,
    nodeConfigs: Object.fromEntries(Object.entries(configs).map(([k, v]) => {
      try { return [k, JSON.parse(v)]; } catch { return [k, v]; }
    })),
    processConfig: configs["__PROCESS__"] ? safeJson(configs["__PROCESS__"]) : null,
    deployed: Boolean(draft.DEPLOY_ID), deployId: draft.DEPLOY_ID, lastDeployedAt: draft.LAST_DEPLOYED_AT,
  });
});

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

/** PUT /{id}/design：保存设计 { name?, bpmnXml?, nodeConfigs?, processConfig? } */
router.put("/:id/design", (req: Request, res: Response) => {
  const draft = getDraft(req.params.id);
  const body = req.body as { name?: string; bpmnXml?: string; nodeConfigs?: Record<string, unknown>; processConfig?: unknown };
  tx(() => {
    if (body.name && body.name !== draft.NAME) exec("UPDATE WF_PROCESS_DRAFT SET NAME = ? WHERE ID = ?", [body.name, draft.ID]);
    if (body.bpmnXml) exec("UPDATE WF_PROCESS_DRAFT SET BPMN_XML = ? WHERE ID = ?", [body.bpmnXml, draft.ID]);
    const now = nowStr();
    if (body.nodeConfigs) {
      // 幂等重建编辑中配置
      exec("DELETE FROM WF_NODE_CONFIG WHERE PROCESS_DEF_ID = ? AND PROCESS_DEFINITION_ID IS NULL", [draft.ID]);
      for (const [nodeId, cfg] of Object.entries(body.nodeConfigs)) {
        if (nodeId === "__PROCESS__") continue;
        exec(
          `INSERT INTO ${NODE_CONFIG_TABLE} (ID, CONFIG_JSON, CREATED_AT, NODE_ID, NODE_TYPE, PROCESS_DEF_ID, PROCESS_DEFINITION_ID, TENANT_ID, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuid32(), typeof cfg === "string" ? cfg : JSON.stringify(cfg), now, nodeId, String((cfg as { nodeType?: string })?.nodeType ?? "userTask"), draft.ID, null, draft.TENANT_ID, now],
        );
      }
      // 流程级配置（Task 17 修复）：设计器实际把 __PROCESS__ 内嵌在 nodeConfigs 里发送（designerStore.setProcessConfig），
      // 原实现只认独立 body.processConfig 字段（前端从不发送）→ 编号规则/撤回开关/流程级操作权限/默认表单一直被静默丢弃。
      // 优先独立字段，兼容回退内嵌键；两者均无则不落行（清空语义由显式空对象表达）。
      const embeddedProcCfg = body.nodeConfigs["__PROCESS__"];
      const procCfgRaw =
        body.processConfig !== undefined
          ? JSON.stringify(body.processConfig)
          : embeddedProcCfg !== undefined
            ? typeof embeddedProcCfg === "string" ? embeddedProcCfg : JSON.stringify(embeddedProcCfg)
            : null;
      if (procCfgRaw) {
        exec(
          `INSERT INTO ${NODE_CONFIG_TABLE} (ID, CONFIG_JSON, CREATED_AT, NODE_ID, NODE_TYPE, PROCESS_DEF_ID, PROCESS_DEFINITION_ID, TENANT_ID, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?,?)`,
          [uuid32(), procCfgRaw, now, "__PROCESS__", "process", draft.ID, null, draft.TENANT_ID, now],
        );
      }
    }
    exec("UPDATE WF_PROCESS_DRAFT SET UPDATED_AT = ? WHERE ID = ?", [now, draft.ID]);
  });
  ok(res, { id: draft.ID, saved: true });
});

/** POST /{id}/deploy：发布（解析成功 + hash 防重 + 版本递增） */
router.post("/:id/deploy", (req: Request, res: Response) => {
  ok(res, deployDraft(req.params.id, req.loginUser!.userId));
});

/** POST /{id}/copy：复制草稿 */
router.post("/:id/copy", (req: Request, res: Response) => {
  const src = getDraft(req.params.id);
  const id = uuid32();
  const now = nowStr();
  tx(() => {
    exec(
      `INSERT INTO WF_PROCESS_DRAFT (ID, BPMN_XML, CATEGORY_ID, CREATED_AT, CREATED_BY, PROCESS_KEY, NAME, STATUS, TENANT_ID, UPDATED_AT, VERSION) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, src.BPMN_XML, src.CATEGORY_ID, now, req.loginUser!.userId, `${src.PROCESS_KEY}-copy-${id.slice(0, 6)}`, `${src.NAME}-副本`, "DRAFT", src.TENANT_ID, now, 1],
    );
    for (const r of query<{ NODE_ID: string; NODE_TYPE: string; CONFIG_JSON: string }>(
      "SELECT NODE_ID, NODE_TYPE, CONFIG_JSON FROM WF_NODE_CONFIG WHERE PROCESS_DEF_ID = ? AND PROCESS_DEFINITION_ID IS NULL", [src.ID])) {
      exec(
        `INSERT INTO ${NODE_CONFIG_TABLE} (ID, CONFIG_JSON, CREATED_AT, NODE_ID, NODE_TYPE, PROCESS_DEF_ID, PROCESS_DEFINITION_ID, TENANT_ID, UPDATED_AT) VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuid32(), r.CONFIG_JSON, now, r.NODE_ID, r.NODE_TYPE, id, null, src.TENANT_ID, now],
      );
    }
  });
  ok(res, mapRow(DRAFT_TABLE, queryOne(`SELECT * FROM WF_PROCESS_DRAFT WHERE ID = ?`, [id])));
});

/** DELETE /{id}：删草稿（已部署实例存在时拒绝对齐业务习惯，此处简化为仅删草稿） */
router.delete("/:id", (req: Request, res: Response) => {
  const draft = getDraft(req.params.id);
  const running = queryOne<{ C: number }>("SELECT COUNT(*) C FROM WF_PROC_INST WHERE DRAFT_ID = ? AND STATUS = 'RUNNING'", [draft.ID]);
  if ((running?.C ?? 0) > 0) throw new BusinessException("该流程存在运行中的实例，不能删除", 400);
  tx(() => {
    exec("DELETE FROM WF_NODE_CONFIG WHERE PROCESS_DEF_ID = ?", [draft.ID]);
    exec("DELETE FROM WF_PROCESS_DRAFT WHERE ID = ?", [draft.ID]);
  });
  ok(res, null);
});

export default router;
