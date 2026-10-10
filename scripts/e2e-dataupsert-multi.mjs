#!/usr/bin/env node
/**
 * E2E：逻辑流 DATA_UPSERT 多表单写入（config.upserts）验证
 * 前置：mysql2 建临时表 wf_biz_e2u_stock / wf_biz_e2u_ledger（含 (tenant_id, code|order_no) 唯一索引，用后即删）
 * Phase1 多表单新增：START → ups(upserts: u0=stock(code U1,qty 5) + stock=ledger(order_no O1,amount 100)) → END
 *   A1 run SUCCESS；A2 汇总 total=2 created=2 updated=0 + u0/stock.result=created + id 非空；A3 库核验两行
 * Phase2 二次执行同键新值：qty 8 / amount 200 → A4 created=0 updated=2 + 库核验新值 + id 反查回填
 * Phase3 运行期失败整体回滚：ledger.amount 超精度 → A5 run FAILED + stock 值不变（单事务回滚）
 * 完成后删临时流 + 删临时表，不留库。
 */
import mysql from '/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise.js';

const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const KEY = 'du_upsert_multi_e2e';
const T_STOCK = 'wf_biz_e2u_stock';
const T_LEDGER = 'wf_biz_e2u_ledger';

const j = async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok || (body && body.code != null && body.code !== 200 && body.code !== 0)) {
    throw new Error(`HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.data ?? body;
};

const api = (token) => async (method, path, payload) => {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return j(r);
};

const flowDsl = (upsConfig) => JSON.stringify({
  nodes: [
    { id: 'start_e2e01', type: 'START', name: '开始', x: 80, y: 200 },
    { id: 'ups_x', type: 'DATA_UPSERT', name: '多表单写入', x: 320, y: 200, config: upsConfig },
    { id: 'end_e2e001', type: 'END', name: '结束', x: 560, y: 200 },
  ],
  edges: [
    { id: 'e1', source: 'start_e2e01', target: 'ups_x' },
    { id: 'e2', source: 'ups_x', target: 'end_e2e001' },
  ],
  inputVars: [],
});

const UPS_OK = flowDsl({
  upserts: [
    { formKey: 'e2u_stock', conflictKey: 'code',
      values: [{ column: 'code', value: 'U1' }, { column: 'qty', value: '{{qty}}' }] },
    { alias: 'ledger', formKey: 'e2u_ledger', conflictKey: 'order_no',
      values: [{ column: 'order_no', value: 'O1' }, { column: 'amount', value: '{{amount}}' }] },
  ],
});

// Phase3：amount DECIMAL(10,2) 写 99999999999（11 位整数）→ 超精度失败 → 第二句炸、整体回滚
const UPS_ROLLBACK = flowDsl({
  upserts: [
    { formKey: 'e2u_stock', conflictKey: 'code',
      values: [{ column: 'code', value: 'U1' }, { column: 'qty', value: '999' }] },
    { alias: 'ledger', formKey: 'e2u_ledger', conflictKey: 'order_no',
      values: [{ column: 'order_no', value: 'O1' }, { column: 'amount', value: '99999999999' }] },
  ],
});

async function main() {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow' });
  await conn.query(`DROP TABLE IF EXISTS ${T_STOCK}`);
  await conn.query(`DROP TABLE IF EXISTS ${T_LEDGER}`);
  await conn.query(`CREATE TABLE ${T_STOCK} (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, version INT NOT NULL DEFAULT 1, created_by VARCHAR(50), created_at DATETIME(3), updated_at DATETIME(3), code VARCHAR(32) NOT NULL, qty INT, UNIQUE KEY uk_e2u_stock (tenant_id, code))`);
  await conn.query(`CREATE TABLE ${T_LEDGER} (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, version INT NOT NULL DEFAULT 1, created_by VARCHAR(50), created_at DATETIME(3), updated_at DATETIME(3), order_no VARCHAR(32) NOT NULL, amount DECIMAL(10,2), UNIQUE KEY uk_e2u_ledger (tenant_id, order_no))`);

  let pass = 0, fail = 0;
  const A = (name, ok) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`); ok ? pass++ : fail++; };

  try {
    const login = await j(await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }));
    const token = login.accessToken || login.token;
    if (!token) throw new Error('no token');
    const call = api(token);

    const list = await call('GET', '/api/v1/logic-flows?page=1&size=100');
    const rows = list.records || list.list || list.rows || list || [];
    const stale = Array.isArray(rows) ? rows.find((f) => f.flowKey === KEY || f.key === KEY) : null;
    if (stale?.id) { await call('DELETE', `/api/v1/logic-flows/${stale.id}`); console.log('removed stale flow', stale.id); }

    const created = await call('POST', '/api/v1/logic-flows', { key: KEY, name: '数据写入多表E2E（临时）', description: '验证后即删' });
    const id = created.id;
    console.log('created flow:', id);

    try {
      // ===== Phase1 多表单新增 =====
      await call('PUT', `/api/v1/logic-flows/${id}`, { name: '数据写入多表E2E（临时）', description: '验证后即删', dsl: UPS_OK });
      const run1 = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: { qty: 5, amount: 100 } });
      console.log('run1.status =', run1.status, '| errorMessage =', String(run1.errorMessage || '').slice(0, 200));
      const sum = run1.outputVars?.ups_x || {};
      console.log('summary =', JSON.stringify(sum));

      A('A1 Phase1 run SUCCESS', run1.status === 'SUCCESS');
      A('A2 汇总 total=2 created=2 updated=0 + u0/ledger.created + id 非空',
        sum.total === 2 && sum.created === 2 && sum.updated === 0
        && sum.u0?.result === 'created' && sum.u0?.table === T_STOCK && !!sum.u0?.id
        && sum.ledger?.result === 'created' && sum.ledger?.table === T_LEDGER && !!sum.ledger?.id);
      const [stk] = await conn.query(`SELECT code, qty FROM ${T_STOCK}`);
      const [led] = await conn.query(`SELECT order_no, amount FROM ${T_LEDGER}`);
      A('A3 库核验 stock(U1,5) + ledger(O1,100)', stk[0]?.code === 'U1' && stk[0]?.qty === 5 && led[0]?.order_no === 'O1' && Number(led[0]?.amount) === 100);
      const idStock1 = sum.u0?.id;

      // ===== Phase2 同键二写 → updated =====
      const run2 = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: { qty: 8, amount: 200 } });
      const sum2 = run2.outputVars?.ups_x || {};
      console.log('run2 summary =', JSON.stringify(sum2));
      A('A4 二写 created=0 updated=2 + id 反查回填一致',
        run2.status === 'SUCCESS' && sum2.created === 0 && sum2.updated === 2
        && sum2.u0?.result === 'updated' && sum2.u0?.id === idStock1
        && sum2.ledger?.result === 'updated');
      const [stk2] = await conn.query(`SELECT qty FROM ${T_STOCK}`);
      const [led2] = await conn.query(`SELECT amount FROM ${T_LEDGER}`);
      A('A5 库核验 qty=8 + amount=200（更新真实生效）', stk2[0]?.qty === 8 && Number(led2[0]?.amount) === 200);

      // ===== Phase3 运行期失败整体回滚 =====
      await call('PUT', `/api/v1/logic-flows/${id}`, { name: '数据写入多表E2E（临时）', description: '验证后即删', dsl: UPS_ROLLBACK });
      const run3 = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: {} });
      console.log('\nrun3.status =', run3.status);
      console.log('run3.errorMessage =', String(run3.errorMessage || '').slice(0, 200));
      A('A6 run FAILED（第二表单超精度）', run3.status === 'FAILED' && /ups_x|Data|numeric|value/i.test(String(run3.errorMessage || '')));
      const [stk3] = await conn.query(`SELECT qty FROM ${T_STOCK}`);
      A('A7 库核验 stock.qty 仍为 8（首条成功效果随事务回滚）', stk3[0]?.qty === 8);
    } finally {
      await call('DELETE', `/api/v1/logic-flows/${id}`).catch(() => {});
    }
  } finally {
    await conn.query(`DROP TABLE IF EXISTS ${T_STOCK}`).catch(() => {});
    await conn.query(`DROP TABLE IF EXISTS ${T_LEDGER}`).catch(() => {});
    await conn.end();
  }
  console.log(`\n==== RESULT: ${pass} PASS / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(2); });
