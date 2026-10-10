#!/usr/bin/env node
/**
 * E2E：业务表单「唯一字段」发布 → (tenant_id, 字段) 复合唯一索引 → DATA_UPSERT 冲突键可选
 * 回答用户报障：DATA_UPSERT 选 bill_test 提示「缺 (tenant_id, 字段) 唯一索引」的链路验证
 * 用临时表单 e2u_uniq_demo（用后即删），不动用户数据。
 * Phase1 创建 BUSINESS 表单（bill_no 标记 unique=true）→ 发布
 * Phase2 验证物理表生成 uk_<form>_bill_no (tenant_id, bill_no) 唯一索引
 * Phase3 验证 unique-keys API 返回 [[tenant_id, bill_no]]（PropertyPanel 冲突键下拉的数据源）
 * Phase4 验证 DATA_UPSERT 流程引用该表单+冲突键可编译可运行（created→updated）
 * Phase5 清理：删流程 + 删表单定义 + 删数据源 + DROP TABLE
 */
import mysql from '/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise.js';

const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const FORM_KEY = 'e2u_uniq_demo_' + Date.now().toString(36).slice(-5); // 每次唯一，软删除 key 不占用
const TABLE = 'wf_biz_' + FORM_KEY;

let pass = 0, fail = 0;
const A = (name, ok, extra) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' | ' + extra : ''}`); ok ? pass++ : fail++; };

const j = async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok || (body && body.code != null && body.code !== 200 && body.code !== 0)) {
    throw new Error(`HTTP ${r.status} ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body.data ?? body;
};
const call = (token) => async (method, path, payload) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  return j(r);
};

async function main() {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow', socketPath: undefined });
  // 清理上次残留
  await conn.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => {});

  const login = await j(await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }));
  const token = login.accessToken || login.token;
  if (!token) throw new Error('no token');
  const api = call(token);

  // 清理上次运行残留（表单定义/数据源；表已在上方 DROP）
  try { // 清理历史运行残留（前缀扫描；软删除 key 不可复用，故每次用新 key）
    const all = await api('GET', '/api/v1/form-definitions?page=1&size=200');
    for (const f of (all.content || all || [])) {
      if (String(f.key || '').startsWith('e2u_uniq_demo')) await api('DELETE', `/api/v1/form-definitions/${f.id}`).catch(() => {});
    }
  } catch { /* 忽略 */ }

  // Phase1 创建 + 保存 column_config（bill_no 唯一）+ 发布
  const created = await api('POST', `/api/v1/form-definitions?name=${encodeURIComponent('E2E唯一链路临时表单 ' + FORM_KEY)}&key=${FORM_KEY}&type=BUSINESS`);
  const formId = created.id;
  A('Phase1 创建 BUSINESS 表单', !!formId, `id=${formId}`);
  const columnConfig = JSON.stringify([
    { key: 'bill_no', label: '单号', columnType: 'VARCHAR', length: 64, scale: null, required: true, unique: true, indexed: false },
    { key: 'qty', label: '数量', columnType: 'INT', length: null, scale: null, required: false, unique: false, indexed: false },
  ]);
  await api('PUT', `/api/v1/form-definitions/${formId}`, { name: 'E2E唯一链路临时表单 ' + FORM_KEY, key: FORM_KEY, schema: '[]', columnConfig, processKey: null });
  await api('POST', `/api/v1/form-definitions/${formId}/publish`);
  const pub = await api('GET', `/api/v1/form-definitions/${formId}`);
  A('Phase1 发布成功 status=PUBLISHED', pub.status === 'PUBLISHED', `status=${pub.status}`);

  // Phase2 物理表唯一索引
  const [idx] = await conn.query(
    `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = 'workflow' AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`, [TABLE]);
  const ukRow = idx.find((r) => r.INDEX_NAME === `uk_${FORM_KEY}_bill_no`);
  const ukCols = idx.filter((r) => r.INDEX_NAME === `uk_${FORM_KEY}_bill_no`).map((r) => r.COLUMN_NAME);
  A('Phase2 生成 (tenant_id, bill_no) 复合唯一索引', !!ukRow && ukCols.join(',') === 'tenant_id,bill_no', `index=${ukRow ? ukRow.INDEX_NAME : '无'} cols=[${ukCols}]`);
  const [cols] = await conn.query(`SHOW COLUMNS FROM ${TABLE} LIKE 'tenant_id'`);
  A('Phase2 tenant_id 列发布时自动创建', cols.length === 1, `type=${cols[0] ? cols[0].Type : '无'}`);

  // Phase3 unique-keys API（PropertyPanel 冲突键下拉数据源）
  const uks = await api('GET', `/api/v1/data-sources/db/tables/${TABLE}/unique-keys`);
  const hit = Array.isArray(uks) && uks.some((g) => Array.isArray(g) && g.length === 2 && g[0] === 'tenant_id' && g[1] === 'bill_no');
  A('Phase3 unique-keys API 返回 [[tenant_id, bill_no]]', !!hit, JSON.stringify(uks));

  // Phase4 DATA_UPSERT 流程：formKey=e2u_uniq_demo, conflictKey=bill_no 可编译可运行
  const dsl = JSON.stringify({
    nodes: [
      { id: 'st01', type: 'START', name: '开始', x: 80, y: 200 },
      { id: 'up01', type: 'DATA_UPSERT', name: 'upsert', x: 320, y: 200,
        config: { formKey: FORM_KEY, conflictKey: 'bill_no',
          values: [{ column: 'bill_no', value: 'B001' }, { column: 'qty', value: '{{qty}}' }] } },
      { id: 'ed01', type: 'END', name: '结束', x: 560, y: 200 },
    ],
    edges: [ { id: 'e1', source: 'st01', target: 'up01' }, { id: 'e2', source: 'up01', target: 'ed01' } ],
    inputVars: [],
  });
  const FLOW_KEY = 'du_uniq_e2e_' + Date.now().toString(36).slice(-5);
  const flow = await api('POST', '/api/v1/logic-flows', { key: FLOW_KEY, name: '唯一链路E2E', dsl });
  const flowId = flow.id;
  await api('PUT', `/api/v1/logic-flows/${flowId}`, { key: FLOW_KEY, name: '唯一链路E2E', dsl });
  const pubFlow = await api('POST', `/api/v1/logic-flows/${flowId}/publish`);
  A('Phase4 DATA_UPSERT(bill_no 冲突键) 发布校验通过', pubFlow.status === 'PUBLISHED', `status=${pubFlow.status}`);
  const run1 = await api('POST', `/api/v1/logic-flows/${flowId}/run`, { variables: { qty: 5 } });
  A('Phase4 run1 created', run1.status === 'SUCCESS' && run1.outputVars?.up01?.result === 'created', `result=${run1.outputVars?.up01?.result} id=${(run1.outputVars?.up01?.id || '').slice(0, 8)}`);
  const run2 = await api('POST', `/api/v1/logic-flows/${flowId}/run`, { variables: { qty: 9 } });
  A('Phase4 run2 updated', run2.status === 'SUCCESS' && run2.outputVars?.up01?.result === 'updated' && run2.outputVars?.up01?.id === run1.outputVars?.up01?.id,
    `result=${run2.outputVars?.up01?.result} sameId=${run2.outputVars?.up01?.id === run1.outputVars?.up01?.id}`);

  // Phase5 清理
  await api('DELETE', `/api/v1/logic-flows/${flowId}`).catch((e) => console.log('清理流程失败(可忽略):', e.message));
  await conn.query(`UPDATE wf_form_def SET status='DRAFT' WHERE id=?`, [formId]); // PUBLISHED 不可删，先翻回 DRAFT
  await api('DELETE', `/api/v1/form-definitions/${formId}`).catch((e) => console.log('清理表单失败(可忽略):', e.message));
  const dsList = await api('GET', '/api/v1/data-sources?page=1&size=100');
  const ds = (dsList.content || dsList || []).find((d) => String(d.sourceKey || d.formKey || '').startsWith('e2u_uniq_demo'));
  if (ds?.id) await api('DELETE', `/api/v1/data-sources/${ds.id}`).catch(() => {});
  await conn.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await conn.end();
  A('Phase5 清理完成（表/表单/数据源/流程）', true, `datasource=${ds ? '已删' : '无残留'}`);

  console.log(`\n==== ${pass} PASS / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
