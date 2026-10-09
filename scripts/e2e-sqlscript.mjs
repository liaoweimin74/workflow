#!/usr/bin/env node
/**
 * E2E：逻辑流 SQL_SCRIPT（SQL 批处理）节点验证
 * 前置：mysql2 建临时表 wf_biz_sqlbatch_e2e（用后即删）
 * 流程：START → sql1(SQL_SCRIPT: 别名 INSERT + SELECT，{{var}} 参数绑定) → sql_abort(SQL_SCRIPT: 首句失败触发回滚) → END
 * 断言：
 *   A1 run SUCCESS（abort 节点不抛错，下游可按 failed/aborted 分支）
 *   A2 sql1 汇总：total=2 succeeded=2，new_row.insertKey>=1 affected=1（别名键 + 自增键）
 *   A3 sql1.s1 查询条目：kind=QUERY rows=1 data[0].name=alice（参数绑定真实生效）
 *   A4 sql_abort 汇总：aborted=true failed=1 total=2，s0.error 含不存在表
 *   A5 库核验：rollback_test 行不存在（abort 回滚 + 未执行），alice 行恰 1 条
 * 完成后删临时流 + 删临时表，不留库。
 */
import mysql from '/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise.js';

const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const KEY = 'sql_script_e2e';
const TABLE = 'wf_biz_sqlbatch_e2e';

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

const SQL1 = [
  '-- name: new_row',
  `INSERT INTO ${TABLE}(name, qty) VALUES ({{name}}, {{qty}});`,
  '',
  `SELECT id, name FROM ${TABLE} WHERE name = {{name}}`,
].join('\n');

const SQL_ABORT = [
  'INSERT INTO wf_no_such_table_e2e VALUES (1);',
  `INSERT INTO ${TABLE}(name, qty) VALUES ('rollback_test', 99)`,
].join('\n');

const DSL = {
  nodes: [
    { id: 'start_e2e01', type: 'START', name: '开始', x: 80, y: 200 },
    { id: 'sql1', type: 'SQL_SCRIPT', name: '插入并查询', x: 300, y: 200,
      config: { sql: SQL1, onError: 'abort', maxRows: 200 } },
    { id: 'sql_abort', type: 'SQL_SCRIPT', name: '失败回滚演示', x: 540, y: 200,
      config: { sql: SQL_ABORT, onError: 'abort' } },
    { id: 'end_e2e001', type: 'END', name: '结束', x: 780, y: 200 },
  ],
  edges: [
    { id: 'e1', source: 'start_e2e01', target: 'sql1' },
    { id: 'e2', source: 'sql1', target: 'sql_abort' },
    { id: 'e3', source: 'sql_abort', target: 'end_e2e001' },
  ],
  inputVars: [],
};

async function main() {
  // 准备临时表（干净状态）
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow' });
  await conn.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await conn.query(`CREATE TABLE ${TABLE} (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(64), qty INT)`);

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

    const created = await call('POST', '/api/v1/logic-flows', { key: KEY, name: 'SQL批处理E2E（临时）', description: '验证后即删' });
    const id = created.id;
    console.log('created flow:', id);

    try {
      await call('PUT', `/api/v1/logic-flows/${id}`, { name: 'SQL批处理E2E（临时）', description: '验证后即删', dsl: JSON.stringify(DSL) });

      const run = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: { name: 'alice', qty: 42 } });
      const out = run.outputVars || {};
      console.log('run.status =', run.status, '| durationMs =', run.durationMs);
      console.log('outputVars =', JSON.stringify(out, null, 1).slice(0, 1600));

      const a1 = run.status === 'SUCCESS';
      const sql1 = out.sql1 || {};
      const a2 = sql1.total === 2 && sql1.succeeded === 2
        && sql1.new_row?.affected === 1 && Number(sql1.new_row?.insertKey) >= 1;
      const s1 = sql1.s1 || {};
      const a3 = s1.kind === 'QUERY' && s1.rows === 1 && s1.data?.[0]?.name === 'alice';
      const ab = out.sql_abort || {};
      const a4 = ab.total === 2 && ab.failed === 1 && ab.aborted === true
        && ab.s0?.ok === false && String(ab.s0?.error || '').length > 0 && ab.s1 === undefined;
      // 库核验
      const [rollbackRows] = await conn.query(`SELECT COUNT(*) c FROM ${TABLE} WHERE name = 'rollback_test'`);
      const [aliceRows] = await conn.query(`SELECT COUNT(*) c FROM ${TABLE} WHERE name = 'alice'`);
      const a5 = rollbackRows[0].c === 0 && aliceRows[0].c === 1;

      console.log(`\n[A1 run SUCCESS（abort 节点不抛错）] ${a1 ? 'PASS' : 'FAIL'}`);
      console.log(`[A2 sql1 汇总 total=2 succeeded=2 + new_row 别名键 affected/insertKey] ${a2 ? 'PASS' : 'FAIL'}`);
      console.log(`[A3 sql1.s1 QUERY rows=1 data[0].name=alice（参数绑定生效）] ${a3 ? 'PASS' : 'FAIL'}`);
      console.log(`[A4 sql_abort aborted=true failed=1 s0.error 后句未执行] ${a4 ? 'PASS' : 'FAIL'}`);
      console.log(`[A5 库核验 rollback_test=0 alice=1（回滚+不执行）] ${a5 ? 'PASS' : 'FAIL'}`);
      if (!(a1 && a2 && a3 && a4 && a5)) process.exitCode = 1;
    } finally {
      await call('DELETE', `/api/v1/logic-flows/${id}`).catch((e) => console.warn('cleanup flow failed:', e.message));
      console.log('temp flow deleted.');
    }
  } finally {
    await conn.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await conn.end();
    console.log('temp table dropped.');
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
