/**
 * leave-flow-mi-actions.test.ts —— 围绕 leave-form 的工作流多实例与任务动作组合测试
 *
 * 覆盖（用户指定业务逻辑）：
 *   1. 多人模式：会签（countersign）/ 或签（or_sign）/ 依次审批（sequential）
 *   2. 转派（transfer）/ 委托（delegate）/ 加签（add-sign）/ 驳回（reject）/ 拒绝（refuse）
 *   并按「模式 × 动作」组合构造场景。
 *
 * 运行：bun test tests/leave-flow-mi-actions.test.ts（需 8080 后端已启动）
 * 所有流程发起节点绑定 leave-form（formDefId 见 LEAVE_FORM_ID）。
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { Database } from 'bun:sqlite';

const BASE = 'http://localhost:8080';
const TENANT = 'default';
/** leave-form（请假申请表，PUBLISHED） */
const LEAVE_FORM_ID = '4a2e8ee181eb4ec6ac57f66385975e2c';
const DB_PATH = new URL('../data/workflow.db', import.meta.url).pathname;

interface Token { token: string; userId: string }
const tokens: Record<'admin' | 'test' | 'u3' | 'u4', Token> = {} as never;

async function login(username: string, password: string): Promise<Token> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json() as { code: number; msg: string; data: { accessToken: string; user?: { id?: string | number } } };
  if (json.code !== 200) throw new Error(`login ${username} failed: ${json.msg}`);
  return { token: json.data.accessToken, userId: String(json.data.user?.id ?? '') };
}

let seq = 0;
async function api(t: Token, method: string, path: string, body?: unknown): Promise<{ code: number; msg?: string; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT, Authorization: `Bearer ${t.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json() as { code: number; msg: string; data: any };
  // R 信封：业务 code 以响应体为准（BusinessException → HTTP 200 + body code 400）
  return { code: json.code, msg: json.msg, data: json.data };
}

function expectOk(r: { code: number; msg?: string }, what: string): void {
  if (r.code !== 200) throw new Error(`[${what}] 期望 200，实际 ${r.code}: ${r.msg}`);
}

/** 待办任务（assignee=me 或候选含我，仅 running 实例） */
async function todoOf(t: Token): Promise<Array<{ taskId: string; name: string; processInstanceId: string; assignee: string | null }>> {
  const r = await api(t, 'GET', '/api/v1/tasks?assignee=' + t.userId + '&size=50');
  expectOk(r, '待办列表');
  return r.data?.content ?? r.data?.rows ?? [];
}

async function todoOfInstance(t: Token, piId: string): Promise<string[]> {
  return (await todoOf(t)).filter((x) => x.processInstanceId === piId).map((x) => x.taskId);
}

// ---------------------------------------------------------------- 流程装配

function bpmn(processId: string, taskName = '审批'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="example">
  <process id="${processId}" name="${processId}" isExecutable="true">
    <startEvent id="startEvent" name="开始"/>
    <userTask id="submitTask" name="提交请假" flowable:assignee="\${initiator}">
      <documentation>发起人提交（自动完成）</documentation>
    </userTask>
    <userTask id="approvalTask" name="${taskName}"/>
    <endEvent id="endEvent" name="结束"/>
    <sequenceFlow id="f1" sourceRef="startEvent" targetRef="submitTask"/>
    <sequenceFlow id="f2" sourceRef="submitTask" targetRef="approvalTask"/>
    <sequenceFlow id="f3" sourceRef="approvalTask" targetRef="endEvent"/>
  </process>
</definitions>`;
}

const ALL_OPS = { allowReject: true, allowAddSign: true, allowTransfer: true, allowDelegate: true };

/** 构造节点配置：multiMode 传 null 表示普通单实例节点（userIds 多人 → 候选） */
function nodeCfg(userIds: string[], multiMode: 'countersign' | 'or_sign' | 'sequential' | null): string {
  const cfg: Record<string, unknown> = {
    approval: { userIds, ...(multiMode ? { multiMode } : {}) },
    form: { formDefId: LEAVE_FORM_ID },
    operations: ALL_OPS,
  };
  return JSON.stringify(cfg);
}

/** 建草稿 → 保存设计 → 部署 → 返回 processKey */
async function deployFlow(name: string, mode: 'countersign' | 'or_sign' | 'sequential' | null, userIds: string[]): Promise<string> {
  const key = `mi-test-${name.toLowerCase()}-${Date.now().toString(36)}-${++seq}`;
  const r1 = await api(tokens.admin, 'POST', `/api/v1/process-definitions/drafts?name=${encodeURIComponent(name)}&key=${key}`);
  expectOk(r1, '建草稿');
  const draftId = r1.data.id as string;
  const r2 = await api(tokens.admin, 'PUT', `/api/v1/process-definitions/${draftId}/design`, {
    bpmnXml: bpmn(key),
    nodeConfigs: {
      submitTask: JSON.stringify({ form: { formDefId: LEAVE_FORM_ID } }),
      approvalTask: nodeCfg(userIds, mode),
    },
  });
  expectOk(r2, '保存设计');
  const r3 = await api(tokens.admin, 'POST', `/api/v1/process-definitions/${draftId}/deploy`);
  expectOk(r3, '部署');
  return key;
}

/** admin 发起（businessKey/formDefId 绑定 leave-form 语义），返回实例 id */
async function start(key: string, businessKey: string): Promise<string> {
  const r = await api(tokens.admin, 'POST', '/api/v1/process-instances', {
    processKey: key,
    businessKey,
    formDefId: LEAVE_FORM_ID,
    variables: { days: 3, reason: '年假-引擎测试' },
  });
  expectOk(r, '发起实例');
  return r.data.id as string;
}

/** 取实例当前 pending 任务（直查 DB：API 待办仅对归属人可见） */
function pendingTasksOfNode(db: Database, piId: string, node: string): Array<{ ID: string; ASSIGNEE: string | null; OWNER: string | null; STATUS: string }> {
  return db
    .query(`SELECT ID, ASSIGNEE, OWNER, STATUS FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND TASK_DEF_KEY = ? AND STATUS = 'pending' ORDER BY CREATE_TIME ASC, ID ASC`)
    .all(piId, node) as never;
}

function instanceStatus(db: Database, piId: string): string {
  return String(db.query('SELECT STATUS FROM WF_PROC_INST WHERE ID = ?').get(piId)?.STATUS ?? 'gone');
}

function varOf(db: Database, piId: string, name: string): unknown {
  const row = db.query('SELECT TYPE, VALUE_TEXT, VALUE_NUM FROM WF_VARIABLE WHERE PROC_INST_ID = ? AND NAME = ?').get(piId, name) as { TYPE: string; VALUE_TEXT: string | null; VALUE_NUM: number | null } | null;
  if (!row) return undefined;
  if (row.TYPE === 'boolean') return row.VALUE_TEXT === 'true';
  if (row.TYPE === 'long' || row.TYPE === 'double') return row.VALUE_NUM;
  return row.VALUE_TEXT;
}

// ---------------------------------------------------------------- 测试套件

let db: Database;

beforeAll(async () => {
  tokens.admin = await login('admin', 'admin123');
  tokens.test = await login('test', '123456');
  tokens.u3 = await login('approver3', '123456');
  tokens.u4 = await login('approver4', '123456');
  db = new Database(DB_PATH, { readonly: true });
});

describe('多人模式 A：会签 countersign（2/3/4 全部通过才过）', () => {
  test('A1 三人依次通过：前两人通过流程不推进，第三人通过后结束', async () => {
    const key = await deployFlow('A1-会签基础', 'countersign', ['2', '3', '4']);
    const pi = await start(key, 'leave-A1');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    const t3 = (await todoOfInstance(tokens.u3, pi))[0];
    const t4 = (await todoOfInstance(tokens.u4, pi))[0];
    expect(t2).toBeDefined();
    expect(t3).toBeDefined();
    expect(t4).toBeDefined();
    expect(new Set([t2, t3, t4]).size).toBe(3); // 三个并行子任务

    // 2 通过 → 流程不推进、其余子任务仍在
    const r2 = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/complete`, { comment: '同意-A1' });
    expectOk(r2, '2号通过');
    expect(r2.data.processFinished).toBe(false);
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(2);

    // 3 通过 → 仍不推进
    const r3 = await api(tokens.u3, 'POST', `/api/v1/tasks/${t3}/complete`, { comment: '同意-A1' });
    expectOk(r3, '3号通过');
    expect(r3.data.processFinished).toBe(false);
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(1);

    // 4 通过 → 结束
    const r4 = await api(tokens.u4, 'POST', `/api/v1/tasks/${t4}/complete`, { comment: '同意-A1' });
    expectOk(r4, '4号通过');
    expect(r4.data.processFinished).toBe(true);
    expect(instanceStatus(db, pi)).toBe('completed');
  });

  test('A2 会签中一人驳回 → 回发起人；其余子任务全部取消；重提后 rejected 复位、重新会签', async () => {
    const key = await deployFlow('A2-会签驳回重提', 'countersign', ['2', '3', '4']);
    const pi = await start(key, 'leave-A2');
    const t3 = (await todoOfInstance(tokens.u3, pi))[0];
    expect(t3).toBeDefined();

    // 3 驳回
    const rr = await api(tokens.u3, 'POST', `/api/v1/tasks/${t3}/reject`, { reason: '请假理由不充分' });
    expectOk(rr, '驳回');

    // 发起人出现待办，其余审批人子任务全部取消
    const submit = await todoOfInstance(tokens.admin, pi);
    expect(submit.length).toBe(1);
    expect(instanceStatus(db, pi)).toBe('running');
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0); // 驳回应取消同节点其余子任务
    expect(varOf(db, pi, 'rejected')).toBe(true);
    expect(await todoOfInstance(tokens.test, pi)).toEqual([]);
    expect(await todoOfInstance(tokens.u4, pi)).toEqual([]);

    // 发起人重新提交 → rejected 复位为 false
    const rc = await api(tokens.admin, 'POST', `/api/v1/tasks/${submit[0]}/complete`, { comment: '补充材料后重新提交' });
    expectOk(rc, '重新提交');
    expect(varOf(db, pi, 'rejected')).toBe(false);

    // 重新会签：2 通过后流程必须仍停留在会签节点（不得因 stale rejected 提前放行）
    const n2 = (await todoOfInstance(tokens.test, pi))[0];
    const n3 = (await todoOfInstance(tokens.u3, pi))[0];
    const n4 = (await todoOfInstance(tokens.u4, pi))[0];
    expect(n2).toBeDefined();
    expect(n3).toBeDefined();
    expect(n4).toBeDefined();
    const c2 = await api(tokens.test, 'POST', `/api/v1/tasks/${n2}/complete`, { comment: '复议同意' });
    expectOk(c2, '复议-2号');
    expect(c2.data.processFinished).toBe(false);
    await api(tokens.u3, 'POST', `/api/v1/tasks/${n3}/complete`, { comment: '复议同意' });
    const c4 = await api(tokens.u4, 'POST', `/api/v1/tasks/${n4}/complete`, { comment: '复议同意' });
    expect(c4.data.processFinished).toBe(true);
  });

  test('A3 转派 + 会签组合：2 把自己的子任务转给 3，由 3 完成两票，4 完成第三票', async () => {
    const key = await deployFlow('A3-会签转派', 'countersign', ['2', '3', '4']);
    const pi = await start(key, 'leave-A3');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    expect(t2).toBeDefined();

    // 2 转派给 3
    const rt = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/transfer`, { fromUser: '2', toUser: '3', reason: '出差代审' });
    expectOk(rt, '转派');
    const pend = pendingTasksOfNode(db, pi, 'approvalTask');
    expect(pend.find((x) => x.ID === t2)?.ASSIGNEE).toBe('3');
    expect(await todoOfInstance(tokens.test, pi)).toEqual([]);

    // 3 完成两票（转来的 + 自己的）
    const mine = await todoOfInstance(tokens.u3, pi);
    expect(mine.length).toBe(2);
    for (let i = 0; i < mine.length; i++) {
      const r = await api(tokens.u3, 'POST', `/api/v1/tasks/${mine[i]}/complete`, { comment: '代审同意' });
      expectOk(r, '3号完成');
      if (i === 0) expect(r.data.processFinished).toBe(false); // 还有 4 未通过
    }
    const t4 = (await todoOfInstance(tokens.u4, pi))[0];
    const r4 = await api(tokens.u4, 'POST', `/api/v1/tasks/${t4}/complete`, { comment: '同意-A3' });
    expect(r4.data.processFinished).toBe(true);
  });
});

describe('多人模式 B：或签 or_sign（任一人通过即过）', () => {
  test('B1 一人通过 → 立即结束，其余子任务取消', async () => {
    const key = await deployFlow('B1-或签基础', 'or_sign', ['2', '3', '4']);
    const pi = await start(key, 'leave-B1');
    const t3 = (await todoOfInstance(tokens.u3, pi))[0];
    expect(t3).toBeDefined();

    const r = await api(tokens.u3, 'POST', `/api/v1/tasks/${t3}/complete`, { comment: '同意-B1' });
    expectOk(r, '3号通过');
    expect(r.data.processFinished).toBe(true);
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);
    expect(await todoOfInstance(tokens.test, pi)).toEqual([]);
    expect(await todoOfInstance(tokens.u4, pi)).toEqual([]);
    expect(instanceStatus(db, pi)).toBe('completed');
  });

  test('B2 或签中驳回 → 回发起人重提 → 再或签通过', async () => {
    const key = await deployFlow('B2-或签驳回', 'or_sign', ['2', '3', '4']);
    const pi = await start(key, 'leave-B2');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/reject`, { reason: 'B2 驳回' });
    const submit = (await todoOfInstance(tokens.admin, pi))[0];
    expect(submit).toBeDefined();
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);
    await api(tokens.admin, 'POST', `/api/v1/tasks/${submit}/complete`, { comment: '重提' });
    const again = (await todoOfInstance(tokens.u4, pi))[0];
    expect(again).toBeDefined();
    const r = await api(tokens.u4, 'POST', `/api/v1/tasks/${again}/complete`, { comment: '同意-B2' });
    expect(r.data.processFinished).toBe(true);
  });
});

describe('多人模式 C：依次审批 sequential（2→3→4）', () => {
  test('C1 严格顺序：每步只有下一审批人有待办，变量计数递增', async () => {
    const key = await deployFlow('C1-依次基础', 'sequential', ['2', '3', '4']);
    const pi = await start(key, 'leave-C1');

    // 第一步：仅 2 有待办
    const first = await todoOfInstance(tokens.test, pi);
    expect(first.length).toBe(1);
    expect(await todoOfInstance(tokens.u3, pi)).toEqual([]);
    expect(await todoOfInstance(tokens.u4, pi)).toEqual([]);

    const r1 = await api(tokens.test, 'POST', `/api/v1/tasks/${first[0]}/complete`, { comment: '第1步' });
    expectOk(r1, '2号完成');
    expect(r1.data.processFinished).toBe(false);
    expect(r1.data.nextTaskAssignee).toBe('3');
    expect(varOf(db, pi, 'nrOfCompletedInstances')).toBe(1);

    const second = (await todoOfInstance(tokens.u3, pi))[0];
    const r2 = await api(tokens.u3, 'POST', `/api/v1/tasks/${second}/complete`, { comment: '第2步' });
    expectOk(r2, '3号完成');
    expect(r2.data.nextTaskAssignee).toBe('4');

    const third = (await todoOfInstance(tokens.u4, pi))[0];
    const r3 = await api(tokens.u4, 'POST', `/api/v1/tasks/${third}/complete`, { comment: '第3步' });
    expect(r3.data.processFinished).toBe(true);
  });

  test('C2 依次审批第二步驳回 → 回发起人，后续任务取消；重提后从头开始', async () => {
    const key = await deployFlow('C2-依次驳回', 'sequential', ['2', '3', '4']);
    const pi = await start(key, 'leave-C2');
    const first = (await todoOfInstance(tokens.test, pi))[0];
    await api(tokens.test, 'POST', `/api/v1/tasks/${first}/complete`, { comment: 'C2 第1步' });
    const second = (await todoOfInstance(tokens.u3, pi))[0];
    expect(second).toBeDefined();

    await api(tokens.u3, 'POST', `/api/v1/tasks/${second}/reject`, { reason: 'C2 中途驳回' });
    const submit = (await todoOfInstance(tokens.admin, pi))[0];
    expect(submit).toBeDefined();
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);
    expect(await todoOfInstance(tokens.u4, pi)).toEqual([]);

    await api(tokens.admin, 'POST', `/api/v1/tasks/${submit}/complete`, { comment: 'C2 重提' });
    const again = await todoOfInstance(tokens.test, pi); // 重新从 2 开始
    expect(again.length).toBe(1);
    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${again[0]}/complete`, { comment: 'C2 复审1' });
    expect(r.data.nextTaskAssignee).toBe('3');
  });

  test('C3 依次 + 加签组合：2 在第一步加签 4，全部（2→3→4）完成后流程才推进', async () => {
    const key = await deployFlow('C3-依次加签', 'sequential', ['2', '3']);
    const pi = await start(key, 'leave-C3');
    const first = (await todoOfInstance(tokens.test, pi))[0];
    expect(first).toBeDefined();

    // 2 加签 4（依次模式下 nrOfInstances 3，完成票数要求同步 +1）
    const rs = await api(tokens.test, 'POST', `/api/v1/tasks/${first}/add-sign`, { users: ['4'], comment: '请4号也会签' });
    expectOk(rs, '加签');
    expect(varOf(db, pi, 'nrOfInstances')).toBe(3);
    const added = (await todoOfInstance(tokens.u4, pi))[0];
    expect(added).toBeDefined(); // 加签人生成子任务

    await api(tokens.test, 'POST', `/api/v1/tasks/${first}/complete`, { comment: 'C3 第1步' });
    const second = (await todoOfInstance(tokens.u3, pi))[0];
    expect(second).toBeDefined();
    const r2 = await api(tokens.u3, 'POST', `/api/v1/tasks/${second}/complete`, { comment: 'C3 第2步' });
    expectOk(r2, '3号完成');
    // 修复验证：3 完成后集合耗尽，但加签人 4 仍未完成 → 流程必须等待
    expect(r2.data.processFinished).toBe(false);
    expect(instanceStatus(db, pi)).toBe('running');
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(1);

    const r4 = await api(tokens.u4, 'POST', `/api/v1/tasks/${added}/complete`, { comment: 'C3 加签完成' });
    expect(r4.data.processFinished).toBe(true);
  });
});

describe('动作 D：转派 transfer（普通单实例节点）', () => {
  async function plainFlow(name: string): Promise<string> {
    return deployFlow(name, null, ['2']);
  }

  test('D1 转派后 assignee 更新、原审批人无待办、新审批人可完成', async () => {
    const key = await plainFlow('D1-转派基础');
    const pi = await start(key, 'leave-D1');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    expect(t2).toBeDefined();

    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/transfer`, { fromUser: '2', toUser: '3', reason: 'D1 转派' });
    expectOk(r, '转派');
    const row = pendingTasksOfNode(db, pi, 'approvalTask')[0]!;
    expect(row.ASSIGNEE).toBe('3');
    expect(await todoOfInstance(tokens.test, pi)).toEqual([]);

    const done = await api(tokens.u3, 'POST', `/api/v1/tasks/${t2}/complete`, { comment: 'D1 代审完成' });
    expect(done.data.processFinished).toBe(true);
  });

  test('D2 转派给自己 → 报错（Cannot transfer to the same user）', async () => {
    const key = await plainFlow('D2-转派给自己');
    const pi = await start(key, 'leave-D2');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/transfer`, { fromUser: '2', toUser: '2', reason: 'x' });
    expect(r.code === 400 || r.code === 500).toBe(true);
    expect(String(r.msg)).toContain('Cannot transfer to the same user');
  });

  test('D3 转派 + 驳回组合：受派人驳回 → 回发起人重提 → 原审批人通过', async () => {
    const key = await plainFlow('D3-转派驳回');
    const pi = await start(key, 'leave-D3');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/transfer`, { fromUser: '2', toUser: '3', reason: 'D3 转派' });
    await api(tokens.u3, 'POST', `/api/v1/tasks/${t2}/reject`, { reason: 'D3 材料不全' });
    const submit = (await todoOfInstance(tokens.admin, pi))[0];
    expect(submit).toBeDefined();
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);

    await api(tokens.admin, 'POST', `/api/v1/tasks/${submit}/complete`, { comment: 'D3 重提' });
    const again = (await todoOfInstance(tokens.test, pi))[0]; // 回到原节点原审批人 2
    expect(again).toBeDefined();
    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${again}/complete`, { comment: 'D3 通过' });
    expect(r.data.processFinished).toBe(true);
  });
});

describe('动作 E：委托 delegate（Owner 保留语义）', () => {
  test('E1 委派后 assignee=受托人、OWNER=委托人；受托人完成即推进', async () => {
    const key = await deployFlow('E1-委托基础', null, ['2']);
    const pi = await start(key, 'leave-E1');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    expect(t2).toBeDefined();

    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/delegate`, { delegateTo: '3', comment: 'E1 请代办' });
    expectOk(r, '委派');
    const row = pendingTasksOfNode(db, pi, 'approvalTask')[0]!;
    expect(row.ASSIGNEE).toBe('3');
    expect(row.OWNER).toBe('2'); // 委托区别于转派：Owner 保留原审批人
    expect((await todoOfInstance(tokens.u3, pi)).includes(t2)).toBe(true);

    const done = await api(tokens.u3, 'POST', `/api/v1/tasks/${t2}/complete`, { comment: 'E1 代办完成' });
    expect(done.data.processFinished).toBe(true);
  });

  test('E2 缺少 delegateTo → 400 委派目标用户不能为空', async () => {
    const key = await deployFlow('E2-委托缺参', null, ['2']);
    const pi = await start(key, 'leave-E2');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/delegate`, { comment: 'no target' });
    expect(r.code).toBe(400);
    expect(String(r.msg)).toContain('委派目标用户');
  });
});

describe('动作 F：加签 add-sign', () => {
  test('F1 普通节点加签 → 被加签人成为候选（可见待办）；原审批人完成即推进', async () => {
    const key = await deployFlow('F1-普通加签', null, ['2']);
    const pi = await start(key, 'leave-F1');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    expect(t2).toBeDefined();

    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/add-sign`, { users: ['3', '4'], comment: 'F1 加签会审' });
    expectOk(r, '加签');
    expect((await todoOfInstance(tokens.u3, pi)).includes(t2)).toBe(true);
    expect((await todoOfInstance(tokens.u4, pi)).includes(t2)).toBe(true);

    const done = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/complete`, { comment: 'F1 完成会审' });
    expect(done.data.processFinished).toBe(true);
  });

  test('F2 会签节点加签：票数上限 +1，加签人不完成流程不结束', async () => {
    const key = await deployFlow('F2-会签加签', 'countersign', ['2', '3']);
    const pi = await start(key, 'leave-F2');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    const t3 = (await todoOfInstance(tokens.u3, pi))[0];

    await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/add-sign`, { users: ['4'], comment: 'F2 追加会签人' });
    expect(varOf(db, pi, 'nrOfInstances')).toBe(3);
    const t4 = (await todoOfInstance(tokens.u4, pi))[0];
    expect(t4).toBeDefined();

    await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/complete`, { comment: 'F2 1/3' });
    const mid = await api(tokens.u3, 'POST', `/api/v1/tasks/${t3}/complete`, { comment: 'F2 2/3' });
    expectOk(mid, '3号完成');
    expect(mid.data.processFinished).toBe(false); // 加签人 4 未完成
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(1);

    const fin = await api(tokens.u4, 'POST', `/api/v1/tasks/${t4}/complete`, { comment: 'F2 3/3' });
    expect(fin.data.processFinished).toBe(true);
  });

  test('F3 会签加签 + 加签人驳回组合 → 回发起人、他人子任务全取消', async () => {
    const key = await deployFlow('F3-加签驳回', 'countersign', ['2', '3']);
    const pi = await start(key, 'leave-F3');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/add-sign`, { users: ['4'], comment: 'F3 加签' });
    const t4 = (await todoOfInstance(tokens.u4, pi))[0];
    expect(t4).toBeDefined();

    await api(tokens.u4, 'POST', `/api/v1/tasks/${t4}/reject`, { reason: 'F3 加签人不同意' });
    expect((await todoOfInstance(tokens.admin, pi)).length).toBe(1);
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);
    expect(await todoOfInstance(tokens.test, pi)).toEqual([]);
    expect(await todoOfInstance(tokens.u3, pi)).toEqual([]);
  });
});

describe('动作 G：拒绝 refuse（不同意并终止流程）', () => {
  test('G1 或签节点 refuse → 实例 terminated，所有人无待办', async () => {
    const key = await deployFlow('G1-拒绝终止', 'or_sign', ['2', '3']);
    const pi = await start(key, 'leave-G1');
    const t2 = (await todoOfInstance(tokens.test, pi))[0];
    expect(t2).toBeDefined();

    const r = await api(tokens.test, 'POST', `/api/v1/tasks/${t2}/refuse`, { reason: 'G1 不同意，终止' });
    expectOk(r, '拒绝');
    expect(instanceStatus(db, pi)).toBe('terminated');
    expect(pendingTasksOfNode(db, pi, 'approvalTask').length).toBe(0);
    expect(await todoOfInstance(tokens.u3, pi)).toEqual([]);
  });
});
