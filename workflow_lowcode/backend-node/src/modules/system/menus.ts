/**
 * 菜单管理（管理端全量树）—— 1:1 移植 MenuController + MenuServiceImpl（Task 13-4）
 * 4 端点：GET /tree / POST / PUT {id} / DELETE {id}
 * 语义要点（对齐 Java 源码）：
 *  - tree()：根节点 PARENT_ID IS NULL ORDER BY SORT_ORDER，逐层递归，每层仅过滤 IS_DELETED=0（不过滤 STATUS ——
 *    禁用菜单在管理端树中仍显示；与 /api/auth/menus 的 AuthServiceImpl 语义不同，那边才滤 status==1）
 *  - MenuTree VO 无 status 字段；children 为空时输出 null（Java childTrees.isEmpty() ? null : childTrees）
 *  - MenuCreateRequest.menuType 是 @NotBlank Integer —— jakarta NotBlankValidator 不支持 Integer，
 *    Java 实际运行必抛 HV000030 → 500；移植按 @NotNull 语义（"must not be null"）实现，不复刻该缺陷
 *  - 更新：menuName 走 hasText，其余字段走 null 判断（path/component/permission/icon 传空串即清空）；无 parentId 字段（不能改父级）
 *  - 删除：existsById（含软删）→ 菜单不存在；countByParentId 不过滤软删 → 软删子菜单也会阻止删除（Java 就是这样）
 */
/* mount: /api/menus */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows } from "../../lib/db";
import { bodyInt, bodyLong, hasText, nowStr, parseId, vNotBlank, vNotNull, vSize } from "./shared";

const router = Router();

type Row = Record<string, unknown>;

interface MenuRow {
  id: string;
  parentId: string | null;
  menuName: string;
  menuType: number;
  path: string | null;
  component: string | null;
  permission: string | null;
  icon: string | null;
  sortOrder: number | null;
}

/** MenuTree VO（对齐 MenuServiceImpl.toMenuTree：children 空 → null；无 status 字段） */
function toTree(m: MenuRow, kidsOf: (id: number) => MenuRow[]): Row {
  const children = kidsOf(Number(m.id)).map((c) => toTree(c, kidsOf));
  return {
    id: String(m.id),
    parentId: m.parentId != null ? String(m.parentId) : null,
    menuName: m.menuName,
    menuType: Number(m.menuType),
    path: m.path ?? null,
    component: m.component ?? null,
    permission: m.permission ?? null,
    icon: m.icon ?? null,
    sortOrder: m.sortOrder != null ? Number(m.sortOrder) : null,
    children: children.length ? children : null,
  };
}

/** H2 ORDER BY SORT_ORDER ASC 语义：NULL 最前，其次数值，最后 id 兜底保证确定性 */
function cmp(a: MenuRow, b: MenuRow): number {
  const sa = a.sortOrder, sb = b.sortOrder;
  if (sa == null && sb != null) return -1;
  if (sa != null && sb == null) return 1;
  if (sa != sb) return Number(sa) - Number(sb);
  return Number(a.id) - Number(b.id);
}

/** 全量非软删菜单索引 + 逐层递归（等同 Java 每层 findByParentIdOrderBySortOrder + filter isDeleted） */
function loadIndex() {
  const all = queryRows("SYS_MENU", "SELECT * FROM SYS_MENU WHERE IS_DELETED = 0") as unknown as MenuRow[];
  const byParent = new Map<number, MenuRow[]>();
  for (const m of all) {
    if (m.parentId == null) continue;
    const p = Number(m.parentId);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(m);
  }
  const kidsOf = (id: number) => (byParent.get(id) ?? []).sort(cmp);
  return { all, kidsOf };
}

/** GET /api/menus/tree — 管理端全量菜单树（仅滤软删，不滤禁用） */
router.get(
  "/tree",
  h((_req: Request, res: Response) => {
    const { all, kidsOf } = loadIndex();
    ok(
      res,
      all
        .filter((m) => m.parentId == null)
        .sort(cmp)
        .map((m) => toTree(m, kidsOf)),
    );
  }),
);

function findRaw(id: string): MenuRow | null {
  return (queryRows("SYS_MENU", "SELECT * FROM SYS_MENU WHERE ID = ?", [id])[0] ?? null) as unknown as MenuRow | null;
}

/** POST /api/menus — 创建 */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.menuName);
    vSize(b.menuName, 100);
    vNotNull(b.menuType);
    vSize(b.path, 200);
    vSize(b.component, 255);
    vSize(b.permission, 100);
    vSize(b.icon, 50);
    const r = exec(
      `INSERT INTO SYS_MENU (PARENT_ID, MENU_NAME, MENU_TYPE, PATH, COMPONENT, PERMISSION, ICON, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        bodyLong(b.parentId),
        String(b.menuName),
        bodyInt(b.menuType) as number,
        b.path != null ? String(b.path) : null,
        b.component != null ? String(b.component) : null,
        b.permission != null ? String(b.permission) : null,
        b.icon != null ? String(b.icon) : null,
        bodyInt(b.sortOrder) ?? 0,
        bodyInt(b.status) ?? 1,
        nowStr(),
        nowStr(),
      ],
    );
    ok(res, toTree(findRaw(String(Number(r.lastInsertRowid)))!, () => []));
  }),
);

/** PUT /api/menus/{id} — 更新（menuName hasText，其余 null 判断） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.menuName, 100);
    vSize(b.path, 200);
    vSize(b.component, 255);
    vSize(b.permission, 100);
    vSize(b.icon, 50);
    const row = findRaw(id);
    if (!row) throw new BusinessException("菜单不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.menuName)) {
      sets.push("MENU_NAME = ?");
      params.push(String(b.menuName));
    }
    const menuType = bodyInt(b.menuType);
    if (menuType != null) {
      sets.push("MENU_TYPE = ?");
      params.push(menuType);
    }
    for (const [field, col] of [["path", "PATH"], ["component", "COMPONENT"], ["permission", "PERMISSION"], ["icon", "ICON"]] as const) {
      if (b[field] != null) {
        sets.push(`${col} = ?`);
        params.push(String(b[field]));
      }
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
    exec(`UPDATE SYS_MENU SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
    // 更新返回该节点子树（Java toMenuTree 会递归查询 children）
    const { kidsOf } = loadIndex();
    ok(res, toTree(findRaw(id)!, kidsOf));
  }),
);

/** DELETE /api/menus/{id} — 子菜单占用检查（含软删子菜单）后软删 */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const exists = queryOne("SELECT ID FROM SYS_MENU WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("菜单不存在");
    const children = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM SYS_MENU WHERE PARENT_ID = ?", [id])!.c;
    if (children > 0) throw new BusinessException("存在子菜单，无法删除");
    exec("UPDATE SYS_MENU SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

export default router;
