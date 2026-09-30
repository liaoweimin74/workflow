/**
 * roles.ts — /api/roles/*（对齐 RoleController + RoleServiceImpl，Task 13-4）
 *
 *  GET    /api/roles            list         roleName/roleCode 模糊 + status（IS_DELETED=0，createdAt DESC）
 *  POST   /api/roles            create       findByRoleCode 查重（不含 isDeleted 过滤）→ "角色编码已存在"
 *  PUT    /api/roles/{id}       update       roleName hasText；description != null（空串可设）；status != null；roleCode 不可改
 *  DELETE /api/roles/{id}       delete       角色下有用户 → "该角色下存在用户，无法删除"；否则软删
 *  GET    /api/roles/{id}/menus getRoleMenus 已授权菜单 id（SQL 无 ORDER BY，顺序为库扫描序）
 *  PUT    /api/roles/{id}/menus assignMenus  全删全插（menuIds 指向不存在菜单 → 外键回滚，模拟 Java）
 *
 * delete/assignMenus 用 existsById（无 isDeleted 过滤）：软删角色重复删除不报错，与 Java 一致。
 */
import { Router } from 'express';
import { all, getDb, one, run, type Row } from '../lib/db';
import { BusinessException } from '../lib/errors';
import { ok, authGuard, ah, ValidationError, type AuthedRequest } from '../lib/http';
import { pageResult } from '../lib/page';
import { toIsoText } from '../lib/serialize';
import {
  bodyInt, bodyStr, bodyLongArray, hasText, intQuery, jsonBody, nowText, paging, pathId,
} from '../lib/params';

const SIG_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.RoleVO> com.workflow.system.controller.RoleController.create(com.workflow.system.domain.dto.RoleCreateRequest)';
const SIG_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.RoleVO> com.workflow.system.controller.RoleController.update(java.lang.Long,com.workflow.system.domain.dto.RoleUpdateRequest)';
const SIG_MENUS =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.system.controller.RoleController.assignMenus(java.lang.Long,com.workflow.system.controller.RoleController$MenuIdsRequest)';

export const rolesRouter = Router();

/** RoleVO（record 字段序：id, roleName, roleCode, description, status, createdAt） */
function roleVO(r: Row): Record<string, unknown> {
  return {
    id: Number(r['ID']),
    roleName: (r['ROLE_NAME'] as string | null) ?? null,
    roleCode: (r['ROLE_CODE'] as string | null) ?? null,
    description: (r['DESCRIPTION'] as string | null) ?? null,
    status: Number(r['STATUS']),
    createdAt: toIsoText(r['CREATED_AT']),
  };
}

function loadRoleRow(id: number): Row {
  const row = one('SELECT * FROM SYS_ROLE WHERE ID = ?', [id]);
  if (!row) throw new BusinessException('角色不存在');
  return row;
}

// ---------------------------------------------------------------- GET /（分页）

rolesRouter.get(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = paging(q);
    const roleName = q['roleName'] == null ? null : String(Array.isArray(q['roleName']) ? q['roleName'][0] : q['roleName']);
    const roleCode = q['roleCode'] == null ? null : String(Array.isArray(q['roleCode']) ? q['roleCode'][0] : q['roleCode']);
    const status = intQuery(q, 'status');

    const where: string[] = ['IS_DELETED = 0'];
    const params: unknown[] = [];
    if (hasText(roleName)) {
      where.push('ROLE_NAME LIKE ?');
      params.push(`%${roleName}%`);
    }
    if (hasText(roleCode)) {
      where.push('ROLE_CODE LIKE ?');
      params.push(`%${roleCode}%`);
    }
    if (status != null) {
      where.push('STATUS = ?');
      params.push(status);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM SYS_ROLE ${whereSql}`, params)?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM SYS_ROLE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ).map(roleVO);
    ok(res, pageResult(total, page, size, rows));
  }),
);

// ---------------------------------------------------------------- POST /

rolesRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = jsonBody(req, SIG_CREATE);
    const roleName = bodyStr(b['roleName']);
    const roleCode = bodyStr(b['roleCode']);
    const description = bodyStr(b['description']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：roleCode → roleName）
    if (roleCode == null || roleCode.trim() === '') throw new ValidationError('must not be blank');
    if (roleCode.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (roleName == null || roleName.trim() === '') throw new ValidationError('must not be blank');
    if (roleName.length > 100) throw new ValidationError('size must be between 0 and 100');

    // findByRoleCode 不含 isDeleted 过滤
    if (one('SELECT ID FROM SYS_ROLE WHERE ROLE_CODE = ?', [roleCode])) {
      throw new BusinessException('角色编码已存在');
    }
    const now = nowText();
    const ins = run(
      `INSERT INTO SYS_ROLE (ROLE_NAME, ROLE_CODE, DESCRIPTION, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [roleName, roleCode, description, status ?? 1, now, now],
    );
    const row = one('SELECT * FROM SYS_ROLE WHERE ID = ?', [Number(ins.lastInsertRowid)]) as Row;
    ok(res, roleVO(row));
  }),
);

// ---------------------------------------------------------------- PUT /{id}

rolesRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_UPDATE);
    const roleName = bodyStr(b['roleName']);
    const description = bodyStr(b['description']);
    const status = bodyInt(b['status']);
    // @Valid（RoleUpdateRequest 仅 roleName @Size(max=100)）
    if (roleName != null && roleName.length > 100) throw new ValidationError('size must be between 0 and 100');

    loadRoleRow(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(roleName)) {
      sets.push('ROLE_NAME = ?');
      params.push(roleName);
    }
    if (description != null) {
      sets.push('DESCRIPTION = ?'); // != null 语义：空串可写入（对齐 Java，非 hasText）
      params.push(description);
    }
    if (status != null) {
      sets.push('STATUS = ?');
      params.push(status);
    }
    sets.push('UPDATED_AT = ?');
    params.push(nowText());
    run(`UPDATE SYS_ROLE SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);
    ok(res, roleVO(loadRoleRow(id)));
  }),
);

// ---------------------------------------------------------------- DELETE /{id}

rolesRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    if (!one('SELECT ID FROM SYS_ROLE WHERE ID = ?', [id])) throw new BusinessException('角色不存在'); // existsById（含软删）
    const userCount = Number(one('SELECT COUNT(*) AS C FROM SYS_USER_ROLE WHERE ROLE_ID = ?', [id])?.['C'] ?? 0);
    if (userCount > 0) throw new BusinessException('该角色下存在用户，无法删除');
    run('UPDATE SYS_ROLE SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);

// ---------------------------------------------------------------- GET /{id}/menus

rolesRouter.get(
  '/:id/menus',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    // findByRoleId 无 ORDER BY：Java 返回 H2 扫描序，此处行 id 序（同属"未定义顺序"，集合语义一致）
    const rows = all('SELECT MENU_ID FROM SYS_ROLE_MENU WHERE ROLE_ID = ?', [id]);
    ok(res, rows.map((r) => Number(r['MENU_ID'])));
  }),
);

// ---------------------------------------------------------------- PUT /{id}/menus

rolesRouter.put(
  '/:id/menus',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_MENUS);
    const menuIds = bodyLongArray(b['menuIds']); // 无 @Valid；null → Java NPE → 500，此处 for..of null 同样 500
    if (!one('SELECT ID FROM SYS_ROLE WHERE ID = ?', [id])) throw new BusinessException('角色不存在');
    const tx = getDb().transaction(() => {
      run('DELETE FROM SYS_ROLE_MENU WHERE ROLE_ID = ?', [id]);
      for (const menuId of menuIds as Array<number | null>) {
        if (menuId != null && !one('SELECT ID FROM SYS_MENU WHERE ID = ?', [menuId])) {
          // 模拟 JPA 关联表外键（Java：DataIntegrityViolation → 500 + 回滚；消息不逐字对齐）
          throw new Error(`could not execute statement; FK violation on SYS_ROLE_MENU.MENU_ID -> SYS_MENU.ID (menuId=${menuId})`);
        }
        run('INSERT INTO SYS_ROLE_MENU (ROLE_ID, MENU_ID) VALUES (?, ?)', [id, menuId]);
      }
    });
    tx();
    ok(res);
  }),
);
