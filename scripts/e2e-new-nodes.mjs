#!/usr/bin/env node
/**
 * E2E：逻辑流新增节点全链路验证（P0/P1/P2 一次性覆盖）
 *  A1 DATA_QUERY  空表查询 total=0
 *  A2 DATA_INSERT {{var}} 绑定插入 + 返回 id
 *  A3 DATA_QUERY  二次查询 total=2
 *  A4 TRANSFORM   值位注入原始数值 + 字符串内插值
 *  A5 AGGREGATE   SUM/COUNT 聚合
 *  A6 DATA_DELETE 按条件删（租户过滤形态）deleted=1
 *  A7 DATA_DELETE 按 ID 删（KEY 拆包 delId）deleted=1
 *  A8 NOTIFY      模板不存在 → 节点 FAILED → onError 失败分支路由到 fb1（run 仍 SUCCESS）
 *  A9 DELAY       waitedMs>=20
 *  A10 BATCH chunk 分批 5 项 chunkSize=2 → 3 批
 *  A11 LLM        平台网关可用 → content 有值；不可用 → 失败分支兜底（两种均 SUCCESS）
 * 资源：临时表单 e2enew_task（publish 建动态表 wf_biz_e2enew_task）+ 临时流 2 条，用后全删。
 */
import mysql from '/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise.js';

const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const FKEY = 'e2enew_task';
const TABLE = `wf_biz_${FKEY}`;
const FLOW_KEY = 'e2e_new_nodes';
const FLOW_KEY_B = 'e2e_new_nodes_batch';
let PASS = 0, FAIL = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { PASS++; console.log(`  ✅ ${name}`); }
  else { FAIL++; console.log(`  ❌ ${name} ${detail}`); }
};

const j = async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok || (body && body.code != null && body.code !== 200 && body.code !== 0)) {
    throw new Error(`HTTP ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.data ?? body;
};
const call = (token) => async (method, path, payload) => {
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

const NODE = (id, type, config, extra = {}) => ({ id, type, name: id, x: 100, y: 100, config, ...extra });
const E = (s, t, branch) => ({ id: `e_${s}_${t}`, source: s, target: t, ...(branch ? { branch } : {}) });

async function main() {
  // ===== 登录 =====
  const login = await j(await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }));
  const token = login.accessToken || login.token;
  if (!token) throw new Error('no token');
  const call_ = call(token);

  // ===== 临时表单（BUSINESS，publish 建动态表） =====
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow' });
  try { await conn.query(`DELETE FROM ${TABLE}`); } catch (e) { if (!/doesn't exist/.test(e.message || '')) throw e; console.log('table absent (fresh db) — publish will create it'); } // 幂等：清残留数据（重供给后表缺失则容忍）
  const colCfg = JSON.stringify([
    { key: 'person_name', label: '姓名', columnType: 'VARCHAR', length: 64 },
    { key: 'amount', label: '金额', columnType: 'DECIMAL', scale: 2 },
  ]);
  const fdList = await call_('GET', `/api/v1/form-definitions?page=1&size=100&type=BUSINESS`);
  const staleForm = (fdList.content || fdList.rows || []).find((f) => f.key === FKEY);
  let form;
  if (staleForm?.id) {
    // 已发布表单不可删（业务约束）：直接复用（columnConfig 已含 person_name/amount）
    form = staleForm;
    console.log('reuse existing form:', form.id);
  } else {
    form = await call_('POST', `/api/v1/form-definitions?name=新节点E2E临时表单&key=${FKEY}&type=BUSINESS`);
    await call_('PUT', `/api/v1/form-definitions/${form.id}`, { name: '新节点E2E临时表单', key: FKEY, schema: '[]', columnConfig: colCfg });
    await call_('POST', `/api/v1/form-definitions/${form.id}/publish`);
    console.log('form published:', form.id);
  }

  // ===== 清理残留流 =====
  const list = await call_('GET', '/api/v1/logic-flows?page=1&size=100');
  for (const f of (list.rows || list.records || list.content || [])) {
    if ([FLOW_KEY, FLOW_KEY_B].includes(f.flowKey)) { await call_('DELETE', `/api/v1/logic-flows/${f.id}`); console.log('removed stale flow', f.flowKey); }
  }

  // ===== 流 A：主链（查询/插入/映射/聚合/删除/通知失败路由/延时） =====
  const dslA = JSON.stringify({
    nodes: [
      { id: 'start_a', type: 'START', name: '开始', x: 80, y: 200 },
      NODE('dq1', 'DATA_QUERY', { formKey: FKEY, filter: [], size: 50 }),
      NODE('ti1', 'DATA_INSERT', { formKey: FKEY, data: [{ column: 'person_name', value: '{{who}}' }, { column: 'amount', value: '12.5' }] }),
      NODE('ti2', 'DATA_INSERT', { formKey: FKEY, data: [{ column: 'person_name', value: '李四' }, { column: 'amount', value: '20' }] }),
      NODE('dq2', 'DATA_QUERY', { formKey: FKEY, filter: [], size: 50 }),
      NODE('tr1', 'TRANSFORM', { template: '{"count": {{dq2.total}}, "label": "查询到 {{dq2.total}} 行"}' }),
      NODE('ag1', 'AGGREGATE', { collection: '{{dq2.rows}}', field: 'amount', ops: ['SUM', 'COUNT'] }),
      NODE('de1', 'DATA_DELETE', { formKey: FKEY, id: '', filter: [{ column: 'person_name', op: 'EQ', value: '{{who}}' }] }),
      NODE('de2', 'DATA_DELETE', { formKey: FKEY, id: '{{ti2.id}}', filter: [] }),
      NODE('nt1', 'NOTIFY', { templateCode: 'E2E_T_NOPE_NOT_EXIST', recipientIds: ['1'], variables: [], messageType: 'PRIVATE', channels: ['IN_APP'] }),
      NODE('fb1', 'TRANSFORM', { template: '{"degraded": true}' }),
      NODE('dl1', 'DELAY', { durationMs: 20 }),
      { id: 'end_a', type: 'END', name: '结束', x: 80, y: 420 },
    ],
    edges: [
      E('start_a', 'dq1'), E('dq1', 'ti1'), E('ti1', 'ti2'), E('ti2', 'dq2'),
      E('dq2', 'tr1'), E('tr1', 'ag1'), E('ag1', 'de1'), E('de1', 'de2'),
      E('de2', 'nt1'), E('nt1', 'dl1'), E('nt1', 'fb1', 'error'), E('fb1', 'dl1'),
      E('dl1', 'end_a'),
    ],
    inputVars: [{ name: 'who', type: 'string', required: true }],
  });

  const flowA = await call_('POST', '/api/v1/logic-flows', { key: FLOW_KEY, name: '新节点E2E主链（临时）', description: '验证后即删' });
  await call_('PUT', `/api/v1/logic-flows/${flowA.id}`, { name: '新节点E2E主链（临时）', dsl: dslA });
  await call_('POST', `/api/v1/logic-flows/${flowA.id}/publish`);

  console.log('--- 流A 运行 ---');
  const runA = await call_('POST', `/api/v1/logic-flows/${flowA.id}/run`, { vars: { who: '张三' } });
  ok('A0 run SUCCESS', runA.status === 'SUCCESS', JSON.stringify({ status: runA.status, err: runA.errorMessage }).slice(0, 400));
  const out = runA.outputVars || runA.output || {};
  ok('A1 空表查询 total=0', Number(out.dq1?.total) === 0, JSON.stringify(out.dq1));
  ok('A2 插入返回 id + 值', !!out.ti1?.id && out.ti1?.data?.person_name === '张三', JSON.stringify(out.ti1));
  ok('A3 二次查询 total=2', Number(out.dq2?.total) === 2, JSON.stringify({ total: out.dq2?.total }));
  ok('A4 TRANSFORM 值位数字+插值（Long 按平台约定序列化为字符串防精度丢失）',
    Number(out.tr1?.count) === 2 && out.tr1?.label === '查询到 2 行', JSON.stringify(out.tr1));
  ok('A5 AGGREGATE count=2 sum=32.5', Number(out.ag1?.count) === 2 && Math.abs(Number(out.ag1?.sum) - 32.5) < 0.001, JSON.stringify(out.ag1));
  ok('A6 条件删除 deleted=1 mode=filter', Number(out.de1?.deleted) === 1 && out.de1?.mode === 'filter', JSON.stringify(out.de1));
  ok('A7 按ID删除 deleted=1 mode=id', Number(out.de2?.deleted) === 1 && out.de2?.mode === 'id', JSON.stringify(out.de2));
  const ntTrace = (runA.traces || []).find((t) => t.nodeId === 'nt1');
  const fbTrace = (runA.traces || []).find((t) => t.nodeId === 'fb1');
  ok('A8 NOTIFY 失败→error 边路由 fb1', ntTrace?.status === 'FAILED' && fbTrace?.status === 'SUCCESS' && out.fb1?.degraded === true,
    JSON.stringify({ nt: ntTrace?.status, fb: fbTrace?.status, fbOut: out.fb1 }));
  ok('A9 DELAY waitedMs>=20', Number(out.dl1?.waitedMs) >= 20, JSON.stringify(out.dl1));

  // ===== 流 B：BATCH chunk + LLM（失败兜底） =====
  const dslB = JSON.stringify({
    nodes: [
      { id: 'start_b', type: 'START', name: '开始', x: 80, y: 200 },
      NODE('b1', 'BATCH', {
        collection: '{{nums}}', chunkSize: 2, maxItems: 100, stopOnError: true,
        body: [{ id: 'probe', type: 'SQL_SCRIPT', name: '探针', config: { sql: 'SELECT 1', onError: 'abort' } }],
      }),
      NODE('llm1', 'LLM', { prompt: '回复一个字：好', system: '只输出一个字', temperature: 0.1 }),
      NODE('fb2', 'TRANSFORM', { template: '{"degraded": true}' }),
      { id: 'end_b', type: 'END', name: '结束', x: 80, y: 420 },
    ],
    edges: [
      E('start_b', 'b1'), E('b1', 'llm1'), E('llm1', 'end_b'), E('llm1', 'fb2', 'error'), E('fb2', 'end_b'),
    ],
    inputVars: [{ name: 'nums', type: 'json', required: true }],
  });
  const flowB = await call_('POST', '/api/v1/logic-flows', { key: FLOW_KEY_B, name: '新节点E2E批处理（临时）', description: '验证后即删' });
  await call_('PUT', `/api/v1/logic-flows/${flowB.id}`, { name: '新节点E2E批处理（临时）', dsl: dslB });
  await call_('POST', `/api/v1/logic-flows/${flowB.id}/publish`);

  console.log('--- 流B 运行 ---');
  const runB = await call_('POST', `/api/v1/logic-flows/${flowB.id}/run`, { vars: { nums: [1, 2, 3, 4, 5] } });
  ok('B0 run SUCCESS', runB.status === 'SUCCESS', JSON.stringify({ status: runB.status, err: runB.errorMessage }).slice(0, 400));
  const outB = runB.outputVars || runB.output || {};
  ok('A10 BATCH chunk 5→3批', Number(outB.b1?.total) === 3 && Number(outB.b1?.chunkSize) === 2 && Number(outB.b1?.succeeded) === 3,
    JSON.stringify(outB.b1 ?? {}).slice(0, 200));
  const llmTrace = (runB.traces || []).find((t) => t.nodeId === 'llm1');
  const llmOk = llmTrace?.status === 'SUCCESS' && String(outB.llm1?.content ?? '').length > 0;
  const llmDegraded = llmTrace?.status === 'FAILED' && outB.fb2?.degraded === true;
  ok('A11 LLM 网关通或有兜底', llmOk || llmDegraded,
    JSON.stringify({ trace: llmTrace?.status, out: outB.llm1, fb: outB.fb2 }).slice(0, 200));

  // ===== 清理 =====
  await call_('DELETE', `/api/v1/logic-flows/${flowA.id}`);
  await call_('DELETE', `/api/v1/logic-flows/${flowB.id}`);
  try {
    await call_('DELETE', `/api/v1/form-definitions/${form.id}`);
    console.log('cleaned: flows + form');
  } catch {
    // 已发布表单不可删（业务约束）：留库无害，key 固定下轮复用
    console.log('cleaned: flows（表单已发布不可删，留库复用）');
  }

  try {
    try { await conn.query(`DELETE FROM ${TABLE}`); } catch (e) { if (!/doesn't exist/.test(e.message || '')) throw e; }
    await conn.end();
  } catch { /* 表可能尚未建 */ }

  console.log(`\n===== RESULT: ${PASS} PASS / ${FAIL} FAIL =====`);
  if (FAIL > 0) process.exit(1);
}

main().catch((e) => { console.error('E2E FATAL:', e.message); process.exit(1); });
