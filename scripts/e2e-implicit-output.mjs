#!/usr/bin/env node
/**
 * E2E：逻辑流「隐式默认输出」（约定优于配置）验证
 * 流程：START → SCRIPT(无 results，返回 Map) → CONDITION(点路径 {{script.answer}} EQ 42) → END
 * 断言：
 *   A1 outputVars 含键 script_e2e01（隐式整体输出，变量名=节点 id）
 *   A2 outputVars.script_e2e01.answer === '42'（整体值完整）
 *   A3 下游 SCRIPT 裸名引用隐式变量并取子字段 got='deep'、ok=true
 *     （注：CONDITION 的 variable 参数为裸变量名查找、不支持 {{}} 点路径，属现存限制非本次范围）
 * 完成后删除临时流，不留库。
 */
const BASE = 'http://127.0.0.1:8080';
const TENANT = 'default';
const KEY = 'implicit_output_e2e';

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

const DSL = {
  nodes: [
    { id: 'start_e2e01', type: 'START', name: '开始', x: 80, y: 200 },
    {
      id: 'script_e2e01', type: 'SCRIPT', name: '无声明脚本', x: 300, y: 200,
      config: { language: 'groovy', source: "return [answer: '42', nested: [level: 'deep']]" },
      // 注意：故意不声明 results —— 验证隐式整体输出
    },
    {
      id: 'script_e2e02', type: 'SCRIPT', name: '下游引用隐式变量', x: 540, y: 200,
      config: { language: 'groovy', source: "return [got: script_e2e01.nested.level, ok: script_e2e01.answer == '42']" },
    },
    { id: 'end_e2e001', type: 'END', name: '结束', x: 780, y: 200 },
  ],
  edges: [
    { id: 'e1', source: 'start_e2e01', target: 'script_e2e01' },
    { id: 'e2', source: 'script_e2e01', target: 'script_e2e02' },
    { id: 'e3', source: 'script_e2e02', target: 'end_e2e001' },
  ],
  inputVars: [],
};

async function main() {
  const login = await j(await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }));
  const token = login.accessToken || login.token;
  if (!token) throw new Error('no token: ' + JSON.stringify(login).slice(0, 200));
  const call = api(token);

  // 清理同名残留（幂等）
  const list = await call('GET', '/api/v1/logic-flows?page=1&size=100');
  const rows = list.records || list.list || list.rows || list || [];
  const stale = Array.isArray(rows) ? rows.find((f) => f.flowKey === KEY || f.key === KEY) : null;
  if (stale?.id) { await call('DELETE', `/api/v1/logic-flows/${stale.id}`); console.log('removed stale flow', stale.id); }

  const created = await call('POST', '/api/v1/logic-flows', { key: KEY, name: '隐式输出E2E（临时）', description: '验证后即删' });
  const id = created.id;
  console.log('created flow:', id);

  try {
    await call('PUT', `/api/v1/logic-flows/${id}`, { name: '隐式输出E2E（临时）', description: '验证后即删', dsl: JSON.stringify(DSL) });

    const run = await call('POST', `/api/v1/logic-flows/${id}/run`, { vars: {} });
    const out = run.outputVars || {};

    const a1 = Object.prototype.hasOwnProperty.call(out, 'script_e2e01');
    const a2 = String(out.script_e2e01?.answer) === '42' && out.script_e2e01?.nested?.level === 'deep';
    const a3 = out.script_e2e02?.got === 'deep' && out.script_e2e02?.ok === true;
    const a0 = run.status === 'SUCCESS';

    console.log('run.status =', run.status, '| durationMs =', run.durationMs);
    console.log('outputVars =', JSON.stringify(out));
    console.log('errorMessage =', run.errorMessage);

    const pass = a0 && a1 && a2 && a3;
    console.log(`\n[A0 run SUCCESS] ${a0 ? 'PASS' : 'FAIL'}`);
    console.log(`[A1 隐式变量 script_e2e01 存在] ${a1 ? 'PASS' : 'FAIL'}`);
    console.log(`[A2 整体值完整 answer='42' nested.level=deep] ${a2 ? 'PASS' : 'FAIL'}`);
    console.log(`[A3 下游裸名引用+子字段取值 got=deep ok=true] ${a3 ? 'PASS' : 'FAIL'}`);
    if (!pass) process.exitCode = 1;
  } finally {
    await call('DELETE', `/api/v1/logic-flows/${id}`).catch((e) => console.warn('cleanup failed:', e.message));
    console.log('temp flow deleted.');
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
