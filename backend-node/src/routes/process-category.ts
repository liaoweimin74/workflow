/**
 * process-category.ts — 流程分类模块（对齐 CategoryController，/api/v1/categories，5 端点）
 *
 *  GET    /api/v1/categories          list   分类扁平列表（sort_order 升序）
 *  GET    /api/v1/categories/tree     tree   分类树（Java buildTree 实际只返回 parentId 为空的根节点，
 *                                            children 由前端按 parentId 自行构建，后端仅扁平列表）
 *  POST   /api/v1/categories          create @RequestBody Map{name, parentId?, sortOrder?}
 *  PUT    /api/v1/categories/{id}     update @PathVariable String id + @RequestBody Map
 *  DELETE /api/v1/categories/{id}     delete 有子分类拒绝（"请先删除子分类"）
 *
 * 对齐要点（2026-09-16 8080 实测金标准）：
 *  - Category 实体 JSON 键序（Jackson 字母序）：createdAt, id, name, parentId, sortOrder, tenantId
 *  - id = UUID（无连字符，32 位）；sortOrder 缺省 0；createdAt 库内秒精度 → ISO T 分隔输出
 *  - 错误逐字：未找到 → HTTP500 "Category not found: {id}"；有子分类 → HTTP500 "请先删除子分类"；
 *    name 缺失 → HTTP500 H2 NOT NULL 语义（捕获原文）；@RequestBody 缺失 → HTTP500
 *    "Required request body is missing: <方法签名>"；无 token → HTTP401 R.unauthorized
 *  - 删除子分类检查不区分租户（Java findByParentId 无租户过滤）——保持一致不自行加严
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { all, one, run, type Row } from '../lib/db';
import { ok, authGuard, ah, type AuthedRequest } from '../lib/http';
import { toIsoText } from '../lib/serialize';
import { nowText, jsonBody, bodyStr } from '../lib/params';
import { tenantOf } from './shared';

export const processCategoryRouter = Router();

processCategoryRouter.use(authGuard);

// ---------------------------------------------------------------- 行读取

interface CategoryRow {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

function asCategory(r: Row | null): CategoryRow | null {
  if (!r) return null;
  return {
    id: String(r['id']),
    tenant_id: String(r['tenant_id']),
    name: String(r['name']),
    parent_id: (r['parent_id'] as string | null) ?? null,
    sort_order: r['sort_order'] == null ? 0 : Number(r['sort_order']),
    created_at: String(r['created_at'] ?? ''),
  };
}

/** Category 实体 JSON（Jackson 3 字母序） */
function categoryJson(r: CategoryRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    sortOrder: r.sort_order,
    tenantId: r.tenant_id,
  };
}

function findCategory(id: string, tenantId: string): CategoryRow {
  const r = asCategory(one(`SELECT * FROM wf_category WHERE "id" = ?`, [id]));
  // Java: findById(id).filter(c -> c.getTenantId().equals(tenantId))
  if (!r || r.tenant_id !== tenantId) throw new Error(`Category not found: ${id}`);
  return r;
}

// ---------------------------------------------------------------- 路由

/** GET /api/v1/categories — 扁平列表（findByTenantIdOrderBySortOrderAsc） */
processCategoryRouter.get(
  '/api/v1/categories',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const rows = all(`SELECT * FROM wf_category WHERE "tenant_id" = ? ORDER BY "sort_order" ASC`, [tenant]);
    ok(res, rows.map((r) => categoryJson(asCategory(r)!)));
  }),
);

/** GET /api/v1/categories/tree — 根节点列表（parentId 为空；Java buildTree(all, null)） */
processCategoryRouter.get(
  '/api/v1/categories/tree',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const rows = all(`SELECT * FROM wf_category WHERE "tenant_id" = ? AND "parent_id" IS NULL ORDER BY "sort_order" ASC`, [tenant]);
    ok(res, rows.map((r) => categoryJson(asCategory(r)!)));
  }),
);

/** POST /api/v1/categories — 新建分类 */
processCategoryRouter.post(
  '/api/v1/categories',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const body = jsonBody(
      req,
      'public com.workflow.common.domain.R<com.workflow.engine.process.entity.Category> com.workflow.api.controller.CategoryController.create(java.util.Map<java.lang.String, java.lang.Object>)',
    );
    const name = bodyStr(body['name']);
    const parentId = bodyStr(body['parentId']);
    const rawSort = body['sortOrder'];
    let sortOrder: number;
    if (rawSort == null) {
      sortOrder = 0;
    } else if (typeof rawSort === 'number') {
      sortOrder = Math.trunc(rawSort);
    } else if (typeof rawSort === 'boolean') {
      throw new Error('class java.lang.Boolean cannot be cast to class java.lang.Integer');
    } else if (typeof rawSort === 'string') {
      const n = Number(rawSort);
      if (!Number.isInteger(n)) {
        throw new Error('class java.lang.String cannot be cast to class java.lang.Integer');
      }
      sortOrder = n;
    } else {
      throw new Error('class java.util.LinkedHashMap cannot be cast to class java.lang.Integer');
    }
    if (name == null) {
      // H2 实库 NOT NULL（8080 实测捕获原文）
      throw new Error(
        'could not execute statement [NULL not allowed for column "NAME"; SQL statement:\ninsert into wf_category (created_at,name,parent_id,sort_order,tenant_id,id) values (?,?,?,?,?,?) [23502-240]] [insert into wf_category (created_at,name,parent_id,sort_order,tenant_id,id) values (?,?,?,?,?,?)]; SQL [insert into wf_category (created_at,name,parent_id,sort_order,tenant_id,id) values (?,?,?,?,?,?)]; constraint [NAME]',
      );
    }
    const id = randomUUID().replace(/-/g, '');
    const now = nowText();
    run(
      `INSERT INTO wf_category ("id", "tenant_id", "name", "parent_id", "sort_order", "created_at") VALUES (?, ?, ?, ?, ?, ?)`,
      [id, tenant, name, parentId, sortOrder, now],
    );
    ok(
      res,
      categoryJson({
        id,
        tenant_id: tenant,
        name,
        parent_id: parentId,
        sort_order: sortOrder,
        created_at: now,
      }),
    );
  }),
);

/** PUT /api/v1/categories/{id} — 更新分类（仅覆盖非 null 字段） */
processCategoryRouter.put(
  '/api/v1/categories/:id',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const body = jsonBody(
      req,
      'public com.workflow.common.domain.R<com.workflow.engine.process.entity.Category> com.workflow.api.controller.CategoryController.update(java.lang.String,java.util.Map<java.lang.String, java.lang.Object>)',
    );
    const name = bodyStr(body['name']);
    const parentId = bodyStr(body['parentId']);
    const rawSort = body['sortOrder'];
    const sortOrder =
      rawSort == null ? null : typeof rawSort === 'number' ? Math.trunc(rawSort) : typeof rawSort === 'string' ? (Number.isInteger(Number(rawSort)) ? Number(rawSort) : null) : null;
    if (rawSort != null && sortOrder == null) {
      throw new Error('class java.lang.String cannot be cast to class java.lang.Integer');
    }

    const cur = findCategory(id, tenant);
    const next: CategoryRow = {
      ...cur,
      name: name ?? cur.name,
      parent_id: parentId ?? cur.parent_id,
      sort_order: sortOrder ?? cur.sort_order,
    };
    run(`UPDATE wf_category SET "name" = ?, "parent_id" = ?, "sort_order" = ? WHERE "id" = ?`, [
      next.name,
      next.parent_id,
      next.sort_order,
      id,
    ]);
    ok(res, categoryJson(next));
  }),
);

/** DELETE /api/v1/categories/{id} — 删除（有子分类拒绝，消息逐字） */
processCategoryRouter.delete(
  '/api/v1/categories/:id',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    findCategory(id, tenant);
    // Java findByParentId(id) 无租户过滤——保持一致
    const children = all(`SELECT "id" FROM wf_category WHERE "parent_id" = ?`, [id]);
    if (children.length > 0) {
      throw new Error('请先删除子分类');
    }
    run(`DELETE FROM wf_category WHERE "id" = ?`, [id]);
    ok(res);
  }),
);
