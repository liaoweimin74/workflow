/**
 * 字典类型管理 —— 1:1 移植 DictTypeController + DictTypeServiceImpl（Task 13-4）
 * 4 端点：GET list / POST / PUT {id} / DELETE {id}
 * 语义要点（对齐 Java 源码）：
 *  - 分页同 users：PageResult{total,page,size,rows}（total 字符串），排序 createdAt DESC
 *  - ⚠️ 创建不校验 dictCode 唯一（Java 无此校验，重复编码可创建）
 *  - 更新：dictName 走 hasText，remark 走 null 判断（空串清空备注），status 走 null 判断
 *  - 删除：existsById → 字典类型不存在 → 软删；不检查字典数据引用（Java 无此校验）
 */
/* mount: /api/dict-types */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows } from "../../lib/db";
import { bodyInt, hasText, nowStr, pageOf, parseId, parseLongOpt, vNotBlank, vSize } from "./shared";

const router = Router();

type Row = Record<string, unknown>;

/** DictTypeVO 组装 */
function toVO(r: Row): Row {
  return {
    id: String(r.id),
    dictName: (r.dictName as string | null) ?? null,
    dictCode: (r.dictCode as string | null) ?? null,
    remark: (r.remark as string | null) ?? null,
    status: Number(r.status),
    createdAt: (r.createdAt as string | null) ?? null,
  };
}

function findRaw(id: string): Row | null {
  return queryRows("SYS_DICT_TYPE", "SELECT * FROM SYS_DICT_TYPE WHERE ID = ?", [id])[0] ?? null;
}

/** GET /api/dict-types — 分页 + dictName/dictCode 模糊 + status 精确 */
router.get(
  "/",
  h((req: Request, res: Response) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = pageOf(q);
    const where: string[] = ["IS_DELETED = 0"];
    const params: unknown[] = [];
    if (hasText(q.dictName)) {
      where.push("DICT_NAME LIKE ?");
      params.push(`%${q.dictName}%`);
    }
    if (hasText(q.dictCode)) {
      where.push("DICT_CODE LIKE ?");
      params.push(`%${q.dictCode}%`);
    }
    const status = parseLongOpt(q.status);
    if (status != null) {
      where.push("STATUS = ?");
      params.push(status);
    }
    const whereSql = where.join(" AND ");
    const total = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM SYS_DICT_TYPE WHERE ${whereSql}`, params)!.c;
    const rows = queryRows(
      "SYS_DICT_TYPE",
      `SELECT * FROM SYS_DICT_TYPE WHERE ${whereSql} ORDER BY CREATED_AT DESC, ID DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    ok(res, { total: String(total), page, size, rows: rows.map(toVO) });
  }),
);

/** POST /api/dict-types — 创建（无编码唯一校验，Java 语义） */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.dictName);
    vSize(b.dictName, 100);
    vNotBlank(b.dictCode);
    vSize(b.dictCode, 50);
    const r = exec(
      `INSERT INTO SYS_DICT_TYPE (DICT_NAME, DICT_CODE, REMARK, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [
        String(b.dictName),
        String(b.dictCode),
        b.remark != null ? String(b.remark) : null,
        bodyInt(b.status) ?? 1,
        nowStr(),
        nowStr(),
      ],
    );
    ok(res, toVO(findRaw(String(Number(r.lastInsertRowid)))!));
  }),
);

/** PUT /api/dict-types/{id} — 更新（remark 传 null 才不动，空串清空） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.dictName, 100);
    const row = findRaw(id);
    if (!row) throw new BusinessException("字典类型不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.dictName)) {
      sets.push("DICT_NAME = ?");
      params.push(String(b.dictName));
    }
    if (b.remark != null) {
      sets.push("REMARK = ?");
      params.push(String(b.remark));
    }
    const status = bodyInt(b.status);
    if (status != null) {
      sets.push("STATUS = ?");
      params.push(status);
    }
    exec(`UPDATE SYS_DICT_TYPE SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
    ok(res, toVO(findRaw(id)!));
  }),
);

/** DELETE /api/dict-types/{id} — 软删（不检查字典数据引用，Java 语义） */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const exists = queryOne("SELECT ID FROM SYS_DICT_TYPE WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("字典类型不存在");
    exec("UPDATE SYS_DICT_TYPE SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

export default router;
