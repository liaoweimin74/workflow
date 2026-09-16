/**
 * runtime.ts — 受控 DSL 工作流运行时引擎（Task 13-6b 核心）
 *
 * 用 IR（CONFIG_JSON，13-6a 部署侧产出）+ WF_* 表状态机复刻 Java Flowable 运行时行为。
 * 行为唯一权威：Java 源码（ProcessInstanceService / WorkflowTaskService / TaskRemindService /
 * RejectService / TransferService / AddSignService / ForwardSignService / ProcessHighlightService /
 * ProcessTaskPredictionService / ProcessHistoryService / ProcessVariableService）+ 8080 实测。
 *
 * 状态机：
 *  - WF_PROC_INST.STATUS: 'running' | 'completed' | 'terminated'（END_TIME/DURATION_MS 结束时写）
 *  - WF_EXEC_TOKEN: 单主 token（CURRENT_NODE=当前节点，STATUS='active'/'completed'/'terminated'，
 *    SUSPENSION_STATE 1=active 2=suspended，对齐 Flowable 挂起语义——挂起幂等，无 already 报错）
 *  - WF_TASK_INST.STATUS: 'pending' | 'completed' | 'deleted'
 *  - WF_ACTIVITY_INST.STATUS: 'active' | 'completed' | 'deleted'（含 sequenceFlow 活动，高亮对齐）
 *  - WF_TASK_CANDIDATE: TYPE='user'|'group'
 *  - WF_VARIABLE: 流程变量（本模块 CREATE TABLE IF NOT EXISTS 建立；upsert 语义对齐
 *    ACT_RU_VARIABLE，历史查询场景均取当前值，与 Java 行为一致）
 *
 * ID 契约：Flowable 的实例/任务 ID 是字符串；本引擎 WF_PROC_INST/WF_TASK_INST 的 DDL 主键为
 * INTEGER AUTOINCREMENT（12-c 定稿不可改），故对外 ID = String(行 ID)（顺序数字串，
 * Flowable 自身 ID 也多为数字串如 25005，外部表 wf_task_comment/wf_form_data/wf_task_remind
 * 按 TEXT 字符串关联——与契约"评论等外部表按字符串关联"一致）。
 *
 * procDefId 契约（13-6a）：`{KEY_}:{VERSION}:{WF_PROC_DEPLOY.ID}`。
 */
import { parseXml, rootElement, childElements, attr, type XmlEl } from './bpmn-ir';
import { extractApprovalUserIds } from './bpmn-ir';
import { all, one, run, getDb, type Row } from '../lib/db';
import { EngineError, BusinessException, IllegalArgumentError } from '../lib/errors';
import { nowText } from '../lib/params';
import { toIsoText, fmtIso } from '../lib/serialize';

// ---------------------------------------------------------------------------
// 0. 变量表（幂等建表）
// ---------------------------------------------------------------------------

const VARIABLE_DDL = `
CREATE TABLE IF NOT EXISTS WF_VARIABLE (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  PROC_INST_ID TEXT NOT NULL,
  NAME TEXT NOT NULL,
  TYPE TEXT,
  VALUE_TEXT TEXT,
  VALUE_NUM REAL,
  CREATE_TIME TEXT,
  LAST_UPDATED TEXT,
  TENANT_ID TEXT
)`;

let tablesReady = false;
function ensureTables(): void {
  if (tablesReady) return;
  getDb().exec(VARIABLE_DDL);
  getDb().exec('CREATE UNIQUE INDEX IF NOT EXISTS UX_WF_VARIABLE ON WF_VARIABLE (PROC_INST_ID, NAME);');
  tablesReady = true;
}

// ---------------------------------------------------------------------------
// 1. 运行时模型加载（IR + documentation + default flow）
// ---------------------------------------------------------------------------

export interface RtModel {
  procDefId: string;
  key: string;
  version: number;
  deployRowId: number;
  deployName: string | null;
  ir: IrShape;
  /** nodeId → BPMN documentation 文本（Flowable Task.description 来源） */
  docs: Record<string, string>;
  /** gateway/process id → default sequenceFlow id */
  defaultFlow: Record<string, string>;
  nodes: Map<string, IrNode>;
  outFlows: Map<string, IrFlow[]>;
}

interface IrNode {
  id: string;
  name: string | null;
  type: string;
  assignee?: string;
  candidateUsers?: string;
  candidateGroups?: string;
  formKey?: string;
  nodeRole?: string;
  multiInstance?: { sequential: boolean; collection?: string; elementVariable?: string; completionCondition?: string };
  config?: string;
}

interface IrFlow {
  id: string;
  source: string;
  target: string;
  condition?: string;
  name?: string | null;
}

interface IrShape {
  procKey: string | null;
  procName: string | null;
  nodes: IrNode[];
  flows: IrFlow[];
  targetNamespace?: string;
  processConfig?: string;
}

export interface ProcDefRef {
  key: string;
  version: number;
  rowId: number;
}

/** procDefId（13-6a 契约 `{key}:{version}:{rowId}`）解析（与 process-definition.ts 同规则） */
export function parseProcDefId(id: string): ProcDefRef | null {
  const i1 = id.lastIndexOf(':');
  if (i1 <= 0) return null;
  const rowId = Number(id.slice(i1 + 1));
  if (!Number.isInteger(rowId) || rowId <= 0) return null;
  const i2 = id.lastIndexOf(':', i1 - 1);
  if (i2 < 0) return null;
  const version = Number(id.slice(i2 + 1, i1));
  if (!Number.isInteger(version) || version <= 0) return null;
  return { key: id.slice(0, i2), version, rowId };
}

export function deployRowByProcDefId(id: string): Row | null {
  const p = parseProcDefId(id);
  if (!p) return null;
  const row = one(`SELECT * FROM WF_PROC_DEPLOY WHERE ID = ?`, [p.rowId]);
  if (!row) return null;
  if (String(row['KEY_'] ?? '') !== p.key || Number(row['VERSION'] ?? -1) !== p.version) return null;
  return row;
}

/** 发起节点：wf:nodeRole="initiator" 的 userTask，否则首个 userTask（InitiatorNodeResolver 移植） */
export function initiatorNodeIdOf(ir: IrShape): string | null {
  let first: string | null = null;
  for (const n of ir.nodes) {
    if (n.type !== 'userTask') continue;
    if (first == null) first = n.id;
    if (n.nodeRole === 'initiator') return n.id;
  }
  return first;
}

function documentationMap(bpmnXml: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (bpmnXml == null || bpmnXml.trim() === '') return out;
  try {
    const defs = rootElement(parseXml(bpmnXml));
    if (!defs) return out;
    const visit = (el: XmlEl): void => {
      const id = attr(el, 'id');
      if (id != null && id !== '') {
        for (const ch of childElements(el)) {
          if (ch.local === 'documentation') {
            const text = ch.children.map((c) => c.text ?? '').join('').trim();
            if (text !== '') out[id] = text;
            break;
          }
        }
      }
      for (const ch of childElements(el)) visit(ch);
    };
    visit(defs);
  } catch {
    // XML 解析失败 → 无 documentation（best effort）
  }
  return out;
}

function defaultFlowMap(bpmnXml: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (bpmnXml == null || bpmnXml.trim() === '') return out;
  try {
    const defs = rootElement(parseXml(bpmnXml));
    if (!defs) return out;
    const visit = (el: XmlEl): void => {
      const d = attr(el, 'default');
      if (d != null && d !== '') {
        const id = attr(el, 'id');
        if (id != null) out[id] = d;
      }
      for (const ch of childElements(el)) visit(ch);
    };
    visit(defs);
  } catch {
    // best effort
  }
  return out;
}

/** 加载运行时模型：IR 取 CONFIG_JSON（部署快照），缺列/解析失败回退 BPMN_XML 重解析 */
export function loadRuntimeModel(procDefId: string): RtModel {
  const row = deployRowByProcDefId(procDefId);
  if (!row) {
    throw new EngineError(`Cannot find process definition for id '${procDefId}'`);
  }
  let ir: IrShape = { procKey: null, procName: null, nodes: [], flows: [] };
  const configJson = row['CONFIG_JSON'] == null ? null : String(row['CONFIG_JSON']);
  let parsed = false;
  if (configJson != null && configJson.trim() !== '') {
    try {
      ir = JSON.parse(configJson) as IrShape;
      parsed = Array.isArray(ir?.nodes) && Array.isArray(ir?.flows);
    } catch {
      parsed = false;
    }
  }
  const bpmnXml = row['BPMN_XML'] == null ? null : String(row['BPMN_XML']);
  if (!parsed) {
    // 回退：从部署 XML 重解析（历史数据场景；13-6a parseBpmnToIr 不引入以避免路由模块耦合）
    ir = parseBpmnFallback(bpmnXml);
  }
  // ir 一定已赋值（parsed 成功时上方已赋值，失败时走 fallback）
  const nodes = new Map<string, IrNode>();
  for (const n of ir.nodes) nodes.set(n.id, n);
  const outFlows = new Map<string, IrFlow[]>();
  for (const f of ir.flows) {
    const arr = outFlows.get(f.source) ?? [];
    arr.push(f);
    outFlows.set(f.source, arr);
  }
  return {
    procDefId,
    key: String(row['KEY_'] ?? ''),
    version: Number(row['VERSION'] ?? 0),
    deployRowId: Number(row['ID']),
    deployName: row['NAME'] == null ? null : String(row['NAME']),
    ir,
    docs: documentationMap(bpmnXml),
    defaultFlow: defaultFlowMap(bpmnXml),
    nodes,
    outFlows,
  };
}

function parseBpmnFallback(bpmnXml: string | null): IrShape {
  if (bpmnXml == null) throw new EngineError('process definition model is not available');
  const defs = rootElement(parseXml(bpmnXml));
  if (!defs || defs.local !== 'definitions') throw new EngineError('BPMN XML: definitions element not found');
  const processEl = childElements(defs).find((c) => c.local === 'process');
  if (!processEl) throw new EngineError('BPMN XML: process element not found');
  const ir: IrShape = { procKey: attr(processEl, 'id'), procName: attr(processEl, 'name'), nodes: [], flows: [] };
  for (const ch of childElements(processEl)) {
    const id = attr(ch, 'id');
    if (id == null || id === '') continue;
    if (ch.local === 'sequenceFlow') {
      const flow: IrFlow = { id, source: attr(ch, 'sourceRef') ?? '', target: attr(ch, 'targetRef') ?? '' };
      for (const cc of childElements(ch)) {
        if (cc.local === 'conditionExpression') {
          const cond = cc.children.map((c) => c.text ?? '').join('').trim();
          if (cond !== '') flow.condition = cond;
        }
      }
      ir.flows.push(flow);
      continue;
    }
    const node: IrNode = { id, name: attr(ch, 'name'), type: ch.local! };
    const a = attr(ch, 'assignee');
    if (a != null) node.assignee = a;
    const cu = attr(ch, 'candidateUsers');
    if (cu != null) node.candidateUsers = cu;
    const cg = attr(ch, 'candidateGroups');
    if (cg != null) node.candidateGroups = cg;
    const fk = attr(ch, 'formKey');
    if (fk != null) node.formKey = fk;
    const nr = attr(ch, 'nodeRole');
    if (nr != null) node.nodeRole = nr;
    ir.nodes.push(node);
  }
  return ir;
}

/** 按流程 key 取该租户 latest 部署（Flowable startProcessInstanceByKeyAndTenantId 语义） */
export function latestDeployByKey(key: string | null, tenant: string): Row | null {
  return one(
    `SELECT * FROM WF_PROC_DEPLOY WHERE KEY_ = ? AND TENANT_ID = ? ORDER BY VERSION DESC, ID DESC LIMIT 1`,
    [key == null ? 'null' : key, tenant],
  );
}

// ---------------------------------------------------------------------------
// 2. 表达式（assignee 解析 + 网关条件求值，安全子集）
// ---------------------------------------------------------------------------

/** `${var}` 简单变量表达式 → String(值)；非简单表达式/缺失 → null */
export function resolveSimpleExpr(expr: string | null | undefined, vars: Record<string, unknown>): string | null {
  if (expr == null) return null;
  const m = /^\$\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}$/.exec(expr.trim());
  if (!m) return null;
  const v = vars[m[1]!];
  if (v == null) return null;
  return typeof v === 'string' ? v : String(v);
}

// --- UEL 安全子集求值器：变量替换 + 数值/字符串比较 + 逻辑/算术 + 括号 ---

type Tok = { t: 'num' | 'str' | 'ident' | 'op'; v: string };

const UEL_OPS = ['>=', '<=', '==', '!=', '&&', '||', '>', '<', '!', '+', '-', '*', '/', '%', '(', ')'];

function tokenizeUel(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9._]/.test(s[j]!)) j++;
      toks.push({ t: 'num', v: s.slice(i, j).replace(/_/g, '') });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let out = '';
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\' && j + 1 < s.length) {
          out += s[j + 1];
          j += 2;
          continue;
        }
        out += s[j]!;
        j++;
      }
      if (j >= s.length) throw new EngineError(`condition expression is invalid: unterminated string`);
      toks.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_$]/.test(s[j]!)) j++;
      toks.push({ t: 'ident', v: s.slice(i, j) });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (UEL_OPS.includes(two)) {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (UEL_OPS.includes(c)) {
      toks.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    throw new EngineError(`condition expression is invalid: unexpected character '${c}'`);
  }
  return toks;
}

const NUM_RE = /^-?\d+(\.\d+)?$/;

function isNumericLike(v: unknown): v is number | string {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && NUM_RE.test(v.trim());
}

function numOf(v: unknown): number {
  return typeof v === 'number' ? v : Number(String(v).trim());
}

class UelParser {
  private pos = 0;
  constructor(
    private toks: Tok[],
    private vars: Record<string, unknown>,
  ) {}
  private peek(): Tok | null {
    return this.toks[this.pos] ?? null;
  }
  private eat(v: string): boolean {
    const p = this.peek();
    if (p && p.t === 'op' && p.v === v) {
      this.pos++;
      return true;
    }
    return false;
  }
  parse(): unknown {
    const v = this.parseOr();
    if (this.pos !== this.toks.length) throw new EngineError(`condition expression is invalid: trailing tokens`);
    return v;
  }
  private parseOr(): unknown {
    let left = this.parseAnd();
    for (;;) {
      const p = this.peek();
      const isOr = (p && p.t === 'op' && (p.v === '||')) || (p && p.t === 'ident' && (p.v === 'or'));
      if (!isOr) return left;
      this.pos++;
      const right = this.parseAnd();
      left = truthy(left) || truthy(right);
    }
  }
  private parseAnd(): unknown {
    let left = this.parseNot();
    for (;;) {
      const p = this.peek();
      const isAnd = (p && p.t === 'op' && (p.v === '&&')) || (p && p.t === 'ident' && (p.v === 'and'));
      if (!isAnd) return left;
      this.pos++;
      const right = this.parseNot();
      left = truthy(left) && truthy(right);
    }
  }
  private parseNot(): unknown {
    const p = this.peek();
    if (p && ((p.t === 'op' && p.v === '!') || (p.t === 'ident' && p.v === 'not'))) {
      this.pos++;
      return !truthy(this.parseNot());
    }
    return this.parseComparison();
  }
  private parseComparison(): unknown {
    let left = this.parseAdd();
    for (;;) {
      const p = this.peek();
      if (!p) return left;
      let op: string | null = null;
      if (p.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(p.v)) op = p.v;
      if (p.t === 'ident' && ['gt', 'lt', 'ge', 'le', 'eq', 'ne'].includes(p.v)) op = { gt: '>', lt: '<', ge: '>=', le: '<=', eq: '==', ne: '!=' }[p.v]!;
      if (op == null) return left;
      this.pos++;
      const right = this.parseAdd();
      left = compare(op, left, right);
    }
  }
  private parseAdd(): unknown {
    let left = this.parseMul();
    for (;;) {
      const p = this.peek();
      if (!p || p.t !== 'op' || (p.v !== '+' && p.v !== '-')) return left;
      this.pos++;
      const right = this.parseMul();
      if (p.v === '+' && (typeof left === 'string' || typeof right === 'string') && !(isNumericLike(left) && isNumericLike(right))) {
        left = `${fmt(left)}${fmt(right)}`;
      } else {
        left = numOf(left) + (p.v === '+' ? 1 : -1) * numOf(right);
      }
    }
  }
  private parseMul(): unknown {
    let left = this.parseUnary();
    for (;;) {
      const p = this.peek();
      if (!p || p.t !== 'op' || !['*', '/', '%'].includes(p.v)) return left;
      this.pos++;
      const right = this.parseUnary();
      const a = numOf(left);
      const b = numOf(right);
      left = p.v === '*' ? a * b : p.v === '/' ? a / b : a % b;
    }
  }
  private parseUnary(): unknown {
    if (this.eat('-')) return -numOf(this.parseUnary());
    if (this.eat('+')) return numOf(this.parseUnary());
    return this.parsePrimary();
  }
  private parsePrimary(): unknown {
    const p = this.peek();
    if (!p) throw new EngineError(`condition expression is invalid: unexpected end`);
    if (p.t === 'num') {
      this.pos++;
      return Number(p.v);
    }
    if (p.t === 'str') {
      this.pos++;
      return p.v;
    }
    if (p.t === 'ident') {
      this.pos++;
      const name = p.v;
      if (name === 'true') return true;
      if (name === 'false') return false;
      if (name === 'null') return null;
      if (name === 'empty') return null; // empty 仅作比较右值占位
      if (Object.prototype.hasOwnProperty.call(this.vars, name)) return this.vars[name];
      return null; // 未知变量按 null（Flowable 会抛 property not found；这里保守取 null）
    }
    if (p.v === '(') {
      this.pos++;
      const v = this.parseOr();
      if (!this.eat(')')) throw new EngineError(`condition expression is invalid: missing ')'`);
      return v;
    }
    throw new EngineError(`condition expression is invalid: unexpected token '${p.v}'`);
  }
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '';
  return Boolean(v);
}

function fmt(v: unknown): string {
  return v == null ? '' : String(v);
}

function compare(op: string, left: unknown, right: unknown): boolean {
  const nullL = left == null;
  const nullR = right == null;
  if (op === '==') {
    if (nullL || nullR) return nullL && nullR;
    if (typeof left === 'boolean' || typeof right === 'boolean') return String(left) === String(right);
    if (isNumericLike(left) && isNumericLike(right)) return numOf(left) === numOf(right);
    return String(left) === String(right);
  }
  if (op === '!=') {
    if (nullL || nullR) return !(nullL && nullR);
    return !compare('==', left, right);
  }
  if (nullL || nullR) return false;
  if (isNumericLike(left) && isNumericLike(right)) {
    const a = numOf(left);
    const b = numOf(right);
    return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
  }
  const a = String(left);
  const b = String(right);
  return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
}

/** 求值条件表达式：支持 `${expr}` 包裹或裸 expr；空条件 → true */
export function evalCondition(condition: string | null | undefined, vars: Record<string, unknown>): boolean {
  if (condition == null || condition.trim() === '') return true;
  let expr = condition.trim();
  const m = /^\$\{([\s\S]*)\}$/.exec(expr);
  if (m) expr = m[1]!.trim();
  if (expr === '') return true;
  const result = new UelParser(tokenizeUel(expr), vars).parse();
  return truthy(result);
}

// ---------------------------------------------------------------------------
// 3. 变量存取（ProcessVariableService 对位）
// ---------------------------------------------------------------------------

function encodeVariable(v: unknown): { type: string; text: string | null; num: number | null } {
  if (v == null) return { type: 'null', text: null, num: null };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { type: 'long', text: null, num: v } : { type: 'double', text: null, num: v };
  }
  if (typeof v === 'boolean') return { type: 'boolean', text: v ? 'true' : 'false', num: null };
  if (typeof v === 'string') return { type: 'string', text: v, num: null };
  return { type: 'json', text: JSON.stringify(v), num: null };
}

function decodeVariable(type: string | null, text: string | null, num: number | null): unknown {
  switch (type) {
    case 'long':
    case 'double':
      return num;
    case 'boolean':
      return text === 'true' || text === '1';
    case 'json':
      if (text == null) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    case 'null':
      return null;
    default:
      return text;
  }
}

function requireRunningInstance(piId: string): Row {
  const row = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  if (!row || String(row['STATUS']) !== 'running') {
    // FlowableObjectNotFoundException("execution %s doesn't exist")，8080 实测对齐
    throw new EngineError(`execution ${piId} doesn't exist`);
  }
  return row;
}

export function getProcVariables(piId: string): Record<string, unknown> {
  ensureTables();
  requireRunningInstance(piId);
  const rows = all(`SELECT * FROM WF_VARIABLE WHERE PROC_INST_ID = ? ORDER BY ID ASC`, [piId]);
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    map[String(r['NAME'])] = decodeVariable(r['TYPE'] == null ? null : String(r['TYPE']), r['VALUE_TEXT'] == null ? null : String(r['VALUE_TEXT']), r['VALUE_NUM'] == null ? null : Number(r['VALUE_NUM']));
  }
  return map;
}

export function getProcVariable(piId: string, name: string): unknown {
  ensureTables();
  requireRunningInstance(piId);
  const r = one(`SELECT * FROM WF_VARIABLE WHERE PROC_INST_ID = ? AND NAME = ?`, [piId, name]);
  if (!r) return null;
  return decodeVariable(r['TYPE'] == null ? null : String(r['TYPE']), r['VALUE_TEXT'] == null ? null : String(r['VALUE_TEXT']), r['VALUE_NUM'] == null ? null : Number(r['VALUE_NUM']));
}

export function setProcVariables(piId: string, vars: Record<string, unknown>, tenant: string): void {
  ensureTables();
  requireRunningInstance(piId);
  const now = nowText();
  for (const [name, value] of Object.entries(vars)) {
    upsertVariable(piId, name, value, now, tenant);
  }
}

export function setProcVariable(piId: string, name: string, value: unknown, tenant: string): void {
  ensureTables();
  requireRunningInstance(piId);
  upsertVariable(piId, name, value, nowText(), tenant);
}

export function removeProcVariable(piId: string, name: string): void {
  ensureTables();
  requireRunningInstance(piId);
  run(`DELETE FROM WF_VARIABLE WHERE PROC_INST_ID = ? AND NAME = ?`, [piId, name]);
}

function upsertVariable(piId: string, name: string, value: unknown, now: string, tenant: string): void {
  const { type, text, num } = encodeVariable(value);
  const existing = one(`SELECT ID FROM WF_VARIABLE WHERE PROC_INST_ID = ? AND NAME = ?`, [piId, name]);
  if (existing) {
    run(`UPDATE WF_VARIABLE SET TYPE = ?, VALUE_TEXT = ?, VALUE_NUM = ?, LAST_UPDATED = ? WHERE ID = ?`, [
      type,
      text,
      num,
      now,
      Number(existing['ID']),
    ]);
  } else {
    run(`INSERT INTO WF_VARIABLE (PROC_INST_ID, NAME, TYPE, VALUE_TEXT, VALUE_NUM, CREATE_TIME, LAST_UPDATED, TENANT_ID) VALUES (?,?,?,?,?,?,?,?)`, [
      piId,
      name,
      type,
      text,
      num,
      now,
      now,
      tenant,
    ]);
  }
}

/** 实例存在（含已结束）且变量存在时的只读取值（列表 initiator 过滤等内部用，不做存在性校验） */
function peekVariable(piId: string, name: string): unknown {
  ensureTables();
  const r = one(`SELECT * FROM WF_VARIABLE WHERE PROC_INST_ID = ? AND NAME = ?`, [piId, name]);
  if (!r) return null;
  return decodeVariable(r['TYPE'] == null ? null : String(r['TYPE']), r['VALUE_TEXT'] == null ? null : String(r['VALUE_TEXT']), r['VALUE_NUM'] == null ? null : Number(r['VALUE_NUM']));
}

// ---------------------------------------------------------------------------
// 4. 核心状态机：发起 / 推进 / 完成
// ---------------------------------------------------------------------------

export interface StartResult {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  businessKey: string | null;
  tenantId: string;
}

const tx = <T>(fn: () => T): T => getDb().transaction(fn)();

/** 发起实例（ProcessInstanceService.startProcess + autoCompleteInitiatorTask 对位） */
export function startProcessInstance(opts: {
  key: string | null;
  businessKey: string | null;
  variables: Record<string, unknown>;
  userId: number;
  tenant: string;
}): StartResult {
  ensureTables();
  const { key, businessKey, variables, userId, tenant } = opts;
  return tx(() => {
    const deploy = latestDeployByKey(key, tenant);
    if (!deploy) {
      // Flowable FlowableObjectNotFoundException 消息
      throw new EngineError(`no processes deployed with key '${key == null ? 'null' : key}'`);
    }
    if (Number(deploy['SUSPENSION_STATE'] ?? 1) === 2) {
      const procDefId = `${deploy['KEY_']}:${Number(deploy['VERSION'])}:${Number(deploy['ID'])}`;
      throw new EngineError(
        `Cannot start process instance. Process definition ${deploy['NAME'] == null ? key : String(deploy['NAME'])} (id = ${procDefId}) is suspended`,
      );
    }

    const procDefId = `${deploy['KEY_']}:${Number(deploy['VERSION'])}:${Number(deploy['ID'])}`;
    const model = loadRuntimeModel(procDefId);
    const startNode = model.ir.nodes.find((n) => n.type === 'startEvent');
    if (startNode == null) {
      throw new EngineError(`No start event found in process definition '${procDefId}'`);
    }

    const now = nowText();
    run(
      `INSERT INTO WF_PROC_INST (PROC_DEF_ID, BUSINESS_KEY, START_USER_ID, START_TIME, END_TIME, DURATION_MS, STATUS, TENANT_ID)
       VALUES (?,?,?,NULL,NULL,NULL,'running',?)`,
      [procDefId, businessKey, String(userId), tenant],
    );
    const piId = String(Number(one(`SELECT last_insert_rowid() AS ID`)!['ID']));

    run(`INSERT INTO WF_EXEC_TOKEN (PROC_INST_ID, CURRENT_NODE, PARENT_TOKEN_ID, STATUS, SUSPENSION_STATE) VALUES (?,NULL,NULL,'active',1)`, [piId]);

    // 注入 initiator 变量（Controller 语义：SecurityContext 用户 ID 覆盖传入值）
    variables['initiator'] = String(userId);
    for (const [name, value] of Object.entries(variables)) {
      upsertVariable(piId, name, value, now, tenant);
    }

    // startEvent 活动实例（Flowable：开始事件活动即时完成）
    insertActivity(piId, procDefId, startNode.id, startNode.name, 'startEvent', null, now, now, 'completed', tenant);

    // 推进：若发起节点是 initiator userTask 则自动完成（InitiatorNodeResolver 语义）
    advanceFrom(model, piId, startNode.id, variables, {
      tenant,
      initiatorNodeId: initiatorNodeIdOf(model.ir),
      depth: 0,
      currentUserId: String(userId),
    });

    return {
      id: piId,
      processDefinitionId: procDefId,
      processDefinitionKey: model.key,
      businessKey,
      tenantId: tenant,
    };
  });
}

function insertActivity(
  piId: string,
  procDefId: string,
  actId: string,
  actName: string | null,
  actType: string,
  assignee: string | null,
  startTime: string,
  endTime: string | null,
  status: string,
  tenant: string,
): number {
  const duration = endTime != null ? Math.max(0, ts(endTime) - ts(startTime)) : null;
  run(
    `INSERT INTO WF_ACTIVITY_INST (PROC_INST_ID, PROC_DEF_ID, ACT_ID, ACT_NAME, ACT_TYPE, ASSIGNTEE, START_TIME, END_TIME, DURATION_MS, STATUS, TENANT_ID)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [piId, procDefId, actId, actName, actType, assignee, startTime, endTime, duration, status, tenant],
  );
  return Number(one(`SELECT last_insert_rowid() AS ID`)!['ID']);
}

function ts(text: string): number {
  const d = new Date(text.replace(' ', 'T') + (text.endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function closeActivityByTask(taskId: string, endTime: string, status: string): void {
  const a = one(
    `SELECT A.ID, A.START_TIME FROM WF_ACTIVITY_INST A JOIN WF_TASK_INST T ON T.PROC_INST_ID = A.PROC_INST_ID AND T.TASK_DEF_KEY = A.ACT_ID
     WHERE T.ID = ? AND A.ACT_TYPE = 'userTask' AND A.END_TIME IS NULL AND A.START_TIME = T.CREATE_TIME`,
    [taskId],
  );
  if (!a) return;
  run(`UPDATE WF_ACTIVITY_INST SET END_TIME = ?, DURATION_MS = ?, STATUS = ? WHERE ID = ?`, [
    endTime,
    Math.max(0, ts(endTime) - ts(String(a['START_TIME'] ?? endTime))),
    status,
    Number(a['ID']),
  ]);
}

interface AdvanceCtx {
  tenant: string;
  initiatorNodeId: string | null;
  depth: number;
  currentUserId: string | null;
  /** MI 上下文（子任务推进用） */
  miDone?: boolean;
}

const MAX_DEPTH = 100;

/** 从 fromNode 的出线推进（完成当前节点后调用） */
function advanceFrom(model: RtModel, piId: string, fromNodeId: string, vars: Record<string, unknown>, ctx: AdvanceCtx): void {
  if (ctx.depth > MAX_DEPTH) {
    throw new EngineError(`No outgoing sequence flow for element '${fromNodeId}' could be selected for continuing the process`);
  }
  ctx.depth++;
  const now = nowText();
  const flows = model.outFlows.get(fromNodeId) ?? [];
  if (flows.length === 0) {
    throw new EngineError(`No outgoing sequence flow for element '${fromNodeId}' could be selected for continuing the process`);
  }
  const chosen = pickFlow(model, fromNodeId, flows, vars);
  // sequenceFlow 也记录为活动实例（Flowable ACT_HI_ACTINST 语义，供 highlight 连线高亮）
  insertActivity(piId, model.procDefId, chosen.id, chosen.name ?? null, 'sequenceFlow', null, now, now, 'completed', ctx.tenant);

  const target = model.nodes.get(chosen.target);
  if (target == null) {
    throw new EngineError(`Cannot find flow element with id '${chosen.target}' in process definition '${model.procDefId}'`);
  }

  if (target.type === 'endEvent') {
    insertActivity(piId, model.procDefId, target.id, target.name, 'endEvent', null, now, now, 'completed', ctx.tenant);
    finishInstance(piId, now, 'completed');
    return;
  }

  if (target.type === 'userTask') {
    if (ctx.initiatorNodeId != null && target.id === ctx.initiatorNodeId) {
      // InitiatorNodeResolver 自动完成发起人节点（ProcessInstanceService#autoCompleteInitiatorTask）
      const taskRowId = createTaskInstance(model, piId, target, vars, ctx.tenant);
      autoCompleteTask(model, piId, taskRowId, vars, ctx);
      advanceFrom(model, piId, target.id, vars, ctx);
      return;
    }
    if (target.multiInstance != null) {
      enterMultiInstance(model, piId, target, vars, ctx);
      setTokenNode(piId, target.id, 'active');
      return;
    }
    createTaskInstance(model, piId, target, vars, ctx.tenant);
    setTokenNode(piId, target.id, 'active');
    return;
  }

  // 网关/其他节点：记录活动实例后继续推进
  insertActivity(piId, model.procDefId, target.id, target.name, target.type, null, now, now, 'completed', ctx.tenant);
  advanceFrom(model, piId, target.id, vars, ctx);
}

function pickFlow(model: RtModel, fromNodeId: string, flows: IrFlow[], vars: Record<string, unknown>): IrFlow {
  // Flowable：独占网关按连线序取第一个条件为真的；无匹配 → default flow；否则异常
  for (const f of flows) {
    if (f.condition != null && f.condition.trim() !== '' && evalCondition(f.condition, vars)) return f;
  }
  const defaultFlowId = model.defaultFlow[fromNodeId] ?? model.defaultFlow[model.ir.procKey ?? ''];
  if (defaultFlowId != null) {
    const d = flows.find((f) => f.id === defaultFlowId);
    if (d) return d;
  }
  // 全部无条件 → 首条（非网关节点常规路径）
  if (flows.every((f) => f.condition == null || f.condition.trim() === '')) return flows[0]!;
  throw new EngineError(`No outgoing sequence flow for element '${fromNodeId}' could be selected for continuing the process`);
}

function setTokenNode(piId: string, nodeId: string | null, status: string): void {
  run(`UPDATE WF_EXEC_TOKEN SET CURRENT_NODE = ?, STATUS = ? WHERE PROC_INST_ID = ?`, [nodeId, status, piId]);
}

function finishInstance(piId: string, endTime: string, status: 'completed' | 'terminated'): void {
  const inst = one(`SELECT START_TIME FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  const start = inst == null ? endTime : String(inst['START_TIME'] ?? endTime);
  run(`UPDATE WF_PROC_INST SET STATUS = ?, END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [status, endTime, Math.max(0, ts(endTime) - ts(start)), piId]);
  setTokenNode(piId, null, status);
}

/** 任务实例 + 候选人 + 活动实例（createTask 对位） */
function createTaskInstance(model: RtModel, piId: string, node: IrNode, vars: Record<string, unknown>, tenant: string, overrideAssignee: string | null = null): number {
  ensureTables();
  const now = nowText();
  let assignee: string | null = null;
  const rawAssignee = node.assignee;
  if (overrideAssignee != null) {
    assignee = overrideAssignee;
  } else if (rawAssignee != null && rawAssignee.trim() !== '') {
    assignee = rawAssignee.trim().startsWith('${') ? resolveSimpleExpr(rawAssignee, vars) : rawAssignee.trim();
  }
  run(
    `INSERT INTO WF_TASK_INST (PROC_INST_ID, PROC_DEF_ID, TASK_DEF_KEY, NAME, ASSIGNEE, OWNER, PRIORITY, CREATE_TIME, CLAIM_TIME, END_TIME, DURATION_MS, STATUS, TENANT_ID, FORM_KEY)
     VALUES (?,?,?,?,?,NULL,50,?,NULL,NULL,NULL,'pending',?,?)`,
    [piId, model.procDefId, node.id, node.name, assignee, now, tenant, node.formKey == null ? null : node.formKey],
  );
  const taskRowId = Number(one(`SELECT last_insert_rowid() AS ID`)!['ID']);
  // 候选人展开（flowable:candidateUsers/candidateGroups，部署期已把 userIds 字面量写进属性）
  const addCandidates = (raw: string | undefined, type: 'user' | 'group'): void => {
    if (raw == null || raw.trim() === '') return;
    for (const piece of raw.split(',')) {
      const id = resolveSimpleExpr(piece.trim(), vars) ?? piece.trim();
      if (id === '') continue;
      run(`INSERT INTO WF_TASK_CANDIDATE (TASK_ID, TYPE, CANDIDATE_ID) VALUES (?,?,?)`, [String(taskRowId), type, id]);
    }
  };
  addCandidates(node.candidateUsers, 'user');
  addCandidates(node.candidateGroups, 'group');
  insertActivity(piId, model.procDefId, node.id, node.name, 'userTask', assignee, now, null, 'active', tenant);
  return taskRowId;
}

/** 自动完成发起人节点任务（写 submit 审批意见，与 Java 相同） */
function autoCompleteTask(model: RtModel, piId: string, taskRowId: number, vars: Record<string, unknown>, ctx: AdvanceCtx): void {
  const now = nowText();
  const task = one(`SELECT * FROM WF_TASK_INST WHERE ID = ?`, [taskRowId])!;
  const assignee = task['ASSIGNEE'] == null ? (vars['initiator'] == null ? null : String(vars['initiator'])) : String(task['ASSIGNEE']);
  run(`UPDATE WF_TASK_INST SET ASSIGNEE = ?, STATUS = 'completed', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
    assignee,
    now,
    Math.max(0, ts(now) - ts(String(task['CREATE_TIME'] ?? now))),
    taskRowId,
  ]);
  closeActivityByTask(String(taskRowId), now, 'completed');
  saveComment({
    tenant: ctx.tenant,
    taskId: String(taskRowId),
    processInstanceId: piId,
    userId: assignee,
    action: 'submit',
    comment: null,
    targetUserId: null,
  });
}

// ---------------------------------------------------------------------------
// 5. 审批意见 / 催办记录
// ---------------------------------------------------------------------------

function uuid32(): string {
  const h = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) out += h[Math.floor(Math.random() * 16)];
  return out;
}

export function saveComment(rec: {
  tenant: string;
  taskId: string;
  processInstanceId: string;
  userId: string | null;
  action: string;
  comment: string | null;
  targetUserId: string | null;
}): void {
  run(
    `INSERT INTO wf_task_comment ("id","tenant_id","task_id","process_instance_id","user_id","comment","action","target_user_id","created_at")
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [uuid32(), rec.tenant, rec.taskId, rec.processInstanceId, rec.userId, rec.comment, rec.action, rec.targetUserId, nowText()],
  );
}

// ---------------------------------------------------------------------------
// 6. 任务操作（complete / reject / transfer / claim / delegate / add-sign / forward-sign）
// ---------------------------------------------------------------------------

export interface CompleteResult {
  processInstanceId: string;
  processFinished: boolean;
  nextTaskId: string | null;
  nextTaskName: string | null;
  nextTaskAssignee: string | null;
  nextTaskDefinitionKey: string | null;
}

function pendingTaskById(taskId: string): Row {
  const t = one(`SELECT * FROM WF_TASK_INST WHERE ID = ? AND STATUS = 'pending'`, [taskId]);
  if (!t) {
    // IllegalStateException("Task not found: ...") → Java generic handler → HTTP 500
    throw new Error(`Task not found: ${taskId}`);
  }
  return t;
}

/** 完成任务并推进（WorkflowTaskService#completeTaskWithResponse 对位） */
export function completeTaskById(taskId: string, variables: Record<string, unknown>, userId: string | null, comment: string | null, tenant: string): CompleteResult {
  ensureTables();
  return tx(() => {
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const model = loadRuntimeModel(String(task['PROC_DEF_ID']));
    const procInst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
    if (!procInst || String(procInst['STATUS']) !== 'running') {
      throw new Error(`Task not found: ${taskId}`);
    }
    const token = one(`SELECT * FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ?`, [piId]);
    if (token != null && Number(token['SUSPENSION_STATE'] ?? 1) === 2) {
      // Flowable CompleteTaskCmd：Cannot complete task x: Task[...] is suspended
      throw new EngineError(`Cannot complete task ${taskId}: Task[id=${taskId}, name=${task['NAME'] == null ? 'null' : String(task['NAME'])}] is suspended`);
    }

    const vars = getProcVariables(piId);
    const now = nowText();
    for (const [name, value] of Object.entries(variables)) {
      upsertVariable(piId, name, value, now, tenant);
      vars[name] = value;
    }

    run(`UPDATE WF_TASK_INST SET STATUS = 'completed', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
      now,
      Math.max(0, ts(now) - ts(String(task['CREATE_TIME'] ?? now))),
      taskId,
    ]);
    closeActivityByTask(taskId, now, 'completed');

    // 流程变量映射写入（VariableMappingWriter 对位，失败不影响结果）
    try {
      writeVariableMappings(model, piId, tenant);
    } catch {
      // 与 Java 相同：warn 后吞掉
    }

    if (userId != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId, action: 'approve', comment, targetUserId: null });
    }

    // MI 节点：完成子任务后按 completionCondition 决定推进或生成下一子任务
    const node = model.nodes.get(String(task['TASK_DEF_KEY']));
    if (node?.multiInstance != null && !handleMultiInstanceCompletion(model, piId, node, vars, { tenant, initiatorNodeId: null, depth: 0, currentUserId: userId })) {
      // 未满足完成条件且已生成后续子任务：不推进节点
      return buildCompleteResult(piId);
    }

    advanceFrom(model, piId, String(task['TASK_DEF_KEY']), vars, { tenant, initiatorNodeId: null, depth: 0, currentUserId: userId });
    return buildCompleteResult(piId);
  });
}

function buildCompleteResult(piId: string): CompleteResult {
  const inst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  const finished = inst == null || String(inst['STATUS']) !== 'running';
  let nextTaskId: string | null = null;
  let nextTaskName: string | null = null;
  let nextTaskAssignee: string | null = null;
  let nextTaskDefinitionKey: string | null = null;
  if (!finished) {
    const nt = one(`SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'pending' ORDER BY ID ASC LIMIT 1`, [piId]);
    if (nt) {
      nextTaskId = String(nt['ID']);
      nextTaskName = nt['NAME'] == null ? null : String(nt['NAME']);
      nextTaskAssignee = nt['ASSIGNEE'] == null ? null : String(nt['ASSIGNEE']);
      nextTaskDefinitionKey = nt['TASK_DEF_KEY'] == null ? null : String(nt['TASK_DEF_KEY']);
    }
  }
  return { processInstanceId: piId, processFinished: finished, nextTaskId, nextTaskName, nextTaskAssignee, nextTaskDefinitionKey };
}

/**
 * 多实例（会签/或签/依次审批，尽力而为）：完成一个子任务后判断 completionCondition；
 * 未完成 → 顺序模式生成下一个 approver 子任务（返回 false）；
 * 完成（条件满足/集合耗尽）→ 取消同节点剩余子任务并推进（返回 true）。
 */
function handleMultiInstanceCompletion(model: RtModel, piId: string, node: IrNode, vars: Record<string, unknown>, ctx: AdvanceCtx): boolean {
  const mi = node.multiInstance!;
  const collection = resolveCollection(model, node, vars);
  const doneCount = Number(vars['nrOfCompletedInstances'] ?? 0) + 1;
  upsertVariable(piId, 'nrOfCompletedInstances', doneCount, nowText(), ctx.tenant);
  vars['nrOfCompletedInstances'] = doneCount;
  upsertVariable(piId, 'nrOfInstances', collection.length, nowText(), ctx.tenant);
  vars['nrOfInstances'] = collection.length;
  upsertVariable(piId, 'nrOfActiveInstances', Math.max(0, collection.length - doneCount), nowText(), ctx.tenant);
  vars['nrOfActiveInstances'] = Math.max(0, collection.length - doneCount);

  const condTrue = vars['rejected'] === true || evalCondition(mi.completionCondition ?? '', vars);
  if (condTrue) {
    cancelSiblingTasks(piId, node.id);
    return true;
  }
  if (!mi.sequential) return true; // 并行模式：等待其余子任务
  if (doneCount >= collection.length) {
    return true; // 集合耗尽 → 结束本节点
  }
  const nextApprover = collection[doneCount]!;
  vars['approver'] = nextApprover;
  vars['loopCounter'] = doneCount + 1;
  createTaskInstance(model, piId, node, vars, ctx.tenant, String(nextApprover));
  return false;
}

/** 抵达 MI 节点时初始化计数变量并生成首批子任务 */
function enterMultiInstance(model: RtModel, piId: string, node: IrNode, vars: Record<string, unknown>, ctx: AdvanceCtx): void {
  const mi = node.multiInstance!;
  const collection = resolveCollection(model, node, vars);
  const elementVar = mi.elementVariable ?? 'approver';
  vars['nrOfInstances'] = collection.length;
  vars['nrOfCompletedInstances'] = 0;
  vars['nrOfActiveInstances'] = mi.sequential ? 1 : collection.length;
  vars['approverList'] = collection;
  const now = nowText();
  upsertVariable(piId, 'nrOfInstances', collection.length, now, ctx.tenant);
  upsertVariable(piId, 'nrOfCompletedInstances', 0, now, ctx.tenant);
  upsertVariable(piId, 'nrOfActiveInstances', vars['nrOfActiveInstances'], now, ctx.tenant);
  upsertVariable(piId, 'approverList', collection, now, ctx.tenant);
  if (mi.sequential) {
    if (collection.length === 0) return;
    vars[elementVar] = collection[0]!;
    vars['loopCounter'] = 1;
    createTaskInstance(model, piId, node, vars, ctx.tenant, String(collection[0]!));
  } else {
    for (const approver of collection) {
      vars[elementVar] = approver;
      createTaskInstance(model, piId, node, vars, ctx.tenant, String(approver));
    }
  }
}

function cancelSiblingTasks(piId: string, nodeId: string): void {
  const now = nowText();
  for (const t of all(`SELECT ID, CREATE_TIME FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND TASK_DEF_KEY = ? AND STATUS = 'pending'`, [piId, nodeId])) {
    run(`UPDATE WF_TASK_INST SET STATUS = 'deleted', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
      now,
      Math.max(0, ts(now) - ts(String(t['CREATE_TIME'] ?? now))),
      String(t['ID']),
    ]);
    closeActivityByTask(String(t['ID']), now, 'deleted');
  }
}

function resolveCollection(model: RtModel, node: IrNode, _vars: Record<string, unknown>): string[] {
  const cfg = node.config;
  const fromConfig = cfg != null ? extractApprovalUserIds(cfg) : [];
  if (fromConfig.length > 0) return fromConfig;
  // 回退：读部署版本快照（wf_node_config）
  const row = one(`SELECT "config_json" FROM wf_node_config WHERE "process_definition_id" = ? AND "node_id" = ? LIMIT 1`, [
    model.procDefId,
    node.id,
  ]);
  if (row) {
    const ids = extractApprovalUserIds(row['config_json'] == null ? '' : String(row['config_json']));
    if (ids.length > 0) return ids;
  }
  return [];
}

/** VariableMappingWriter 对位：__PROCESS__.variableMappings 写流程变量 */
export function writeVariableMappings(model: RtModel, piId: string, tenant: string): void {
  const processConfigJson = model.ir.processConfig ?? snapshotProcessConfig(model.procDefId);
  if (processConfigJson == null || processConfigJson.trim() === '') return;
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(processConfigJson) as Record<string, unknown>;
  } catch {
    return;
  }
  const mappings = root['variableMappings'];
  if (!Array.isArray(mappings)) return;
  const vars = getProcVariables(piId);
  for (const raw of mappings) {
    try {
      const m = raw as Record<string, unknown>;
      const source = m['source'] == null ? null : String(m['source']);
      const targetVar = m['variable'] == null ? null : String(m['variable']);
      const sourceField = m['sourceField'] == null ? null : String(m['sourceField']);
      if (targetVar == null || source == null || source.trim() === '') continue;
      let value: unknown = null;
      if (source.startsWith('variable:')) {
        value = vars[source.slice('variable:'.length)] ?? null;
      } else if (source.startsWith('form:')) {
        const formDefId = resolveSourceFormDefId(model, source);
        if (formDefId == null || sourceField == null || sourceField.trim() === '') continue;
        value = readFormField(tenant, formDefId, piId, sourceField);
      }
      if (value != null) {
        upsertVariable(piId, targetVar, value, nowText(), tenant);
      }
    } catch {
      // 单条失败跳过（Java 同语义）
    }
  }
}

function snapshotProcessConfig(procDefId: string): string | null {
  const r = one(`SELECT "config_json" FROM wf_node_config WHERE "process_definition_id" = ? AND "node_id" = '__PROCESS__' LIMIT 1`, [procDefId]);
  return r && r['config_json'] != null ? String(r['config_json']) : null;
}

function resolveSourceFormDefId(model: RtModel, source: string): string | null {
  const nodeId = source === 'form:initiator' ? initiatorNodeIdOf(model.ir) : source.slice('form:'.length);
  if (nodeId == null) return null;
  const row = one(`SELECT "config_json" FROM wf_node_config WHERE "process_definition_id" = ? AND "node_id" = ? LIMIT 1`, [model.procDefId, nodeId]);
  if (!row || row['config_json'] == null) return null;
  try {
    const cfg = JSON.parse(String(row['config_json'])) as Record<string, unknown>;
    const form = cfg['form'] as Record<string, unknown> | undefined;
    const v = form?.['formDefId'];
    return v == null ? null : String(v);
  } catch {
    return null;
  }
}

function readFormField(tenant: string, formDefId: string, piId: string, field: string): unknown {
  const r = one(
    `SELECT "data_json" FROM wf_form_data WHERE "tenant_id" = ? AND "process_instance_id" = ? AND "form_def_id" = ? AND "is_snapshot" = 0 LIMIT 1`,
    [tenant, piId, formDefId],
  );
  if (!r || r['data_json'] == null) return null;
  try {
    const data = JSON.parse(String(r['data_json'])) as Record<string, unknown>;
    const v = data[field];
    return v == null ? null : v;
  } catch {
    return null;
  }
}

/** 驳回（RejectService 对位）：移动回发起人节点 */
export function rejectTaskById(taskId: string, userId: string | null, reason: string | null, tenant: string): void {
  ensureTables();
  tx(() => {
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const model = loadRuntimeModel(String(task['PROC_DEF_ID']));
    const currentNodeId = String(task['TASK_DEF_KEY']);
    const initiatorNodeId = initiatorNodeIdOf(model.ir);
    if (initiatorNodeId == null) {
      throw new Error(`Initiator node not found for process definition: ${model.procDefId}`);
    }
    if (currentNodeId === initiatorNodeId) {
      throw new Error('Cannot reject: current node is already the initiator node');
    }

    const now = nowText();
    const vars = getProcVariables(piId);
    upsertVariable(piId, 'rejected', true, now, tenant);
    vars['rejected'] = true;

    // 当前任务作废（changeActivityState 语义：历史保留，任务删除）
    run(`UPDATE WF_TASK_INST SET STATUS = 'deleted', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
      now,
      Math.max(0, ts(now) - ts(String(task['CREATE_TIME'] ?? now))),
      taskId,
    ]);
    closeActivityByTask(taskId, now, 'deleted');

    // 发起人节点新建任务
    const initiatorNode = model.nodes.get(initiatorNodeId);
    if (initiatorNode == null) {
      throw new Error(`Initiator node not found for process definition: ${model.procDefId}`);
    }
    createTaskInstance(model, piId, initiatorNode, vars, tenant);
    setTokenNode(piId, initiatorNodeId, 'active');

    if (userId != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId, action: 'reject', comment: reason, targetUserId: null });
    }
    try {
      writeVariableMappings(model, piId, tenant);
    } catch {
      // 吞掉
    }
    return null;
  });
}

/** 转办（TransferService 对位）：改 assignee + 审计 + 意见 */
export function transferTaskById(taskId: string, fromUser: string, toUser: string, reason: string | null, tenant: string): void {
  ensureTables();
  tx(() => {
    if (fromUser === toUser) {
      throw new Error(`Cannot transfer to the same user: ${toUser}`);
    }
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const model = loadRuntimeModel(String(task['PROC_DEF_ID']));
    // 权限：流程级 AND 节点级 allowTransfer
    if (!extractOperations(model, String(task['TASK_DEF_KEY'])).allowTransfer) {
      throw new BusinessException('该节点不允许转办', 400);
    }
    const now = nowText();
    const originalAssignee = task['ASSIGNEE'] == null ? null : String(task['ASSIGNEE']);
    run(`UPDATE WF_TASK_INST SET ASSIGNEE = ? WHERE ID = ?`, [toUser, taskId]);
    run(`UPDATE WF_ACTIVITY_INST SET ASSIGNTEE = ? WHERE ACT_TYPE = 'userTask' AND END_TIME IS NULL AND ACT_ID = ? AND PROC_INST_ID = ?`, [
      toUser,
      String(task['TASK_DEF_KEY']),
      piId,
    ]);
    run(
      `INSERT INTO wf_task_transfer ("id","tenant_id","task_id","process_instance_id","from_user","to_user","reason","created_at") VALUES (?,?,?,?,?,?,?,?)`,
      [uuid32(), tenant, taskId, piId, originalAssignee ?? fromUser, toUser, reason, now],
    );
    if (fromUser != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId: fromUser, action: 'transfer', comment: reason, targetUserId: toUser });
    }
    return null;
  });
}

/** 认领（TaskService.claim 对位） */
export function claimTaskById(taskId: string, userId: string, tenant: string): void {
  ensureTables();
  tx(() => {
    const t = one(`SELECT * FROM WF_TASK_INST WHERE ID = ? AND STATUS = 'pending'`, [taskId]);
    if (!t) {
      throw new EngineError(`Cannot find task with id ${taskId}`);
    }
    const piId = String(t['PROC_INST_ID']);
    const token = one(`SELECT * FROM WF_EXEC_TOKEN WHERE PROC_INST_ID = ?`, [piId]);
    if (token != null && Number(token['SUSPENSION_STATE'] ?? 1) === 2) {
      throw new EngineError(`Cannot execute operation for Task[id=${taskId}, name=${t['NAME'] == null ? 'null' : String(t['NAME'])}] because it is suspended`);
    }
    const current = t['ASSIGNEE'] == null ? null : String(t['ASSIGNEE']);
    if (current != null && current !== '' && current !== userId) {
      throw new EngineError(`Task '${taskId}' is already claimed by '${current}'.`);
    }
    run(`UPDATE WF_TASK_INST SET ASSIGNEE = ?, CLAIM_TIME = ? WHERE ID = ?`, [userId, nowText(), taskId]);
    run(`UPDATE WF_ACTIVITY_INST SET ASSIGNTEE = ? WHERE ACT_TYPE = 'userTask' AND END_TIME IS NULL AND ACT_ID = ? AND PROC_INST_ID = ?`, [
      userId,
      String(t['TASK_DEF_KEY']),
      piId,
    ]);
    return null;
  });
}

/** 委派（delegateTaskWithComment 对位）：OWNER 保留原 assignee，ASSIGNEE 换人 */
export function delegateTaskById(taskId: string, delegateTo: string, fromUser: string | null, comment: string | null, tenant: string): void {
  ensureTables();
  tx(() => {
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const original = task['ASSIGNEE'] == null ? null : String(task['ASSIGNEE']);
    run(`UPDATE WF_TASK_INST SET OWNER = ?, ASSIGNEE = ? WHERE ID = ?`, [original, delegateTo, taskId]);
    run(`UPDATE WF_ACTIVITY_INST SET ASSIGNTEE = ? WHERE ACT_TYPE = 'userTask' AND END_TIME IS NULL AND ACT_ID = ? AND PROC_INST_ID = ?`, [
      delegateTo,
      String(task['TASK_DEF_KEY']),
      piId,
    ]);
    if (fromUser != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId: fromUser, action: 'delegate', comment, targetUserId: delegateTo });
    }
    return null;
  });
}

/** 加签（AddSignService 对位）：MI 节点新增子任务；普通节点加候选人 */
export function addSignTaskById(taskId: string, users: string[] | null, userId: string | null, comment: string | null, tenant: string): void {
  ensureTables();
  tx(() => {
    if (users == null || users.length === 0) {
      throw new IllegalArgumentError('AddSign users cannot be empty');
    }
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const model = loadRuntimeModel(String(task['PROC_DEF_ID']));
    const node = model.nodes.get(String(task['TASK_DEF_KEY']));
    if (node?.multiInstance != null) {
      const vars = getProcVariables(piId);
      const count = Number(vars['nrOfInstances'] ?? 0);
      vars['nrOfInstances'] = count + users.length;
      for (const u of users) {
        createTaskInstance(model, piId, node, vars, tenant, u);
      }
    } else {
      for (const u of users) {
        run(`INSERT INTO WF_TASK_CANDIDATE (TASK_ID, TYPE, CANDIDATE_ID) VALUES (?,?,?)`, [taskId, 'user', u]);
      }
    }
    if (userId != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId, action: 'add_sign', comment, targetUserId: users.join(',') });
    }
    return null;
  });
}

/** 转签（ForwardSignService 对位）：MI 子任务换人（原子任务作废不计数）；非 MI 节点引擎报错 */
export function forwardSignTaskById(taskId: string, toUser: string, userId: string | null, comment: string | null, tenant: string): void {
  ensureTables();
  tx(() => {
    if (toUser == null || toUser.trim() === '') {
      throw new IllegalArgumentError('toUser cannot be null or blank');
    }
    const task = pendingTaskById(taskId);
    const piId = String(task['PROC_INST_ID']);
    const model = loadRuntimeModel(String(task['PROC_DEF_ID']));
    const node = model.nodes.get(String(task['TASK_DEF_KEY']));
    const now = nowText();
    if (node?.multiInstance != null) {
      run(`UPDATE WF_TASK_INST SET STATUS = 'deleted', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
        now,
        Math.max(0, ts(now) - ts(String(task['CREATE_TIME'] ?? now))),
        taskId,
      ]);
      closeActivityByTask(taskId, now, 'deleted');
      const vars = getProcVariables(piId);
      createTaskInstance(model, piId, node, vars, tenant, toUser);
    } else {
      // Flowable deleteMultiInstanceExecution 对非 MI 执行报错
      throw new EngineError(`execution ${taskId} is not a multi instance execution`);
    }
    if (userId != null) {
      saveComment({ tenant, taskId, processInstanceId: piId, userId, action: 'forward_sign', comment, targetUserId: toUser });
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// 7. 挂起 / 恢复 / 终止
// ---------------------------------------------------------------------------

export function suspendProcessInstance(piId: string): void {
  ensureTables();
  const inst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  if (!inst || String(inst['STATUS']) !== 'running') {
    throw new EngineError(`Cannot find processInstance for id ${piId}`);
  }
  run(`UPDATE WF_EXEC_TOKEN SET SUSPENSION_STATE = 2 WHERE PROC_INST_ID = ?`, [piId]);
}

export function resumeProcessInstance(piId: string): void {
  ensureTables();
  const inst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  if (!inst || String(inst['STATUS']) !== 'running') {
    throw new EngineError(`Cannot find processInstance for id ${piId}`);
  }
  run(`UPDATE WF_EXEC_TOKEN SET SUSPENSION_STATE = 1 WHERE PROC_INST_ID = ?`, [piId]);
}

/** 终止（deleteProcessInstance 对位）：任务作废、活动关闭、实例 terminated */
export function terminateProcessInstance(piId: string, _reason: string): void {
  ensureTables();
  tx(() => {
    const inst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
    if (!inst || String(inst['STATUS']) !== 'running') {
      throw new EngineError(`Cannot find processInstance for id ${piId}`);
    }
    const now = nowText();
    for (const t of all(`SELECT ID, CREATE_TIME FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'pending'`, [piId])) {
      run(`UPDATE WF_TASK_INST SET STATUS = 'deleted', END_TIME = ?, DURATION_MS = ? WHERE ID = ?`, [
        now,
        Math.max(0, ts(now) - ts(String(t['CREATE_TIME'] ?? now))),
        String(t['ID']),
      ]);
      closeActivityByTask(String(t['ID']), now, 'deleted');
    }
    run(`UPDATE WF_ACTIVITY_INST SET END_TIME = ?, STATUS = 'deleted' WHERE PROC_INST_ID = ? AND END_TIME IS NULL`, [now, piId]);
    finishInstance(piId, now, 'terminated');
    return null;
  });
}

// ---------------------------------------------------------------------------
// 8. 操作权限（extractOperations 对位：流程级 AND 节点级）
// ---------------------------------------------------------------------------

export interface OperationsConfig {
  allowReject: boolean;
  allowAddSign: boolean;
  allowTransfer: boolean;
  allowDelegate: boolean;
}

function nodeOperationsFrom(configJson: string | null): OperationsConfig {
  // 节点级默认：allowReject true / allowAddSign false / allowTransfer true / allowDelegate false
  const out: OperationsConfig = { allowReject: true, allowAddSign: false, allowTransfer: true, allowDelegate: false };
  if (configJson == null || configJson.trim() === '') return out;
  try {
    const ops = (JSON.parse(configJson) as Record<string, unknown>)['operations'];
    if (ops == null || typeof ops !== 'object' || Array.isArray(ops)) return out;
    const o = ops as Record<string, unknown>;
    if (typeof o['allowReject'] === 'boolean') out.allowReject = o['allowReject'];
    if (typeof o['allowAddSign'] === 'boolean') out.allowAddSign = o['allowAddSign'];
    if (typeof o['allowTransfer'] === 'boolean') out.allowTransfer = o['allowTransfer'];
    if (typeof o['allowDelegate'] === 'boolean') out.allowDelegate = o['allowDelegate'];
  } catch {
    // 解析失败用默认
  }
  return out;
}

function processOperationsFrom(configJson: string | null): OperationsConfig | null {
  if (configJson == null || configJson.trim() === '') return null;
  try {
    const root = JSON.parse(configJson) as Record<string, unknown>;
    const policy = root['approvalPolicy'] as Record<string, unknown> | undefined;
    const ops = policy?.['operations'];
    if (ops == null || typeof ops !== 'object' || Array.isArray(ops)) return { allowReject: true, allowAddSign: true, allowTransfer: true, allowDelegate: true };
    const o = ops as Record<string, unknown>;
    return {
      allowReject: typeof o['allowReject'] === 'boolean' ? o['allowReject'] : true,
      allowAddSign: typeof o['allowAddSign'] === 'boolean' ? o['allowAddSign'] : true,
      allowTransfer: typeof o['allowTransfer'] === 'boolean' ? o['allowTransfer'] : true,
      allowDelegate: typeof o['allowDelegate'] === 'boolean' ? o['allowDelegate'] : true,
    };
  } catch {
    return { allowReject: true, allowAddSign: true, allowTransfer: true, allowDelegate: true };
  }
}

export function extractOperations(model: RtModel, taskDefKey: string): OperationsConfig {
  const configs = all(`SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_definition_id" = ?`, [model.procDefId]);
  let processLevel: OperationsConfig | null = null;
  let nodeLevel: OperationsConfig = { allowReject: true, allowAddSign: false, allowTransfer: true, allowDelegate: false };
  for (const c of configs) {
    const nodeId = String(c['node_id']);
    const json = c['config_json'] == null ? null : String(c['config_json']);
    if (nodeId === '__PROCESS__') processLevel = processOperationsFrom(json);
    if (nodeId === taskDefKey) nodeLevel = nodeOperationsFrom(json);
  }
  if (processLevel == null) return nodeLevel;
  return {
    allowReject: processLevel.allowReject && nodeLevel.allowReject,
    allowAddSign: processLevel.allowAddSign && nodeLevel.allowAddSign,
    allowTransfer: processLevel.allowTransfer && nodeLevel.allowTransfer,
    allowDelegate: processLevel.allowDelegate && nodeLevel.allowDelegate,
  };
}

// ---------------------------------------------------------------------------
// 9. 表单配置（extractFormConfig 对位：节点表单 > 流程默认表单）
// ---------------------------------------------------------------------------

export interface FormConfigResult {
  formDefId: string;
  fieldPermissions: Record<string, string> | null;
}

export function extractFormConfig(model: RtModel, taskDefKey: string): FormConfigResult | null {
  const configs = all(`SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_definition_id" = ?`, [model.procDefId]);
  let taskCfg: FormConfigResult | null = null;
  let processCfg: FormConfigResult | null = null;
  for (const c of configs) {
    const parsed = parseFormConfig(c['config_json'] == null ? null : String(c['config_json']));
    if (parsed == null) continue;
    if (taskDefKey === String(c['node_id'])) taskCfg = parsed;
    else if ('__PROCESS__' === String(c['node_id'])) processCfg = parsed;
  }
  const selected = taskCfg ?? processCfg;
  if (selected != null && selected.fieldPermissions == null) selected.fieldPermissions = {};
  return selected;
}

function parseFormConfig(configJson: string | null): FormConfigResult | null {
  if (configJson == null || configJson.trim() === '') return null;
  try {
    const form = (JSON.parse(configJson) as Record<string, unknown>)['form'];
    if (form == null || typeof form !== 'object' || Array.isArray(form)) return null;
    const f = form as Record<string, unknown>;
    if (f['formDefId'] == null) return null;
    const formDefId = String(f['formDefId']);
    if (formDefId === '') return null;
    let permissions: Record<string, string> | null = null;
    const permNode = f['fieldPermissions'];
    if (permNode != null && typeof permNode === 'object' && !Array.isArray(permNode)) {
      permissions = {};
      for (const [k, v] of Object.entries(permNode as Record<string, unknown>)) {
        permissions[k] = typeof v === 'string' ? v : String(v);
      }
    }
    return { formDefId, fieldPermissions: permissions };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 10. 查询装配（与 Java VO/HashMap 输出序一致）
// ---------------------------------------------------------------------------

/** LocalDateTime.toString() 风格（秒精度 ISO，T 分隔） */
export function iso(v: unknown): string | null {
  if (v == null) return null;
  const s = toIsoText(v);
  return typeof s === 'string' ? s : null;
}

export function instanceToMap(row: Row, token: Row | null, model: RtModel | null): Record<string, unknown> {
  const suspended = token != null && Number(token['SUSPENSION_STATE'] ?? 1) === 2;
  const running = String(row['STATUS']) === 'running';
  const node = row['PROC_DEF_ID'] == null ? null : nodeRefByProcDefId(String(row['PROC_DEF_ID']));
  return {
    id: String(row['ID']),
    processDefinitionId: row['PROC_DEF_ID'] == null ? null : String(row['PROC_DEF_ID']),
    processDefinitionKey: model?.key ?? node?.key ?? null,
    processDefinitionName: model?.deployName ?? node?.name ?? null,
    businessKey: row['BUSINESS_KEY'] == null ? null : String(row['BUSINESS_KEY']),
    tenantId: row['TENANT_ID'] == null ? null : String(row['TENANT_ID']),
    suspended,
    ended: !running,
    name: null,
    startTime: iso(row['START_TIME']),
    currentNode: running ? (token?.['CURRENT_NODE'] == null ? null : String(token['CURRENT_NODE'])) : null,
    status: suspended ? 'suspended' : running ? 'running' : 'completed',
  };
}

interface NodeRef {
  key: string | null;
  name: string | null;
}

function nodeRefByProcDefId(procDefId: string): NodeRef | null {
  const r = one(`SELECT KEY_, NAME FROM WF_PROC_DEPLOY WHERE ID = ?`, [parseProcDefId(procDefId)?.rowId ?? -1]);
  if (!r) return null;
  return { key: r['KEY_'] == null ? null : String(r['KEY_']), name: r['NAME'] == null ? null : String(r['NAME']) };
}

export function instanceToHistoricMap(row: Row, model: RtModel | null): Record<string, unknown> {
  const piId = String(row['ID']);
  const running = String(row['STATUS']) === 'running';
  let currentNode: string | null = null;
  if (running) {
    const names = all(`SELECT NAME FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'pending' ORDER BY ID ASC`, [piId])
      .map((r) => (r['NAME'] == null ? '' : String(r['NAME'])))
      .filter((n) => n.trim() !== '');
    currentNode = Array.from(new Set(names)).join('、') || null;
  }
  const node = row['PROC_DEF_ID'] == null ? null : nodeRefByProcDefId(String(row['PROC_DEF_ID']));
  const vars = peekVariable(piId, 'initiator');
  return {
    id: piId,
    processDefinitionId: row['PROC_DEF_ID'] == null ? null : String(row['PROC_DEF_ID']),
    processDefinitionKey: model?.key ?? node?.key ?? null,
    processDefinitionName: model?.deployName ?? node?.name ?? null,
    businessKey: row['BUSINESS_KEY'] == null ? null : String(row['BUSINESS_KEY']),
    tenantId: row['TENANT_ID'] == null ? null : String(row['TENANT_ID']),
    suspended: false,
    ended: row['END_TIME'] != null,
    name: null,
    startTime: iso(row['START_TIME']),
    currentNode,
    status: row['END_TIME'] != null ? 'completed' : 'running',
    initiator: vars == null ? null : String(vars),
  };
}

export function userNamesOf(ids: Array<string | null | undefined>): Map<string, string> {
  const out = new Map<string, string>();
  const clean = Array.from(new Set(ids.filter((x): x is string => x != null && x !== '')));
  if (clean.length === 0) return out;
  const numeric = clean.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  if (numeric.length === 0) return out;
  const placeholders = numeric.map(() => '?').join(',');
  const rows = all(`SELECT ID, NICKNAME, USERNAME FROM SYS_USER WHERE ID IN (${placeholders})`, numeric);
  for (const r of rows) {
    const id = String(Number(r['ID']));
    const nickname = r['NICKNAME'] == null ? null : String(r['NICKNAME']);
    const username = r['USERNAME'] == null ? null : String(r['USERNAME']);
    out.set(id, nickname != null && nickname !== '' ? nickname : (username ?? id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 11. 催办（TaskRemindService 对位）
// ---------------------------------------------------------------------------

export interface RemindOutcome {
  kind: 'ok' | 'rate-limited' | 'no-assignee' | 'not-found';
  message?: string;
}

export function remindTask(taskId: string, remindFrom: string | null, tenant: string, frequencyHours = 24): RemindOutcome {
  ensureTables();
  return tx(() => {
    const t = one(`SELECT * FROM WF_TASK_INST WHERE ID = ? AND STATUS = 'pending'`, [taskId]);
    if (!t) {
      // TaskRemindService: IllegalStateException("Task not found: x") → HTTP 500
      throw new Error(`Task not found: ${taskId}`);
    }
    const last = one(`SELECT * FROM wf_task_remind WHERE "task_id" = ? ORDER BY "remind_time" DESC, rowid DESC LIMIT 1`, [taskId]);
    if (last != null && last['remind_time'] != null) {
      const lastMs = ts(String(last['remind_time']).replace(' ', 'T') + 'Z');
      const hours = Math.floor((Date.now() - lastMs) / 3_600_000);
      if (hours < frequencyHours) {
        return {
          kind: 'rate-limited',
          message: `Task ${taskId} was reminded ${hours}h ago, within the ${frequencyHours}h frequency limit`,
        } as RemindOutcome;
      }
    }
    const remindTo = t['ASSIGNEE'] == null || String(t['ASSIGNEE']).trim() === '' ? (t['OWNER'] == null ? null : String(t['OWNER'])) : String(t['ASSIGNEE']);
    if (remindTo == null || remindTo.trim() === '') {
      return { kind: 'no-assignee', message: `Task ${taskId} has no assignee or owner to remind` } as RemindOutcome;
    }
    run(
      `INSERT INTO wf_task_remind ("id","tenant_id","task_id","process_instance_id","remind_from","remind_to","remind_time") VALUES (?,?,?,?,?,?,?)`,
      [uuid32(), tenant, taskId, String(t['PROC_INST_ID']), remindFrom, remindTo, nowText()],
    );
    // 通知中心挂钩占位（Java：WorkflowNotifier.notifyTaskReminded，内部吞异常）
    notifyTaskReminded(String(t['PROC_INST_ID']), taskId, remindFrom, remindTo, t['NAME'] == null ? null : String(t['NAME']));
    return { kind: 'ok' } as RemindOutcome;
  }) as RemindOutcome;
}

/** 通知挂钩占位：后续对接 MSG_* 表；当前仅日志（与 Java 本期 log 行为一致） */
export function notifyTaskReminded(processInstanceId: string, taskId: string, from: string | null, to: string, taskName: string | null): void {
  console.log(
    `[workflow] 催办通知 taskId=${taskId} processInstanceId=${processInstanceId} from=${from ?? ''} to=${to} task=${taskName ?? ''}`,
  );
}

// ---------------------------------------------------------------------------
// 12. 审批历史 / 高亮 / 预测（只读装配）
// ---------------------------------------------------------------------------

export function getApprovalHistory(piId: string): Array<Record<string, unknown>> {
  const activities = all(
    `SELECT * FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND ACT_TYPE = 'userTask' ORDER BY START_TIME ASC, ID ASC`,
    [piId],
  );
  if (activities.length === 0) return [];
  const comments = all(`SELECT * FROM wf_task_comment WHERE "process_instance_id" = ? ORDER BY "created_at" ASC, rowid ASC`, [piId]);
  const lastByTask = new Map<string, Row>();
  for (const c of comments) lastByTask.set(String(c['task_id']), c);
  const nameMap = userNamesOf(activities.map((a) => (a['ASSIGNTEE'] == null ? null : String(a['ASSIGNTEE']))));
  return activities.map((a) => {
    const comment = lastByTask.get(taskIdOfActivity(piId, a));
    const assignee = a['ASSIGNTEE'] == null ? null : String(a['ASSIGNTEE']);
    return {
      action: comment == null ? null : comment['action'] == null ? null : String(comment['action']),
      activityId: a['ACT_ID'] == null ? null : String(a['ACT_ID']),
      activityName: a['ACT_NAME'] == null ? null : String(a['ACT_NAME']),
      assignee,
      assigneeName: assignee == null ? null : (nameMap.get(assignee) ?? null),
      comment: comment == null ? null : comment['comment'] == null ? null : String(comment['comment']),
      endTime: iso(a['END_TIME']),
      startTime: iso(a['START_TIME']),
    };
  });
}

function taskIdOfActivity(piId: string, activity: Row): string {
  // wf_task_comment 按 task_id 关联；WF_ACTIVITY_INST 不存 task_id。
  // 活动实例与任务实例在同一事务内同时创建（同一 CREATE_TIME 文本），按此配对；
  // 多实例并行子任务同刻创建时取最新（记录为已知限制）。
  const t = one(
    `SELECT ID FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND TASK_DEF_KEY = ? AND CREATE_TIME = ? ORDER BY ID DESC LIMIT 1`,
    [piId, activity['ACT_ID'] == null ? '' : String(activity['ACT_ID']), activity['START_TIME'] == null ? '' : String(activity['START_TIME'])],
  );
  if (t) return String(t['ID']);
  const fallback = one(
    `SELECT ID FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND TASK_DEF_KEY = ? ORDER BY ID DESC LIMIT 1`,
    [piId, activity['ACT_ID'] == null ? '' : String(activity['ACT_ID'])],
  );
  return fallback == null ? '' : String(fallback['ID']);
}

export function getHighlight(piId: string): Record<string, unknown> {
  const completed = all(
    `SELECT ACT_ID FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND END_TIME IS NOT NULL ORDER BY START_TIME ASC, ID ASC`,
    [piId],
  ).map((r) => String(r['ACT_ID']));
  const active: string[] = [];
  for (const r of all(`SELECT ACT_ID FROM WF_ACTIVITY_INST WHERE PROC_INST_ID = ? AND END_TIME IS NULL ORDER BY ID ASC`, [piId])) {
    const id = String(r['ACT_ID']);
    if (!active.includes(id)) active.push(id);
  }
  return { completedActivityIds: completed, activeActivityIds: active };
}

export interface PredictionNode {
  action: string | null;
  activityId: string | null;
  activityName: string | null;
  assigneeName: string | null;
  candidateNames: string | null;
  comment: string | null;
  endTime: string | null;
  hasBranch: boolean;
  lineType: string;
  multiMode: string | null;
  status: string;
  targetUserName: string | null;
  type: string;
}

export function getPrediction(piId: string): PredictionNode[] {
  ensureTables();
  const inst = one(`SELECT * FROM WF_PROC_INST WHERE ID = ?`, [piId]);
  if (!inst) return [];
  const model = loadRuntimeModel(String(inst['PROC_DEF_ID']));
  const comments = all(`SELECT * FROM wf_task_comment WHERE "process_instance_id" = ? ORDER BY "created_at" ASC, rowid ASC`, [piId]);
  const nameMap = userNamesOf([
    ...comments.map((c) => (c['user_id'] == null ? null : String(c['user_id']))),
    ...comments.flatMap((c) => (c['target_user_id'] == null ? [] : String(c['target_user_id']).split(','))),
  ]);
  const out: PredictionNode[] = [];
  for (const c of comments) {
    const task = one(`SELECT * FROM WF_TASK_INST WHERE ID = ?`, [String(c['task_id'])]);
    const activityId = task == null ? null : String(task['TASK_DEF_KEY']);
    const node = activityId == null ? undefined : model.nodes.get(activityId);
    const targets = (c['target_user_id'] == null ? [] : String(c['target_user_id']).split(',').map((s) => s.trim())).filter((s) => s !== '');
    const targetNames = targets.map((t) => nameMap.get(t) ?? t);
    out.push({
      action: c['action'] == null ? null : String(c['action']),
      activityId,
      activityName: activityId == null ? null : (node?.name ?? activityId),
      assigneeName: c['user_id'] == null ? null : (nameMap.get(String(c['user_id'])) ?? null),
      candidateNames: null,
      comment: c['comment'] == null ? null : String(c['comment']),
      endTime: iso(c['created_at']),
      hasBranch: false,
      lineType: 'solid',
      multiMode: null,
      status: 'completed',
      targetUserName: targetNames.length === 0 ? null : targetNames.join('、'),
      type: 'userTask',
    });
  }

  // 活跃节点（userTask 待办）
  const pendingTasks = all(`SELECT * FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND STATUS = 'pending' ORDER BY ID ASC`, [piId]);
  const activeIds: string[] = [];
  for (const t of pendingTasks) {
    const activityId = String(t['TASK_DEF_KEY']);
    if (activeIds.includes(activityId)) continue;
    activeIds.push(activityId);
    const node = model.nodes.get(activityId);
    const assignee = t['ASSIGNEE'] == null ? null : String(t['ASSIGNEE']);
    const cfg = nodeConfigJson(model, activityId);
    const candidateIds = cfg != null ? extractApprovalUserIds(cfg) : [];
    out.push({
      action: null,
      activityId,
      activityName: node?.name ?? activityId,
      assigneeName: assignee == null ? null : (nameMap.get(assignee) ?? null),
      candidateNames: candidateIds.length === 0 ? null : candidateIds.map((id) => nameMap.get(id) ?? id).join('、'),
      comment: null,
      endTime: null,
      hasBranch: false,
      lineType: 'solid',
      multiMode: extractMultiModeRaw(cfg),
      status: 'active',
      targetUserName: null,
      type: 'userTask',
    });
  }

  // 预测（无条件连线遍历；有条件停止，hasBranch 恒 false 对齐 Java 死代码行为）
  if (activeIds.length > 0) {
    const visited = new Set<string>(activeIds);
    for (const activeId of activeIds) {
      traversePrediction(model, activeId, out, visited);
    }
  }
  return out;
}

function traversePrediction(model: RtModel, activityId: string, out: PredictionNode[], visited: Set<string>): void {
  if (visited.has(activityId)) return;
  visited.add(activityId);
  const node = model.nodes.get(activityId);
  if (node == null) return;
  for (const flow of model.outFlows.get(activityId) ?? []) {
    if (flow.condition != null && flow.condition.trim() !== '') continue; // 有条件 → 停止
    const target = model.nodes.get(flow.target);
    if (target == null) continue;
    if (target.type === 'endEvent') {
      out.push({
        action: null,
        activityId: target.id,
        activityName: target.name ?? '结束',
        assigneeName: null,
        candidateNames: null,
        comment: null,
        endTime: null,
        hasBranch: false,
        lineType: 'dashed',
        multiMode: null,
        status: 'predicted',
        targetUserName: null,
        type: 'endEvent',
      });
      visited.add(target.id);
      continue;
    }
    if (target.type === 'userTask') {
      if (!visited.has(target.id)) {
        const cfg = nodeConfigJson(model, target.id);
        const candidateIds = cfg != null ? extractApprovalUserIds(cfg) : [];
        const nameMap = userNamesOf(candidateIds);
        out.push({
          action: null,
          activityId: target.id,
          activityName: target.name,
          assigneeName: null,
          candidateNames: candidateIds.length === 0 ? null : candidateIds.map((id) => nameMap.get(id) ?? id).join('、'),
          comment: null,
          endTime: null,
          hasBranch: false,
          lineType: 'dashed',
          multiMode: extractMultiModeRaw(cfg),
          status: 'predicted',
          targetUserName: null,
          type: 'userTask',
        });
      }
      traversePrediction(model, target.id, out, visited);
      continue;
    }
    traversePrediction(model, target.id, out, visited);
  }
}

function nodeConfigJson(model: RtModel, nodeId: string): string | null {
  const node = model.nodes.get(nodeId);
  if (node?.config != null) return node.config;
  const r = one(`SELECT "config_json" FROM wf_node_config WHERE "process_definition_id" = ? AND "node_id" = ? LIMIT 1`, [model.procDefId, nodeId]);
  return r && r['config_json'] != null ? String(r['config_json']) : null;
}

function extractMultiModeRaw(configJson: string | null): string | null {
  if (configJson == null || configJson.trim() === '') return null;
  try {
    const approval = (JSON.parse(configJson) as Record<string, unknown>)['approval'];
    const mode = approval == null ? undefined : (approval as Record<string, unknown>)['multiMode'];
    return typeof mode === 'string' && mode.trim() !== '' ? mode : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 13. misc
// ---------------------------------------------------------------------------

/** "yyyy-MM-ddTHH:mm:ss" → 存储文本（解析失败 null） */
export function parseIsoDate(text: string): string | null {
  try {
    const d = new Date(text.trim().replace(' ', 'T') + (/(Z|[+-]\d{2}:?\d{2})$/.test(text.trim()) ? '' : 'Z'));
    if (Number.isNaN(d.getTime())) return null;
    return fmtIso(d).replace('T', ' ');
  } catch {
    return null;
  }
}
