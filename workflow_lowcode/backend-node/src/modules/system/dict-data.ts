/**
 * 字典数据管理 —— 1:1 移植 DictDataController + DictDataServiceImpl（Task 13-4）
 * 4 端点：GET {dictCode} / POST / PUT {id} / DELETE {id}
 * 语义要点（对齐 Java 源码）：
 *  - GET /{dictCode}：按 DICT_CODE 分组查询，ORDER BY SORT_ORDER，再滤 IS_DELETED=0（不过滤 STATUS，禁用项也返回）
 *  - 创建/更新 dictCode 时校验 SYS_DICT_TYPE.findByDictCode 存在（不过滤软删类型 → 软删类型仍可挂数据，Java 就是这样）
 *  - 更新：dictCode/label/value 走 hasText，sortOrder/status 走 null 判断
 *  - 删除：existsById → 字典数据不存在 → 软删
 *  - 路由注意：GET /:dictCode 是动态段（POST/PUT/DELETE 走 / 与 /:id，互不冲突）
 */
/* mount: /api/dict-data */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows } from "../../lib/db";
import { bodyInt, hasText, nowStr, parseId, vNotBlank, vSize } from "./shared";

const router = Router();

type Row = Record<string, unknown>;

/** DictDataVO 组装 */
function toVO(r: Row): Row {
  return {
    id: String(r.id),
    dictCode: (r.dictCode as string | null) ?? null,
    label: (r.label as string | null) ?? null,
    value: (r.value as string | null) ?? null,
    sortOrder: r.sortOrder != null ? Number(r.sortOrder) : null,
    status: Number(r.status),
    createdAt: (r.createdAt as string | null) ?? null,
  };
}

function findRaw(id: string): Row | null {
  return queryRows("SYS_DICT_DATA", "SELECT * FROM SYS_DICT_DATA WHERE ID = ?", [id])[0] ?? null;
}

/** dictTypeRepository.findByDictCode：不过滤软删（Java 语义） */
function typeExists(dictCode: string): boolean {
  return !!queryOne("SELECT ID FROM SYS_DICT_TYPE WHERE DICT_CODE = ?", [dictCode]);
}

/** GET /api/dict-data/{dictCode} — 按类型编码取字典数据（含禁用项，仅滤软删） */
router.get(
  "/:dictCode",
  h((req: Request, res: Response) => {
    const rows = queryRows(
      "SYS_DICT_DATA",
      "SELECT * FROM SYS_DICT_DATA WHERE DICT_CODE = ? ORDER BY SORT_ORDER, ID",
      [req.params.dictCode],
    );
    ok(res, rows.filter((r) => Number(r.isDeleted) === 0).map(toVO));
  }),
);

/** POST /api/dict-data — 创建（dictType 必须存在） */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.dictCode);
    vNotBlank(b.label);
    vSize(b.label, 100);
    vNotBlank(b.value);
    vSize(b.value, 100);
    if (!typeExists(String(b.dictCode))) throw new BusinessException("字典类型不存在");
    const r = exec(
      `INSERT INTO SYS_DICT_DATA (DICT_CODE, LABEL, VALUE, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        String(b.dictCode),
        String(b.label),
        String(b.value),
        bodyInt(b.sortOrder) ?? 0,
        bodyInt(b.status) ?? 1,
        nowStr(),
        nowStr(),
      ],
    );
    ok(res, toVO(findRaw(String(Number(r.lastInsertRowid)))!));
  }),
);

/** PUT /api/dict-data/{id} — 更新（dictCode 变更须重新校验类型存在） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.dictCode, 50);
    vSize(b.label, 100);
    vSize(b.value, 100);
    const row = findRaw(id);
    if (!row) throw new BusinessException("字典数据不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.dictCode)) {
      if (!typeExists(String(b.dictCode))) throw new BusinessException("字典类型不存在");
      sets.push("DICT_CODE = ?");
      params.push(String(b.dictCode));
    }
    if (hasText(b.label)) {
      sets.push("LABEL = ?");
      params.push(String(b.label));
    }
    if (hasText(b.value)) {
      sets.push("VALUE = ?");
      params.push(String(b.value));
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
    exec(`UPDATE SYS_DICT_DATA SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
    ok(res, toVO(findRaw(id)!));
  }),
);

/** DELETE /api/dict-data/{id} — 软删 */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const exists = queryOne("SELECT ID FROM SYS_DICT_DATA WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("字典数据不存在");
    exec("UPDATE SYS_DICT_DATA SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

export default router;
