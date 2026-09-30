/**
 * orgs.ts — /api/orgs/*（对齐 OrganizationController + OrganizationServiceImpl，Task 13-4）
 *
 *  GET    /api/orgs/tree   tree     部门树：只过滤 isDeleted==0，sortOrder 排序
 *  POST   /api/orgs        create   ORG_CODE 数据库 UNIQUE → 重复码 500（Java 亦为 DB 约束 500，消息文本不同）
 *  PUT    /api/orgs/{id}   update   orgName/orgCode hasText；sortOrder/status != null
 *  DELETE /api/orgs/{id}   delete   子节点（含软删）→ "存在子节点，无法删除"；机构下有用户（含软删）→ "该机构下存在用户，无法删除"；否则软删
 *
 * 树节点 = TreeNode record：id, parentId, label(=ORG_NAME), code(=ORG_CODE), sortOrder, status,
 * children（空数组 → null）——注意 VO 字段名是 label/code，不是 orgName/orgCode。
 */
import { Router } from 'express';
import { all, one, run, type Row } from '../lib/db';
import { BusinessException } from '../lib/errors';
import { ok, authGuard, ah, ValidationError, type AuthedRequest } from '../lib/http';
import { toIsoText } from '../lib/serialize';
import { bodyInt, bodyLong, bodyStr, hasText, jsonBody, nowText, pathId } from '../lib/params';

const SIG_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.TreeNode> com.workflow.system.controller.OrganizationController.create(com.workflow.system.domain.dto.OrganizationCreateRequest)';
const SIG_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.TreeNode> com.workflow.system.controller.OrganizationController.update(java.lang.Long,com.workflow.system.domain.dto.OrganizationUpdateRequest)';

export const orgsRouter = Router();

/** TreeNode（record 字段序：id, parentId, label, code, sortOrder, status, children） */
function treeNode(r: Row): Record<string, unknown> {
  const children = all('SELECT * FROM SYS_ORGANIZATION WHERE PARENT_ID = ? ORDER BY SORT_ORDER', [Number(r['ID'])])
    .filter((c) => Number(c['IS_DELETED'] ?? 0) === 0)
    .map(treeNode);
  return {
    id: Number(r['ID']),
    parentId: r['PARENT_ID'] == null ? null : Number(r['PARENT_ID']),
    label: (r['ORG_NAME'] as string | null) ?? null,
    code: (r['ORG_CODE'] as string | null) ?? null,
    sortOrder: Number(r['SORT_ORDER'] ?? 0),
    status: Number(r['STATUS'] ?? 1),
    children: children.length === 0 ? null : children,
  };
}

function loadOrgRow(id: number): Row {
  const row = one('SELECT * FROM SYS_ORGANIZATION WHERE ID = ?', [id]);
  if (!row) throw new BusinessException('组织机构不存在');
  return row;
}

// ---------------------------------------------------------------- GET /tree

orgsRouter.get(
  '/tree',
  authGuard,
  ah(async (_req: AuthedRequest, res) => {
    const roots = all('SELECT * FROM SYS_ORGANIZATION WHERE PARENT_ID IS NULL ORDER BY SORT_ORDER').filter(
      (r) => Number(r['IS_DELETED'] ?? 0) === 0,
    );
    ok(res, roots.map(treeNode));
  }),
);

// ---------------------------------------------------------------- POST /

orgsRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = jsonBody(req, SIG_CREATE);
    const parentId = bodyLong(b['parentId']);
    const orgName = bodyStr(b['orgName']);
    const orgCode = bodyStr(b['orgCode']);
    const sortOrder = bodyInt(b['sortOrder']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：orgCode → orgName；8080 实测 orgCode 错误优先）
    if (orgCode == null || orgCode.trim() === '') throw new ValidationError('must not be blank');
    if (orgCode.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (orgName == null || orgName.trim() === '') throw new ValidationError('must not be blank');
    if (orgName.length > 100) throw new ValidationError('size must be between 0 and 100');

    const now = nowText();
    // ORG_CODE UNIQUE：重复码 → SQLite 约束异常 → 500（Java 为 DataIntegrityViolation → 500）
    const ins = run(
      `INSERT INTO SYS_ORGANIZATION (PARENT_ID, ORG_NAME, ORG_CODE, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [parentId, orgName, orgCode, sortOrder ?? 0, status ?? 1, now, now],
    );
    ok(res, treeNode(one('SELECT * FROM SYS_ORGANIZATION WHERE ID = ?', [Number(ins.lastInsertRowid)]) as Row));
  }),
);

// ---------------------------------------------------------------- PUT /{id}

orgsRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_UPDATE);
    const orgName = bodyStr(b['orgName']);
    const orgCode = bodyStr(b['orgCode']);
    const sortOrder = bodyInt(b['sortOrder']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：orgCode → orgName）
    if (orgCode != null && orgCode.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (orgName != null && orgName.length > 100) throw new ValidationError('size must be between 0 and 100');

    loadOrgRow(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(orgName)) {
      sets.push('ORG_NAME = ?');
      params.push(orgName);
    }
    if (hasText(orgCode)) {
      sets.push('ORG_CODE = ?'); // hasText 语义（Java 为 StringUtils.hasText）；重复码 → UNIQUE 约束 500
      params.push(orgCode);
    }
    if (sortOrder != null) {
      sets.push('SORT_ORDER = ?');
      params.push(sortOrder);
    }
    if (status != null) {
      sets.push('STATUS = ?');
      params.push(status);
    }
    sets.push('UPDATED_AT = ?');
    params.push(nowText());
    run(`UPDATE SYS_ORGANIZATION SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);
    ok(res, treeNode(loadOrgRow(id)));
  }),
);

// ---------------------------------------------------------------- DELETE /{id}

orgsRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    if (!one('SELECT ID FROM SYS_ORGANIZATION WHERE ID = ?', [id])) throw new BusinessException('组织机构不存在'); // existsById（含软删）
    const childCount = Number(
      one('SELECT COUNT(*) AS C FROM SYS_ORGANIZATION WHERE PARENT_ID = ?', [id])?.['C'] ?? 0, // 含软删子节点
    );
    if (childCount > 0) throw new BusinessException('存在子节点，无法删除');
    // countByOrgId 不含 isDeleted 过滤：软删用户同样阻止删除
    const userCount = Number(one('SELECT COUNT(*) AS C FROM SYS_USER WHERE ORG_ID = ?', [id])?.['C'] ?? 0);
    if (userCount > 0) throw new BusinessException('该机构下存在用户，无法删除');
    run('UPDATE SYS_ORGANIZATION SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);
