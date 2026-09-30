/**
 * 组织机构管理 —— 1:1 移植 OrganizationController + OrganizationServiceImpl（Task 13-4）
 * 4 端点：GET /tree / POST / PUT {id} / DELETE {id}
 * 语义要点（对齐 Java 源码）：
 *  - tree() 同菜单：根 PARENT_ID IS NULL ORDER BY SORT_ORDER，逐层仅滤 IS_DELETED=0（不过滤 STATUS）
 *  - ⚠️ VO 字段差异：TreeNode 的 JSON 字段是 label / code（对应实体 orgName / orgCode），含 status，children 空 → null
 *  - 更新：orgName/orgCode 走 hasText，sortOrder/status 走 null 判断；无 parentId 字段（不能改父级）
 *  - 删除三连检：existsById（含软删）→ 组织机构不存在；countByParentId（含软删子节点）→ 存在子节点，无法删除；
 *    userRepository.countByOrgId（不过滤软删用户）→ 该机构下存在用户，无法删除
 */
/* mount: /api/orgs */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows } from "../../lib/db";
import { bodyInt, bodyLong, hasText, nowStr, parseId, vNotBlank, vSize } from "./shared";

const router = Router();

type Row = Record<string, unknown>;

interface OrgRow {
  id: string;
  parentId: string | null;
  orgName: string;
  orgCode: string;
  sortOrder: number | null;
  status: number | null;
  leaderId: string | null;
}

/** 主管昵称查询（VO 展示用，无主管或用户已删 → null） */
function leaderNameOf(leaderId: string | null): string | null {
  if (leaderId == null) return null;
  const u = queryOne<{ NICKNAME: string | null; USERNAME: string }>(
    "SELECT NICKNAME, USERNAME FROM SYS_USER WHERE ID = ? AND IS_DELETED = 0",
    [leaderId]);
  return u ? (u.NICKNAME ?? u.USERNAME) : null;
}

/** TreeNode VO（orgName → label、orgCode → code，children 空 → null） */
function toTree(o: OrgRow, kidsOf: (id: number) => OrgRow[]): Row {
  const children = kidsOf(Number(o.id)).map((c) => toTree(c, kidsOf));
  return {
    id: String(o.id),
    parentId: o.parentId != null ? String(o.parentId) : null,
    label: o.orgName,
    code: o.orgCode,
    sortOrder: o.sortOrder != null ? Number(o.sortOrder) : null,
    status: o.status != null ? Number(o.status) : null,
    // 部门主管（Task 16：dept_head 审批人解析数据源）
    leaderId: o.leaderId != null ? String(o.leaderId) : null,
    leaderName: leaderNameOf(o.leaderId),
    children: children.length ? children : null,
  };
}

/** H2 ORDER BY SORT_ORDER ASC 语义：NULL 最前，数值次之，id 兜底保证确定性 */
function cmp(a: OrgRow, b: OrgRow): number {
  const sa = a.sortOrder, sb = b.sortOrder;
  if (sa == null && sb != null) return -1;
  if (sa != null && sb == null) return 1;
  if (sa != sb) return Number(sa) - Number(sb);
  return Number(a.id) - Number(b.id);
}

function loadIndex() {
  const all = queryRows("SYS_ORGANIZATION", "SELECT * FROM SYS_ORGANIZATION WHERE IS_DELETED = 0") as unknown as OrgRow[];
  const byParent = new Map<number, OrgRow[]>();
  for (const o of all) {
    if (o.parentId == null) continue;
    const p = Number(o.parentId);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(o);
  }
  const kidsOf = (id: number) => (byParent.get(id) ?? []).sort(cmp);
  return { all, kidsOf };
}

function findRaw(id: string): OrgRow | null {
  return (queryRows("SYS_ORGANIZATION", "SELECT * FROM SYS_ORGANIZATION WHERE ID = ?", [id])[0] ?? null) as unknown as OrgRow | null;
}

/** GET /api/orgs/tree — 全量组织树（仅滤软删） */
router.get(
  "/tree",
  h((_req: Request, res: Response) => {
    const { all, kidsOf } = loadIndex();
    ok(
      res,
      all
        .filter((o) => o.parentId == null)
        .sort(cmp)
        .map((o) => toTree(o, kidsOf)),
    );
  }),
);

/** POST /api/orgs — 创建 */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.orgName);
    vSize(b.orgName, 100);
    vNotBlank(b.orgCode);
    vSize(b.orgCode, 50);
    const r = exec(
      `INSERT INTO SYS_ORGANIZATION (PARENT_ID, ORG_NAME, ORG_CODE, LEADER_ID, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        bodyLong(b.parentId),
        String(b.orgName),
        String(b.orgCode),
        bodyLong(b.leaderId),
        bodyInt(b.sortOrder) ?? 0,
        bodyInt(b.status) ?? 1,
        nowStr(),
        nowStr(),
      ],
    );
    ok(res, toTree(findRaw(String(Number(r.lastInsertRowid)))!, () => []));
  }),
);

/** PUT /api/orgs/{id} — 更新（orgName/orgCode hasText，sortOrder/status null 判断） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.orgName, 100);
    vSize(b.orgCode, 50);
    const row = findRaw(id);
    if (!row) throw new BusinessException("组织机构不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.orgName)) {
      sets.push("ORG_NAME = ?");
      params.push(String(b.orgName));
    }
    if (hasText(b.orgCode)) {
      sets.push("ORG_CODE = ?");
      params.push(String(b.orgCode));
    }
    const sortOrder = bodyInt(b.sortOrder);
    if (sortOrder != null) {
      sets.push("SORT_ORDER = ?");
      params.push(sortOrder);
    }
    const status = bodyInt(b.status);
    if (status != null) {
      sets.push("STATUS = ?");
      params.push(status);
    }
    // 主管：字段出现才处理（undefined 不动；null/空串清空；值设置）
    if (b.leaderId !== undefined) {
      const leaderId = bodyLong(b.leaderId);
      if (leaderId != null) {
        const u = queryOne<{ ID: string }>("SELECT ID FROM SYS_USER WHERE ID = ? AND IS_DELETED = 0", [leaderId]);
        if (!u) throw new BusinessException("部门主管用户不存在");
        sets.push("LEADER_ID = ?");
        params.push(leaderId);
      } else {
        sets.push("LEADER_ID = NULL");
      }
    }
    exec(`UPDATE SYS_ORGANIZATION SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
    const { kidsOf } = loadIndex();
    ok(res, toTree(findRaw(id)!, kidsOf));
  }),
);

/** DELETE /api/orgs/{id} — 子节点 + 用户占用检查后软删 */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const exists = queryOne("SELECT ID FROM SYS_ORGANIZATION WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("组织机构不存在");
    const children = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM SYS_ORGANIZATION WHERE PARENT_ID = ?", [id])!.c;
    if (children > 0) throw new BusinessException("存在子节点，无法删除");
    // countByOrgId 不过滤软删用户：已删用户仍占用机构
    const users = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM SYS_USER WHERE ORG_ID = ?", [id])!.c;
    if (users > 0) throw new BusinessException("该机构下存在用户，无法删除");
    exec("UPDATE SYS_ORGANIZATION SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

export default router;
