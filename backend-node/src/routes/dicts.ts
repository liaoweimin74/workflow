/**
 * dicts.ts — /api/dict-types/* + /api/dict-data/*（对齐 DictTypeController + DictDataController 及其
 * ServiceImpl，Task 13-4；两个 Controller 合并一个文件，导出两个 Router）
 *
 * DictType（挂载于 /api/dict-types）：
 *  GET    /api/dict-types          list      dictName/dictCode 模糊 + status（IS_DELETED=0，createdAt DESC）
 *  POST   /api/dict-types          create    无查重：DICT_CODE UNIQUE 约束重复 → 500（与 Java DataIntegrityViolation 一致）
 *  PUT    /api/dict-types/{id}     update    dictName hasText；remark != null；status != null；dictCode 不可改
 *  DELETE /api/dict-types/{id}     delete    软删（Java 不检查 dict-data 引用）
 *
 * DictData（挂载于 /api/dict-data）：
 *  GET    /api/dict-data/{dictCode} list     findByDictCodeOrderBySortOrder → 过滤 isDeleted==0（不过滤 status！含停用项）
 *  POST   /api/dict-data            create   dictCode 必须命中 SYS_DICT_TYPE（findByDictCode 不含 isDeleted 过滤）→ "字典类型不存在"
 *  PUT    /api/dict-data/{id}       update   dictCode 变更时同样校验类型存在；label/value hasText；sortOrder/status != null
 *  DELETE /api/dict-data/{id}       delete   软删
 *
 * Java 端无缓存对象（Redis 已禁用，DictDataServiceImpl 直查库），Node 端同样直查。
 */
import { Router } from 'express';
import { all, one, run, type Row } from '../lib/db';
import { BusinessException } from '../lib/errors';
import { ok, authGuard, ah, ValidationError, type AuthedRequest } from '../lib/http';
import { pageResult } from '../lib/page';
import { toIsoText } from '../lib/serialize';
import {
  bodyInt, bodyStr, hasText, intQuery, jsonBody, nowText, paging, pathId,
} from '../lib/params';

const SIG_DT_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.DictTypeVO> com.workflow.system.controller.DictTypeController.create(com.workflow.system.domain.dto.DictTypeCreateRequest)';
const SIG_DT_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.DictTypeVO> com.workflow.system.controller.DictTypeController.update(java.lang.Long,com.workflow.system.domain.dto.DictTypeUpdateRequest)';
const SIG_DD_CREATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.DictDataVO> com.workflow.system.controller.DictDataController.create(com.workflow.system.domain.dto.DictDataCreateRequest)';
const SIG_DD_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.system.domain.vo.DictDataVO> com.workflow.system.controller.DictDataController.update(java.lang.Long,com.workflow.system.domain.dto.DictDataUpdateRequest)';

export const dictTypesRouter = Router();
export const dictDataRouter = Router();

// ---------------------------------------------------------------- VOs

/** DictTypeVO（record 字段序：id, dictName, dictCode, remark, status, createdAt） */
function dictTypeVO(r: Row): Record<string, unknown> {
  return {
    id: Number(r['ID']),
    dictName: (r['DICT_NAME'] as string | null) ?? null,
    dictCode: (r['DICT_CODE'] as string | null) ?? null,
    remark: (r['REMARK'] as string | null) ?? null,
    status: Number(r['STATUS']),
    createdAt: toIsoText(r['CREATED_AT']),
  };
}

/** DictDataVO（record 字段序：id, dictCode, label, value, sortOrder, status, createdAt） */
function dictDataVO(r: Row): Record<string, unknown> {
  return {
    id: Number(r['ID']),
    dictCode: (r['DICT_CODE'] as string | null) ?? null,
    label: (r['LABEL'] as string | null) ?? null,
    value: (r['VALUE'] as string | null) ?? null,
    sortOrder: Number(r['SORT_ORDER'] ?? 0),
    status: Number(r['STATUS']),
    createdAt: toIsoText(r['CREATED_AT']),
  };
}

// =====================================================================
// DictTypeController — /api/dict-types
// =====================================================================

dictTypesRouter.get(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = paging(q);
    const dictName = q['dictName'] == null ? null : String(Array.isArray(q['dictName']) ? q['dictName'][0] : q['dictName']);
    const dictCode = q['dictCode'] == null ? null : String(Array.isArray(q['dictCode']) ? q['dictCode'][0] : q['dictCode']);
    const status = intQuery(q, 'status');

    const where: string[] = ['IS_DELETED = 0'];
    const params: unknown[] = [];
    if (hasText(dictName)) {
      where.push('DICT_NAME LIKE ?');
      params.push(`%${dictName}%`);
    }
    if (hasText(dictCode)) {
      where.push('DICT_CODE LIKE ?');
      params.push(`%${dictCode}%`);
    }
    if (status != null) {
      where.push('STATUS = ?');
      params.push(status);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM SYS_DICT_TYPE ${whereSql}`, params)?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM SYS_DICT_TYPE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ).map(dictTypeVO);
    ok(res, pageResult(total, page, size, rows));
  }),
);

dictTypesRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = jsonBody(req, SIG_DT_CREATE);
    const dictName = bodyStr(b['dictName']);
    const dictCode = bodyStr(b['dictCode']);
    const remark = bodyStr(b['remark']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：dictCode → dictName）
    if (dictCode == null || dictCode.trim() === '') throw new ValidationError('must not be blank');
    if (dictCode.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (dictName == null || dictName.trim() === '') throw new ValidationError('must not be blank');
    if (dictName.length > 100) throw new ValidationError('size must be between 0 and 100');

    const now = nowText();
    // DICT_CODE UNIQUE：重复码 → 约束异常 500（Java 无业务查重，行为一致；消息文本不逐字对齐）
    const ins = run(
      `INSERT INTO SYS_DICT_TYPE (DICT_NAME, DICT_CODE, REMARK, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [dictName, dictCode, remark, status ?? 1, now, now],
    );
    ok(res, dictTypeVO(one('SELECT * FROM SYS_DICT_TYPE WHERE ID = ?', [Number(ins.lastInsertRowid)]) as Row));
  }),
);

dictTypesRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_DT_UPDATE);
    const dictName = bodyStr(b['dictName']);
    const remark = bodyStr(b['remark']);
    const status = bodyInt(b['status']);
    // @Valid（DictTypeUpdateRequest 仅 dictName @Size(max=100)）
    if (dictName != null && dictName.length > 100) throw new ValidationError('size must be between 0 and 100');

    const row = one('SELECT * FROM SYS_DICT_TYPE WHERE ID = ?', [id]);
    if (!row) throw new BusinessException('字典类型不存在');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(dictName)) {
      sets.push('DICT_NAME = ?');
      params.push(dictName);
    }
    if (remark != null) {
      sets.push('REMARK = ?'); // != null 语义（空串可设）
      params.push(remark);
    }
    if (status != null) {
      sets.push('STATUS = ?');
      params.push(status);
    }
    sets.push('UPDATED_AT = ?');
    params.push(nowText());
    run(`UPDATE SYS_DICT_TYPE SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);
    ok(res, dictTypeVO(one('SELECT * FROM SYS_DICT_TYPE WHERE ID = ?', [id]) as Row));
  }),
);

dictTypesRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    if (!one('SELECT ID FROM SYS_DICT_TYPE WHERE ID = ?', [id])) throw new BusinessException('字典类型不存在'); // existsById（含软删）
    run('UPDATE SYS_DICT_TYPE SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);

// =====================================================================
// DictDataController — /api/dict-data
// =====================================================================

dictDataRouter.get(
  '/:dictCode',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const dictCode = req.params['dictCode'] ?? '';
    // findByDictCodeOrderBySortOrder + isDeleted==0 过滤（status 不影响可见性，停用项也返回）
    const rows = all('SELECT * FROM SYS_DICT_DATA WHERE DICT_CODE = ? ORDER BY SORT_ORDER', [dictCode]).filter(
      (r) => Number(r['IS_DELETED'] ?? 0) === 0,
    );
    ok(res, rows.map(dictDataVO));
  }),
);

dictDataRouter.post(
  '/',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = jsonBody(req, SIG_DD_CREATE);
    const dictCode = bodyStr(b['dictCode']);
    const label = bodyStr(b['label']);
    const value = bodyStr(b['value']);
    const sortOrder = bodyInt(b['sortOrder']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：dictCode → label → value）
    if (dictCode == null || dictCode.trim() === '') throw new ValidationError('must not be blank');
    if (label == null || label.trim() === '') throw new ValidationError('must not be blank');
    if (label.length > 100) throw new ValidationError('size must be between 0 and 100');
    if (value == null || value.trim() === '') throw new ValidationError('must not be blank');
    if (value.length > 100) throw new ValidationError('size must be between 0 and 100');

    // findByDictCode 不含 isDeleted 过滤：软删类型仍可通过校验（对齐 Java）
    if (!one('SELECT ID FROM SYS_DICT_TYPE WHERE DICT_CODE = ?', [dictCode])) {
      throw new BusinessException('字典类型不存在');
    }
    const now = nowText();
    const ins = run(
      `INSERT INTO SYS_DICT_DATA (DICT_CODE, LABEL, VALUE, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [dictCode, label, value, sortOrder ?? 0, status ?? 1, now, now],
    );
    ok(res, dictDataVO(one('SELECT * FROM SYS_DICT_DATA WHERE ID = ?', [Number(ins.lastInsertRowid)]) as Row));
  }),
);

dictDataRouter.put(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    const b = jsonBody(req, SIG_DD_UPDATE);
    const dictCode = bodyStr(b['dictCode']);
    const label = bodyStr(b['label']);
    const value = bodyStr(b['value']);
    const sortOrder = bodyInt(b['sortOrder']);
    const status = bodyInt(b['status']);
    // @Valid（属性字母序：dictCode → label → value）
    if (dictCode != null && dictCode.length > 50) throw new ValidationError('size must be between 0 and 50');
    if (label != null && label.length > 100) throw new ValidationError('size must be between 0 and 100');
    if (value != null && value.length > 100) throw new ValidationError('size must be between 0 and 100');

    const row = one('SELECT * FROM SYS_DICT_DATA WHERE ID = ?', [id]);
    if (!row) throw new BusinessException('字典数据不存在');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (hasText(dictCode)) {
      if (!one('SELECT ID FROM SYS_DICT_TYPE WHERE DICT_CODE = ?', [dictCode])) {
        throw new BusinessException('字典类型不存在'); // 变更 dictCode 时同样校验（不含 isDeleted 过滤）
      }
      sets.push('DICT_CODE = ?');
      params.push(dictCode);
    }
    if (hasText(label)) {
      sets.push('LABEL = ?');
      params.push(label);
    }
    if (hasText(value)) {
      sets.push('VALUE = ?');
      params.push(value);
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
    run(`UPDATE SYS_DICT_DATA SET ${sets.join(', ')} WHERE ID = ?`, [...params, id]);
    ok(res, dictDataVO(one('SELECT * FROM SYS_DICT_DATA WHERE ID = ?', [id]) as Row));
  }),
);

dictDataRouter.delete(
  '/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id'] ?? '');
    if (!one('SELECT ID FROM SYS_DICT_DATA WHERE ID = ?', [id])) throw new BusinessException('字典数据不存在'); // existsById（含软删）
    run('UPDATE SYS_DICT_DATA SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?', [nowText(), id]); // 软删
    ok(res);
  }),
);
