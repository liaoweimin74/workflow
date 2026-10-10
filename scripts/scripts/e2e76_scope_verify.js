/**
 * Task 76 E2E：starterScope 部署下发全链路验证（一次性数据，脚本内自动清理）。
 * 流程：登录 → 读请假草稿 → 建一次性草稿(SPECIFIED scope) → 保存 → 部署
 *      → GET /api/v1/deployed-processes 断言 starterScope → 删草稿(API) + 删 def/config(DB)。
 */
const BASE = 'http://localhost:8080'
const TENANT = 'default'
const LEAVE_DRAFT = '4f10a0d7bf698bca3eeae99dd132d5a1'
const KEY = 'leave_e2e76'

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

async function main() {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })
  const token = login.data.accessToken
  console.log('[1] login OK')

  const editor = await api('GET', `/api/v1/process-definitions/${LEAVE_DRAFT}/editor`, undefined, token)
  const { nodeConfigs } = editor.data
  console.log('[2] leave editor loaded, nodes:', Object.keys(nodeConfigs || {}).join(',') || '(empty)')
  // 自建合法 BPMN（process id 必须等于 key，userTask id 对齐节点配置，补齐出入边）
  const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:wf="http://workflow.com/schema/bpmn/wf" targetNamespace="e2e76">
  <bpmn:process id="${KEY}" name="e2e76-scope-verify" isExecutable="true">
    <bpmn:startEvent id="startEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Activity_1sqzo4c" wf:nodeRole="approver">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="endEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="startEvent_1" targetRef="Activity_1sqzo4c" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1sqzo4c" targetRef="endEvent_1" />
  </bpmn:process>
</bpmn:definitions>`

  const created = await api('POST', `/api/v1/process-definitions/drafts?name=e2e76-scope-verify&key=${KEY}`, {}, token)
  const draftId = created.data.id
  console.log('[3] throwaway draft created:', draftId)

  const procCfgRaw = nodeConfigs['__PROCESS__'] || '{}'
  let procCfg
  try { procCfg = JSON.parse(procCfgRaw) } catch { procCfg = {} }
  procCfg.starterScope = { mode: 'SPECIFIED', userIds: ['2', '9'], roleIds: ['dept_manager'] }
  procCfg.adminUserIds = ['7']
  const saved = await api('PUT', `/api/v1/process-definitions/${draftId}/design`, {
    bpmnXml,
    nodeConfigs: { ...(nodeConfigs || {}), __PROCESS__: JSON.stringify(procCfg) },
  }, token)
  console.log('[4] design saved, status:', saved.data?.status)

  await api('POST', `/api/v1/process-definitions/${draftId}/deploy`, {}, token)
  console.log('[5] deployed')

  const list = await api('GET', '/api/v1/deployed-processes?page=1&size=50', undefined, token)
  const rows = Array.isArray(list.data) ? list.data : list.data?.content || []
  const item = rows.find((r) => r.key === KEY || r.processKey === KEY)
  if (!item) throw new Error('deployed item not found for key ' + KEY + '; rows=' + rows.length)
  const ss = item.starterScope
  const pass = ss && ss.mode === 'SPECIFIED' && JSON.stringify(ss.userIds) === '["2","9"]' && JSON.stringify(ss.roleIds) === '["dept_manager"]'
  console.log('[6] deployed-processes item starterScope:', JSON.stringify(ss))
  console.log('[6] VERDICT:', pass ? 'PASS ✅ starterScope 下发正确' : 'FAIL ❌')

  // ── 清理（零残留）──
  try { await api('DELETE', `/api/v1/process-definitions/${draftId}`, undefined, token); console.log('[7] draft deleted via API') }
  catch (e) { console.log('[7] draft delete API failed:', e.message) }

  const mysql = require('/home/z/my-project/workflow_lowcode/backend-node/node_modules/mysql2/promise')
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', password: '740130', database: 'workflow_v6' })
  const [defs] = await conn.execute("SELECT id, process_key FROM wfe_process_def WHERE process_key = ?", [KEY])
  const defIds = defs.map((r) => r.id)
  if (defIds.length) {
    const ph = defIds.map(() => '?').join(',')
    await conn.execute(`DELETE FROM wf_node_config WHERE process_definition_id IN (${ph})`, defIds)
    const [r1] = await conn.execute(`DELETE FROM wfe_process_def WHERE id IN (${ph})`, defIds)
    console.log('[8] DB cleanup: removed', r1.affectedRows, 'procdef row(s), config rows for', defIds.join(','))
  } else {
    console.log('[8] DB cleanup: no procdef rows found for key (already clean)')
  }
  const [leftDef] = await conn.execute("SELECT COUNT(*) c FROM wfe_process_def WHERE process_key = ?", [KEY])
  const [leftCfg] = await conn.execute("SELECT COUNT(*) c FROM wf_node_config WHERE node_id = '__PROCESS__' AND process_definition_id IN (SELECT id FROM wfe_process_def WHERE process_key = ?)", [KEY])
  await conn.end()
  console.log('[9] residue check: procdef rows =', leftDef[0].c, ', config rows =', leftCfg[0].c)
  console.log(pass ? 'E2E PASS' : 'E2E FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(2) })
