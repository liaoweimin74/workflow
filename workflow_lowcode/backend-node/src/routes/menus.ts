/**
 * menus.ts — /api/menus/*（对齐 MenuController + MenuServiceImpl，Task 13-4）
 *
 *  GET    /api/menus/tree   tree     全量菜单树：只过滤 isDeleted==0（不过滤 status！），sortOrder 排序
 *  POST   /api/menus        create   ⚠️ Java 源码缺陷复刻：MenuCreateRequest.menuType 上误用 @NotBlank
 *                                    （Integer 非 CharSequence）→ Hibernate Validator 抛 HV000030 →
 *                                    任何合法 JSON 请求体都是 HTTP 500（8080 实测），此处原样对齐
 *  PUT    /api/menus/{id}   update   仅更新非空字段（path/component/permission/icon 为 != null 语义，空串可设）
 *  DELETE /api/menus/{id}   delete   有子菜单（含软删）→ "存在子菜单，无法删除"；否则软删
 *
 * 树节点 = MenuTree record：id, parentId, menuName, menuType, path, component, permission,
 * icon, sortOrder, children（空数组 → null；不含 status 字段）。
 * 树构建与 lib/menu-tree.ts 的区别：MenuServiceImpl 只过滤 isDeleted；AuthServiceImpl 过滤 isDeleted+status。
 */
import { Router } from 'express';
import { all, one, run, type Row } from '../lib/db';
import { BusinessException } from '../lib/errors';
import { ok, authGuard, ah, ValidationError, type AuthedRequest } from '../lib/http';
import { toIsoText } from '../lib/serialize';
import { bodyInt, bodyStr, hasText, jsonBody, nowText, pathId } from '../lib/params';
import { menuRow, type MenuRow } from '../lib/menu-tree';

const SIG_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.MenuTree> com.workflow.system.controller.MenuController.create(com.workflow.system.domain.dto.MenuCreateRequest)';
const SIG_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.MenuTree> com.workflow.system.controller.MenuController.update(java.lang.Long,com.workflow.system.domain.dto.MenuUpdateRequest)';

/** Hibernate Validator HV000030（8080 实测，POST /api/menus 必现） */
const HV000030 =
  "HV000030: No validator could be found for constraint 'jakarta.validation.constraints.NotBlank' validating type 'java.lang.Integer'. Check configuration for 'menuType'";

export const menusRouter = Router();

/** MenuServiceImpl.toMenuTree：仅过滤 isDeleted，children 空时 null */
function menuTreeNode(m: MenuRow): Record<string, unknown> {
  const children = all('SELECT * FROM SYS_MENU WHERE PARENT_ID = ? ORDER BY SORT_ORDER', [m.ID])
    .map(menuRow)
    .filter((c) => c.IS_DELETED === 0)
    .map(menuTreeNode);
  return {
    id: m.ID,
    parentId: m.PARENT_ID,
    menuName: m.MENU_NAME,
    menuType: m.MENU_TYPE,
    path: m.PATH,
    component: m.COMPONENT,
    permission: m.PERMISSION,
    icon: m.ICON,
    sortOrder: m.SORT_ORDER,
    children: children.length === 0 ? null : children,
  };
}

function loadMenuRow(id: number): Row {
  const row = one('SELECT * FROM SYS_MENU WHERE ID = ?', [id]);
  if (!row) throw new BusinessException('菜单不存在');
  return row;
}

// ---------------------------------------------------------------- GET /tree

menusRouter.get(
  '/tree',
  authGuard,
  ah(async (_req: AuthedRequest, res) => {
    const roots = all('SELECT * FROM SYS_MENU WHERE PARENT_ID IS NULL ORDER BY SORT_ORDER')
      .map(menuRow)
      .filter((m) => m.IS_DELETED === 0)
      .map(menuTreeNode);
    ok(res, roots);
  }),
);

// ---------------------------------------------------------------- POST /

menusRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    jsonBody(req, SIG_CREATE); // 请求体存在性校验先行（缺失 → Required request body is missing）
    // @Valid 在 menuType 上必抛 HV000030（Java 端 create 全场景 500），字段级错误永远轮不到
    throw new Error(HV000030);
  }),
);

// ---------------------------------------------------------------- PUT /{id}

menusRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_UPDATE);
    const menuName = bodyStr(b['menuName']);
    const menuType = bodyInt(b['menuType']);
    const path = bodyStr(b['path']);
    const component = bodyStr(b['component']);
    const permission = bodyStr(b['permission']);
    const icon = bodyStr(b['icon']);
    const sortOrder = bodyInt(b['sortOrder']);
    const status = bodyInt(b['status']);
    // @Valid（MenuUpdateRequest 全部为 @Size，属性字母序：component → icon → menuName → path → permission）
    if (component != null && component.length > 255) throw new ValidationError('size must be between 0 and 255');
    if (icon != null && icon.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (menuName != null && menuName.length > 100) throw new ValidationError('size must be between 0 and 100');
    if (path != null && path.length > 200) throw new ValidationError('size must be between 0 and 200');
    if (permission != null && permission.length > 100) throw new ValidationError('size must be between 0 and 100');

    loadMenuRow(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(menuName)) {
      sets.push('MENU_NAME = ?');
      params.push(menuName);
    }
    if (menuType != null) {
      sets.push('MENU_TYPE = ?');
      params.push(menuType);
    }
    if (path != null) {
      sets.push('PATH = ?'); // != null 语义（空串可设）
      params.push(path);
    }
    if (component != null) {
      sets.push('COMPONENT = ?');
      params.push(component);
    }
    if (permission != null) {
      sets.push('PERMISSION = ?');
      params.push(permission);
    }
    if (icon != null) {
      sets.push('ICON = ?');
      params.push(icon);
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
    run(`UPDATE SYS_MENU SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);
    ok(res, menuTreeNode(menuRow(loadMenuRow(id))));
  }),
);

// ---------------------------------------------------------------- DELETE /{id}

menusRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    if (!one('SELECT ID FROM SYS_MENU WHERE ID = ?', [id])) throw new BusinessException('菜单不存在'); // existsById（含软删）
    // countByParentId 不含 isDeleted 过滤：软删子菜单同样阻止删除（对齐 Java）
    const childCount = Number(one('SELECT COUNT(*) AS C FROM SYS_MENU WHERE PARENT_ID = ?', [id])?.['C'] ?? 0);
    if (childCount > 0) throw new BusinessException('存在子菜单，无法删除');
    run('UPDATE SYS_MENU SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);
