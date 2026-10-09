#!/usr/bin/env node
/**
 * E2E：逻辑流 DATA_UPDATE 多表更新（config.updates）验证
 * 前置：mysql2 建临时表 wf_biz_dumulti_order / wf_biz_dumulti_stock（用后即删）
 * Phase1 多表成功：START → du1(多表: 别名 order 改 wf_biz_dumulti_order + 序号项改 wf_biz_dumulti_stock) → END
 *   A1 run SUCCESS
 *   A2 du1 汇总：total=2 affected=3 + 别名键 order.affected=1 + 序号键 t1.affected=2（{{var}} 参数绑定真实生效）
 *   A3 库核验：order.status=PAID（SET {{newStatus}}），stock 两行 qty 各减 2（SUB 字面量）
 * Phase2 运行期失败回滚：改 DSL 为 du_rb(多表: stock ADD 100 先成功 + order.status SET 超长串失败) → run
 *   A4 run FAILED（任一表失败节点抛错走 errorAction），错误含 Data too long
 *   A5 库核验：stock.qty 未 +100、order.status 仍 PAID（单事务整体回滚，第一句成功效果不落库）
 * 完成后删临时流 + 删临时表，不留库。
 */
import mysql from '/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise.js';

const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const KEY = 'du_multi_e2e';
const T_ORDER = 'wf_biz_dumulti_order';
const T_STOCK = 'wf_biz_dumulti_stock';

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

const flowDsl = (duConfig) => JSON.stringify({
  nodes: [
    { id: 'start_e2e01', type: 'START', name: '开始', x: 80, y: 200 },
    { id: 'du_x', type: 'DATA_UPDATE', name: '多表更新', x: 320, y: 200, config: duConfig },
    { id: 'end_e2e001', type: 'END', name: '结束', x: 560, y: 200 },
  ],
  edges: [
    { id: 'e1', source: 'start_e2e01', target: 'du_x' },
    { id: 'e2', source: 'du_x', target: 'end_e2e001' },
  ],
  inputVars: [],
});

const DSL_OK = flowDsl({
  updates: [
    { alias: 'order', table: T_ORDER,
      setOps: [{ column: 'status', mode: 'SET', value: '{{newStatus}}' }],
      where: [{ column: 'id', op: 'EQ', value: '{{orderId}}' }] },
    { table: T_STOCK,
      setOps: [{ column: 'qty', mode: 'SUB', value: '2' }],
      where: [{ column: 'sku', op: 'EQ', value: 'A1' }] },
  ],
});

// 运行期失败：order.status VARCHAR(16)，SET 25 字符超长串 → Data too long（严格模式）→ 第二句失败
const DSL_ROLLBACK = flowDsl({
  updates: [
    { table: T_STOCK,
      setOps: [{ column: 'qty', mode: 'ADD', value: '100' }],
      where: [{ column: 'sku', op: 'EQ', value: 'A1' }] },
    { table: T_ORDER,
      setOps: [{ column: 'status', mode: 'SET', value: '0123456789012345678901234' }],
      where: [{ column: 'id', op: 'EQ', value: '1' }] },
  ],
});

async function main() {
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow' });
  await conn.query(`DROP TABLE IF EXISTS ${T_ORDER}`);
  await conn.query(`DROP TABLE IF EXISTS ${T_STOCK}`);
  await conn.query(`CREATE TABLE ${T_ORDER} (id BIGINT PRIMARY KEY, status VARCHAR(16), amount DECIMAL(10,2))`);
  await conn.query(`CREATE TABLE ${T_STOCK} (sku VARCHAR(32), qty INT)`);

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

    const created = await call('POST', '/api/v1/logic-flows', { key: KEY, name: '数据更新多表E2E（临时）', description: '验证后即删' });
    const id = created.id;
    console.log('created flow:', id);

    try {
      // ===== Phase1 多表成功 =====
      await conn.query(`INSERT INTO ${T_ORDER} VALUES (1, 'NEW', 100.00)`);
      await conn.query(`INSERT INTO ${T_STOCK} VALUES ('A1', 10), ('A1', 20)`);

      await call('PUT', `/api/v1/logic-flows/${id}`, { name: '数据更新多表E2E（临时）', description: '验证后即删', dsl: DSL_OK });
      const run1 = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: { newStatus: 'PAID', orderId: 1 } });
      console.log('run1.status =', run1.status, '| durationMs =', run1.durationMs);
      console.log('outputVars =', JSON.stringify(run1.outputVars, null, 1).slice(0, 900));

      const a1 = run1.status === 'SUCCESS';
      const sum = run1.outputVars?.du_x || {};
      const a2 = sum.total === 2 && sum.affected === 3
        && sum.order?.table === T_ORDER && sum.order?.affected === 1
        && sum.t1?.table === T_STOCK && sum.t1?.affected === 2
        && typeof sum.durationMs === 'number' && !('aborted' in sum);
      const [ord] = await conn.query(`SELECT status FROM ${T_ORDER} WHERE id = 1`);
      const [stk] = await conn.query(`SELECT qty FROM ${T_STOCK} ORDER BY qty`);
      const a3 = ord[0]?.status === 'PAID' && stk[0]?.qty === 8 && stk[1]?.qty === 18;

      console.log(`\n[A1 Phase1 run SUCCESS] ${a1 ? 'PASS' : 'FAIL'}`);
      console.log(`[A2 du_x 汇总 total=2 affected=3 + order/t1 键控 + 参数绑定] ${a2 ? 'PASS' : 'FAIL'}`);
      console.log(`[A3 库核验 order.status=PAID + stock 8/18（SET/SUB 真实生效）] ${a3 ? 'PASS' : 'FAIL'}`);

      // ===== Phase2 运行期失败整体回滚 =====
      await call('PUT', `/api/v1/logic-flows/${id}`, { name: '数据更新多表E2E（临时）', description: '验证后即删', dsl: DSL_ROLLBACK });
      const run2 = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: {} });
      console.log('\nrun2.status =', run2.status);
      console.log('run2.errorMessage =', String(run2.errorMessage || '').slice(0, 300));

      const a4 = run2.status === 'FAILED' && /Data too long|du_x/i.test(String(run2.errorMessage || ''));
      const [stk2] = await conn.query(`SELECT qty FROM ${T_STOCK} ORDER BY qty`);
      const [ord2] = await conn.query(`SELECT status FROM ${T_ORDER} WHERE id = 1`);
      const a5 = stk2[0]?.qty === 8 && stk2[1]?.qty === 18 && ord2[0]?.status === 'PAID';

      console.log(`\n[A4 Phase2 run FAILED + 错误含 Data too long/du_x] ${a4 ? 'PASS' : 'FAIL'}`);
      console.log(`[A5 库核验 stock 未+100 且 order 仍 PAID（单事务整体回滚）] ${a5 ? 'PASS' : 'FAIL'}`);
      if (!(a1 && a2 && a3 && a4 && a5)) process.exitCode = 1;
    } finally {
      await call('DELETE', `/api/v1/logic-flows/${id}`).catch((e) => console.warn('cleanup flow failed:', e.message));
      console.log('\ntemp flow deleted.');
    }
  } finally {
    await conn.query(`DROP TABLE IF EXISTS ${T_ORDER}`);
    await conn.query(`DROP TABLE IF EXISTS ${T_STOCK}`);
    await conn.end();
    console.log('temp tables dropped.');
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
