/**
 * users.ts — /api/users/*（对齐 UserController + UserServiceImpl，Task 13-4）
 *
 *  GET    /api/users                 list           分页（username/nickname OR phone 模糊、status、orgId、orgIds/roleIds OR 合并）
 *  GET    /api/users/batch           batch          ?ids=1,2（缺省/空 → []；含软删用户；H2 实测按 id 升序）
 *  GET    /api/users/{id}            getById        findById 无 isDeleted 过滤（软删用户仍可见，对齐 Java）
 *  POST   /api/users                 create         密码=BCrypt(GlobalConstant.DEFAULT_PASSWORD)；roleIds 全插
 *  PUT    /api/users/{id}            update         仅更新非空字段；roleIds 与旧值排序比较后全删全插
 *  DELETE /api/users/{id}            delete         软删 is_deleted=1
 *  PUT    /api/users/{id}/status     updateStatus   StatusRequest{status}（无 @Valid）
 *  PUT    /api/users/{id}/reset-password resetPassword 重置为 DEFAULT_PASSWORD
 *
 * 行为对齐细节（Java 源码为准）：
 *  - list WHERE IS_DELETED=0 ORDER BY CREATED_AT DESC（无次级排序，并列顺序与 H2 一样非确定）
 *  - create 重名校验 findByUsername 不含 isDeleted 过滤（软删用户名也会撞）
 *  - create/update 的 @Valid 失败按「属性字母序」报首个错误（Hibernate Validator 经 java.beans Introspector 遍历，8080 实测）
 *  - Java @ManyToMany 关联表带外键：roleIds 指向不存在的角色 → 插入失败 + 事务回滚（HTTP 500）；此处以存在性检查模拟
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, getDb, one, run, type Row } from '../lib/db';
import { BusinessException } from '../lib/errors';
import { ok, authGuard, ah, ValidationError, type AuthedRequest } from '../lib/http';
import { pageResult } from '../lib/page';
import { toIsoText } from '../lib/serialize';
import {
  bodyInt, bodyLong, bodyLongArray, bodyStr, hasText, intQuery, jsonBody,
  longListQuery, longQuery, nowText, paging, pathId,
} from '../lib/params';

/** GlobalConstant.DEFAULT_PASSWORD */
const DEFAULT_PASSWORD = '123456';

const SIG_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.UserVO> com.workflow.system.controller.UserController.create(com.workflow.system.domain.dto.UserCreateRequest)';
const SIG_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.UserVO> com.workflow.system.controller.UserController.update(java.lang.Long,com.workflow.system.domain.dto.UserUpdateRequest)';
const SIG_STATUS =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.system.controller.UserController.updateStatus(java.lang.Long,com.workflow.system.controller.UserController$StatusRequest)';

export const usersRouter = Router();

interface ParsedUser {
  username: string | null;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  orgId: number | null;
  roleIds: Array<number | null> | null;
  status: number | null;
}

function parseCreate(b: Record<string, unknown>): ParsedUser {
  return {
    username: bodyStr(b['username']),
    nickname: bodyStr(b['nickname']),
    email: bodyStr(b['email']),
    phone: bodyStr(b['phone']),
    orgId: bodyLong(b['orgId']),
    roleIds: bodyLongArray(b['roleIds']),
    status: bodyInt(b['status']),
  };
}

function parseUpdate(b: Record<string, unknown>): ParsedUser {
  return parseCreate(b); // 字段同构（username 在 update 中被忽略）
}

/** UserVO（record 字段序：id..roleIds；Long→数字、LocalDateTime→ISO，8080 实测契约） */
function userVO(r: Row): Record<string, unknown> {
  const id = Number(r['ID']);
  const roleIds = all('SELECT ROLE_ID FROM SYS_USER_ROLE WHERE USER_ID = ? ORDER BY ID', [id]).map((x) =>
    Number(x['ROLE_ID']),
  );
  const orgId = r['ORG_ID'] == null ? null : Number(r['ORG_ID']);
  let orgName: string | null = null;
  if (orgId != null) {
    const org = one('SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?', [orgId]);
    orgName = org ? ((org['ORG_NAME'] as string | null) ?? null) : null;
  }
  return {
    id,
    username: String(r['USERNAME']),
    nickname: (r['NICKNAME'] as string | null) ?? null,
    email: (r['EMAIL'] as string | null) ?? null,
    phone: (r['PHONE'] as string | null) ?? null,
    avatar: (r['AVATAR'] as string | null) ?? null,
    orgId,
    orgName,
    status: Number(r['STATUS']),
    createdAt: toIsoText(r['CREATED_AT']),
    roleIds,
  };
}

function loadUserRow(id: number): Row {
  const row = one('SELECT * FROM SYS_USER WHERE ID = ?', [id]);
  if (!row) throw new BusinessException('用户不存在');
  return row;
}

/** 模拟 JPA 关联表外键：roleId 不存在 → 500 + 回滚（Java 为 DataIntegrityViolation，消息文本不逐字对齐） */
function assertRoleExists(roleId: number | null): void {
  if (roleId == null) return; // null 元素交由 NOT NULL 约束在落库时抛 500，与 Java 一致
  if (!one('SELECT ID FROM SYS_ROLE WHERE ID = ?', [roleId])) {
    throw new Error(`could not execute statement; FK violation on SYS_USER_ROLE.ROLE_ID -> SYS_ROLE.ID (roleId=${roleId})`);
  }
}

// ---------------------------------------------------------------- GET /（分页）

usersRouter.get(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = paging(q);
    const username = q['username'] == null ? null : String(Array.isArray(q['username']) ? q['username'][0] : q['username']);
    const nickname = q['nickname'] == null ? null : String(Array.isArray(q['nickname']) ? q['nickname'][0] : q['nickname']);
    const status = intQuery(q, 'status');
    const orgId = longQuery(q, 'orgId');
    const orgIds = longListQuery(q, 'orgIds');
    const roleIds = longListQuery(q, 'roleIds');

    const where: string[] = ['IS_DELETED = 0'];
    const params: unknown[] = [];
    if (hasText(username)) {
      where.push('USERNAME LIKE ?');
      params.push(`%${username}%`);
    }
    if (hasText(nickname)) {
      // nickname/phone 模糊 OR 搜索（UserServiceImpl）
      where.push('(NICKNAME LIKE ? OR PHONE LIKE ?)');
      params.push(`%${nickname}%`, `%${nickname}%`);
    }
    if (status != null) {
      where.push('STATUS = ?');
      params.push(status);
    }
    if (orgId != null) {
      where.push('ORG_ID = ?');
      params.push(orgId);
    }
    // orgIds/roleIds 合并 OR 查询
    const ors: string[] = [];
    if (orgIds != null && orgIds.length > 0) {
      ors.push(`ORG_ID IN (${orgIds.map(() => '?').join(',')})`);
      params.push(...orgIds);
    }
    if (roleIds != null && roleIds.length > 0) {
      ors.push(`ID IN (SELECT USER_ID FROM SYS_USER_ROLE WHERE ROLE_ID IN (${roleIds.map(() => '?').join(',')}))`);
      params.push(...roleIds);
    }
    if (ors.length > 0) where.push(`(${ors.join(' OR ')})`);

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM SYS_USER ${whereSql}`, params)?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM SYS_USER ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ).map(userVO);
    ok(res, pageResult(total, page, size, rows));
  }),
);

// ---------------------------------------------------------------- GET /batch

usersRouter.get(
  '/batch',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const ids = longListQuery(req.query as Record<string, unknown>, 'ids');
    if (ids == null || ids.length === 0) {
      ok(res, []);
      return;
    }
    // findAllById：H2 实测返回按主键升序（与传入顺序无关）
    const rows = all(`SELECT * FROM SYS_USER WHERE ID IN (${ids.map(() => '?').join(',')}) ORDER BY ID`, ids);
    ok(res, rows.map(userVO));
  }),
);

// ---------------------------------------------------------------- POST /

usersRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = jsonBody(req, SIG_CREATE);
    const r = parseCreate(b);
    // @Valid（属性字母序：nickname → username）
    if (r.nickname == null || r.nickname.trim() === '') throw new ValidationError('must not be blank');
    if (r.nickname.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (r.username == null || r.username.trim() === '') throw new ValidationError('must not be blank');
    if (r.username.length < 2 || r.username.length > 50) throw new ValidationError('size must be between 2 and 50');

    // findByUsername 不含 isDeleted 过滤（软删用户名同样视为已存在）
    if (one('SELECT ID FROM SYS_USER WHERE USERNAME = ?', [r.username])) {
      throw new BusinessException('用户名已存在');
    }
    const now = nowText();
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10); // BCryptPasswordEncoder(10)
    const tx = getDb().transaction(() => {
      const ins = run(
        `INSERT INTO SYS_USER (USERNAME, NICKNAME, PASSWORD, EMAIL, PHONE, ORG_ID, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [r.username, r.nickname, hash, r.email, r.phone, r.orgId, r.status ?? 1, now, now],
      );
      const userId = Number(ins.lastInsertRowid);
      if (r.roleIds != null) {
        for (const roleId of r.roleIds) {
          assertRoleExists(roleId);
          run('INSERT INTO SYS_USER_ROLE (USER_ID, ROLE_ID) VALUES (?, ?)', [userId, roleId]);
        }
      }
      return userId;
    });
    const userId = tx() as number;
    const row = one('SELECT * FROM SYS_USER WHERE ID = ?', [userId]) as Row;
    ok(res, userVO(row));
  }),
);

// ---------------------------------------------------------------- GET /{id}

usersRouter.get(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    ok(res, userVO(loadUserRow(id))); // findById 无 isDeleted 过滤
  }),
);

// ---------------------------------------------------------------- PUT /{id}

usersRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_UPDATE);
    const r = parseUpdate(b);
    // @Valid（UserUpdateRequest 仅 nickname @Size(max=50)）
    if (r.nickname != null && r.nickname.length > 50) throw new ValidationError('size must be between 0 and 50');

    loadUserRow(id);
    const now = nowText();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(r.nickname)) {
      sets.push('NICKNAME = ?');
      params.push(r.nickname);
    }
    if (hasText(r.email)) {
      sets.push('EMAIL = ?');
      params.push(r.email);
    }
    if (hasText(r.phone)) {
      sets.push('PHONE = ?');
      params.push(r.phone);
    }
    if (r.orgId != null) {
      sets.push('ORG_ID = ?');
      params.push(r.orgId);
    }
    if (r.status != null) {
      sets.push('STATUS = ?');
      params.push(r.status);
    }
    sets.push('UPDATED_AT = ?'); // @PreUpdate
    params.push(now);
    run(`UPDATE SYS_USER SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);

    // roleIds：排序比较，有变化才全删全插（UserServiceImpl 差异逻辑；null 元素由落库 NOT NULL 约束兜底）
    if (r.roleIds != null) {
      const existing = all('SELECT ROLE_ID FROM SYS_USER_ROLE WHERE USER_ID = ? ORDER BY ID', [id])
        .map((x) => Number(x['ROLE_ID']))
        .sort((a, b2) => a - b2);
      const next = r.roleIds.slice().sort((a, b2) => (a ?? 0) - (b2 ?? 0));
      const same = existing.length === next.length && existing.every((v, i) => v === next[i]);
      if (!same) {
        const tx = getDb().transaction(() => {
          run('DELETE FROM SYS_USER_ROLE WHERE USER_ID = ?', [id]);
          for (const roleId of next) {
            assertRoleExists(roleId);
            run('INSERT INTO SYS_USER_ROLE (USER_ID, ROLE_ID) VALUES (?, ?)', [id, roleId]);
          }
        });
        tx();
      }
    }
    ok(res, userVO(loadUserRow(id)));
  }),
);

// ---------------------------------------------------------------- DELETE /{id}

usersRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    loadUserRow(id);
    run('UPDATE SYS_USER SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);

// ---------------------------------------------------------------- PUT /{id}/status

usersRouter.put(
  '/:id/status',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_STATUS);
    const status = bodyInt(b['status']); // StatusRequest 无 @Valid
    loadUserRow(id);
    run('UPDATE SYS_USER SET STATUS = ?, UPDATED_AT = ? WHERE ID = ?', [status, nowText(), id]); // status=null → NOT NULL 约束 → 500，与 Java 一致
    ok(res);
  }),
);

// ---------------------------------------------------------------- PUT /{id}/reset-password

usersRouter.put(
  '/:id/reset-password',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    loadUserRow(id);
    run('UPDATE SYS_USER SET PASSWORD = ?, UPDATED_AT = ? WHERE ID = ?', [
      bcrypt.hashSync(DEFAULT_PASSWORD, 10),
      nowText(),
      id,
    ]);
    ok(res);
  }),
);
