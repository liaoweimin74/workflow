// ---------------------------------------------------------------------
// 数据层：bun:sqlite 单文件库，结构对齐 Java 侧（实体类为真源，迁移 DDL 为辅）。
//  - sys_*/msg_*：自增主键（Java BIGINT IDENTITY → SQLite INTEGER PK）
//  - wf_*：字符串主键（UUID 去横线，应用生成 → uid()）
//  - 时间统一 TEXT "yyyy-MM-dd HH:mm:ss"（本地时区，由 nowStr() 生成）
//  - JSON 列一律 TEXT（Java 侧同款教训：H2 JSON setString 标量包装）
//  - SQLite 对未加引号标识符大小写不敏感 → 与 H2 CASE_INSENSITIVE 语义对齐
// ---------------------------------------------------------------------
import { Database } from 'bun:sqlite'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'

const DATA_DIR = path.resolve(import.meta.dir, '../data')
fs.mkdirSync(DATA_DIR, { recursive: true })
export const DB_FILE = path.join(DATA_DIR, 'workflow.db')

export const db = new Database(DB_FILE)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = OFF;')

// --------------------------- 基础 helpers ---------------------------

/** UUID 去横线（对齐 Java wf_* 主键生成） */
export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** 当前时间 "yyyy-MM-dd HH:mm:ss" */
export function nowStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function run(sql: string, ...params: any[]): void {
  db.run(sql, params)
}

export function all<T = any>(sql: string, ...params: any[]): T[] {
  return db.query(sql).all(...params) as T[]
}

export function one<T = any>(sql: string, ...params: any[]): T | null {
  return (db.query(sql).get(...params) as T) ?? null
}

export function count(sql: string, ...params: any[]): number {
  const r = one<{ c: number }>(sql, ...params)
  return r?.c ?? 0
}

// --------------------------- Schema（一次性合并重建） ---------------------------

const SCHEMA = `
-- ========== sys_* 系统 8 表 ==========
CREATE TABLE IF NOT EXISTS sys_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  nickname TEXT,
  password TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar TEXT,
  org_id INTEGER,
  status INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sys_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL,
  role_code TEXT NOT NULL UNIQUE,
  description TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sys_user_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sys_role_menu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  menu_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sys_menu (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  menu_name TEXT NOT NULL,
  menu_type INTEGER NOT NULL,
  path TEXT, component TEXT, permission TEXT, icon TEXT,
  sort_order INTEGER DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sys_organization (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  org_name TEXT NOT NULL,
  org_code TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sys_dict_type (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dict_name TEXT NOT NULL,
  dict_code TEXT NOT NULL UNIQUE,
  remark TEXT,
  status INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sys_dict_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dict_code TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT
);

-- ========== wf_* 工作流业务 10 表 ==========
CREATE TABLE IF NOT EXISTS wf_node_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_def_id TEXT NOT NULL,
  process_definition_id TEXT,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_node_config_def ON wf_node_config(tenant_id, process_def_id);
CREATE INDEX IF NOT EXISTS idx_node_config_ver ON wf_node_config(process_definition_id);

CREATE TABLE IF NOT EXISTS wf_category (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS wf_process_draft (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  process_key TEXT NOT NULL,
  category_id TEXT,
  bpmn_xml TEXT NOT NULL,
  deployed_xml TEXT,
  deployed_config_hash TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  process_definition_id TEXT,
  deploy_id TEXT,
  last_deployed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS wf_form_def (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "key" TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'WORKFLOW',
  column_config TEXT,
  "schema" TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  process_key TEXT,
  published_version INTEGER,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_form_def_tenant_key_version ON wf_form_def(tenant_id, "key", version);
CREATE INDEX IF NOT EXISTS idx_form_def_tenant_status ON wf_form_def(tenant_id, status);

CREATE TABLE IF NOT EXISTS wf_form_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  form_def_id TEXT NOT NULL,
  form_version INTEGER NOT NULL,
  process_instance_id TEXT,
  task_id TEXT,
  data_json TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  is_snapshot INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_form_data_def_proc ON wf_form_data(form_def_id, process_instance_id);
CREATE INDEX IF NOT EXISTS idx_form_data_tenant_proc ON wf_form_data(tenant_id, process_instance_id);

CREATE TABLE IF NOT EXISTS wf_task_comment (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  process_instance_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  comment TEXT,
  action TEXT NOT NULL,
  target_user_id TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_comment_proc ON wf_task_comment(process_instance_id);

CREATE TABLE IF NOT EXISTS wf_task_transfer (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  process_instance_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS wf_task_remind (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  process_instance_id TEXT NOT NULL,
  remind_from TEXT NOT NULL,
  remind_to TEXT NOT NULL,
  remind_time TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS wf_page_def (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "key" TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'VIEW',
  form_key TEXT,
  data_source_id TEXT,
  "schema" TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  published_version INTEGER,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_page_def_tenant_key_version ON wf_page_def(tenant_id, "key", version);
CREATE INDEX IF NOT EXISTS idx_page_def_tenant_status ON wf_page_def(tenant_id, status);

CREATE TABLE IF NOT EXISTS wf_data_source (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "type" TEXT NOT NULL,
  form_key TEXT,
  source_key TEXT,
  form_id TEXT,
  "params" TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_ds_tenant_name ON wf_data_source(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS uk_ds_tenant_source_key ON wf_data_source(tenant_id, source_key);

-- ========== 自研引擎表（替代 Flowable ACT_*） ==========
CREATE TABLE IF NOT EXISTS wf_proc_def (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  "key" TEXT NOT NULL,
  name TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  bpmn_xml TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  deploy_id TEXT,
  deploy_time TEXT,
  draft_id TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_proc_def_key ON wf_proc_def(tenant_id, "key");

CREATE TABLE IF NOT EXISTS wf_proc_inst (
  id TEXT PRIMARY KEY,
  proc_def_id TEXT NOT NULL,
  proc_key TEXT NOT NULL,
  proc_name TEXT,
  business_key TEXT,
  tenant_id TEXT NOT NULL,
  initiator TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  variables TEXT NOT NULL DEFAULT '{}',
  suspended INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL,
  end_time TEXT,
  end_state TEXT,
  delete_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_proc_inst_def ON wf_proc_inst(proc_def_id);
CREATE INDEX IF NOT EXISTS idx_proc_inst_initiator ON wf_proc_inst(initiator);

CREATE TABLE IF NOT EXISTS wf_task (
  id TEXT PRIMARY KEY,
  proc_inst_id TEXT NOT NULL,
  proc_def_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_name TEXT,
  assignee TEXT,
  candidates TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  delegation TEXT,
  mi_index INTEGER,
  mi_total INTEGER,
  mi_mode TEXT,
  form_key TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  end_time TEXT,
  end_action TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_inst ON wf_task(proc_inst_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON wf_task(assignee, status);

CREATE TABLE IF NOT EXISTS wf_activity_hist (
  id TEXT PRIMARY KEY,
  proc_inst_id TEXT NOT NULL,
  proc_def_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_name TEXT,
  assignee TEXT,
  task_id TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  mi_index INTEGER
);
CREATE INDEX IF NOT EXISTS idx_act_hist_inst ON wf_activity_hist(proc_inst_id);

CREATE TABLE IF NOT EXISTS wf_var_hist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proc_inst_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

-- ========== msg_* 通知 8 表 ==========
CREATE TABLE IF NOT EXISTS msg_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  template_code TEXT NOT NULL,
  event_code TEXT,
  sender_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  link_json TEXT,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content_type TEXT,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS msg_recipient (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  nickname TEXT,
  email TEXT,
  phone TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_recipient_user ON msg_recipient(user_id);
CREATE INDEX IF NOT EXISTS idx_recipient_message ON msg_recipient(message_id);
CREATE TABLE IF NOT EXISTS msg_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  template_code TEXT NOT NULL,
  event_code TEXT,
  name TEXT NOT NULL,
  title TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'TEXT',
  channel TEXT,
  priority TEXT,
  category TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS msg_subscription_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  event_code TEXT NOT NULL,
  channel TEXT NOT NULL,
  priority TEXT,
  enable INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL DEFAULT 'ALLOW',
  condition_expr TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS msg_user_subscription (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  channel TEXT NOT NULL,
  subscribed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS msg_delivery_retry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  message_id INTEGER,
  recipient_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retry INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  next_retry_at TEXT,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS msg_event_definition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  event_code TEXT NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT,
  business_domain TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS msg_channel_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value TEXT,
  is_encrypted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
`

// --------------------------- 种子数据 ---------------------------

/** 合并 V2/V7/V12/V15/V20/V21/V26/V29 的菜单（V11 删除 104；V21 改挂 160、软删 120/140） */
const MENU_SEED: Array<[number, number | null, string, number, string | null, string | null, string | null, string | null, number, number, number]> = [
  // V2: id, parentId, name, type, path, component, permission, icon, sort, status, isDeleted
  [1, null, '系统管理', 0, '/system', null, null, 'Setting', 1, 1, 0],
  [2, 1, '用户管理', 1, '/system/user', 'system/user/index', 'system:user:list', 'User', 1, 1, 0],
  [3, 1, '角色管理', 1, '/system/role', 'system/role/index', 'system:role:list', 'UserFilled', 2, 1, 0],
  [4, 1, '菜单管理', 1, '/system/menu', 'system/menu/index', 'system:menu:list', 'Menu', 3, 1, 0],
  [5, 1, '组织机构', 1, '/system/org', 'system/org/index', 'system:org:list', 'Organization', 4, 1, 0],
  [6, 1, '字典管理', 1, '/system/dict', 'system/dict/index', 'system:dict:list', 'List', 5, 1, 0],
  [7, null, '首页', 1, '/dashboard', 'dashboard/index', null, 'HomeFilled', 0, 1, 0],
  [8, 2, '用户查询', 2, null, null, 'system:user:query', null, 1, 1, 0],
  [9, 2, '用户新增', 2, null, null, 'system:user:create', null, 2, 1, 0],
  [10, 2, '用户修改', 2, null, null, 'system:user:update', null, 3, 1, 0],
  [11, 2, '用户删除', 2, null, null, 'system:user:delete', null, 4, 1, 0],
  [12, 3, '角色查询', 2, null, null, 'system:role:query', null, 1, 1, 0],
  [13, 3, '角色新增', 2, null, null, 'system:role:create', null, 2, 1, 0],
  [14, 3, '角色修改', 2, null, null, 'system:role:update', null, 3, 1, 0],
  [15, 3, '角色删除', 2, null, null, 'system:role:delete', null, 4, 1, 0],
  [16, 4, '菜单查询', 2, null, null, 'system:menu:query', null, 1, 1, 0],
  [17, 4, '菜单新增', 2, null, null, 'system:menu:create', null, 2, 1, 0],
  [18, 4, '菜单修改', 2, null, null, 'system:menu:update', null, 3, 1, 0],
  [19, 4, '菜单删除', 2, null, null, 'system:menu:delete', null, 4, 1, 0],
  [20, 5, '机构查询', 2, null, null, 'system:org:query', null, 1, 1, 0],
  [21, 5, '机构新增', 2, null, null, 'system:org:create', null, 2, 1, 0],
  [22, 5, '机构修改', 2, null, null, 'system:org:update', null, 3, 1, 0],
  [23, 5, '机构删除', 2, null, null, 'system:org:delete', null, 4, 1, 0],
  [24, 6, '字典查询', 2, null, null, 'system:dict:query', null, 1, 1, 0],
  [25, 6, '字典新增', 2, null, null, 'system:dict:create', null, 2, 1, 0],
  [26, 6, '字典修改', 2, null, null, 'system:dict:update', null, 3, 1, 0],
  [27, 6, '字典删除', 2, null, null, 'system:dict:delete', null, 4, 1, 0],
  // V7: 流程管理
  [100, null, '流程管理', 0, '/process', null, null, 'Operation', 2, 1, 0],
  [101, 100, '流程定义', 1, '/process/definition', 'process/ProcessListPage', 'process:definition:list', 'Document', 1, 1, 0],
  [102, 100, '流程中心', 1, '/process/center', 'process/ProcessCenterPage', 'process:center:list', 'Files', 2, 1, 0],
  [103, 100, '待办处理', 1, '/process/todo', 'process/ProcessTodoPage', 'process:todo:list', 'BellFilled', 3, 1, 0],
  [110, 101, '流程创建', 2, null, null, 'process:definition:create', null, 1, 1, 0],
  [111, 101, '流程部署', 2, null, null, 'process:definition:deploy', null, 2, 1, 0],
  [112, 101, '流程删除', 2, null, null, 'process:definition:delete', null, 3, 1, 0],
  // V15（挂 104，V11 已删 104，成孤儿行但保留）
  [113, 104, '分类创建', 2, null, null, 'process:category:create', null, 1, 1, 0],
  [114, 104, '分类编辑', 2, null, null, 'process:category:update', null, 2, 1, 0],
  [115, 104, '分类删除', 2, null, null, 'process:category:delete', null, 3, 1, 0],
  // V12: 表单管理（V21 后 120 软删）
  [120, null, '表单管理', 0, '/form', null, null, 'Tickets', 3, 0, 1],
  [121, 160, '表单列表', 1, '/form', 'form/FormListPage', 'form:list', 'Document', 1, 1, 0],
  [130, 121, '表单创建', 2, null, null, 'form:create', null, 1, 1, 0],
  [131, 121, '表单编辑', 2, null, null, 'form:edit', null, 2, 1, 0],
  [132, 121, '表单发布', 2, null, null, 'form:publish', null, 3, 1, 0],
  [133, 121, '表单删除', 2, null, null, 'form:delete', null, 4, 1, 0],
  // V20: 查询界面管理（V21 后 140 软删、141/142 改挂 160）
  [140, null, '查询界面管理', 0, '/page', null, null, 'Grid', 4, 0, 1],
  [141, 160, '页面列表', 1, '/page', 'page/PageListPage', 'page:list', 'Document', 1, 1, 0],
  [142, 160, '数据源管理', 1, '/data-source/list', 'dataSource/DataSourceListPage', 'data-source:list', 'Connection', 2, 1, 0],
  [150, 141, '页面创建', 2, null, null, 'page:create', null, 1, 1, 0],
  [151, 141, '页面编辑', 2, null, null, 'page:edit', null, 2, 1, 0],
  [152, 141, '页面发布', 2, null, null, 'page:publish', null, 3, 1, 0],
  [153, 141, '页面删除', 2, null, null, 'page:delete', null, 4, 1, 0],
  [154, 142, '数据源管理', 2, null, null, 'data-source:manage', null, 1, 1, 0],
  // V21: 表单视图管理
  [160, null, '表单视图管理', 0, '/form', null, null, 'Grid', 3, 1, 0],
  // V26: 消息管理
  [250, null, '消息管理', 0, '/messages', null, null, 'Bell', 5, 1, 0],
  [251, 250, '消息中心', 1, '/messages', 'modules/notification/views/MessageCenter', 'notification:message:list', 'Message', 1, 1, 0],
  [252, 250, '模板管理', 1, '/messages/templates', 'modules/notification/views/admin/TemplateList', 'notification:template:list', 'Document', 2, 1, 0],
  [253, 250, '渠道配置', 1, '/messages/channels', 'modules/notification/views/admin/ChannelConfig', 'notification:channel:list', 'Connection', 3, 1, 0],
  [254, 250, '订阅规则', 1, '/messages/subscriptions', 'modules/notification/views/admin/SubscriptionRules', 'notification:subscription:list', 'SetUp', 4, 1, 0],
  [255, 250, '发送记录', 1, '/messages/deliveries', 'modules/notification/views/admin/DeliveryLog', 'notification:delivery:list', 'Tickets', 5, 1, 0],
  [256, 252, '模板管理', 2, null, null, 'notification:template:manage', null, 1, 1, 0],
  [257, 253, '渠道配置', 2, null, null, 'notification:channel:manage', null, 1, 1, 0],
  [258, 254, '订阅规则', 2, null, null, 'notification:subscription:manage', null, 1, 1, 0],
  [259, 255, '发送记录重发', 2, null, null, 'notification:delivery:retry', null, 1, 1, 0],
  // V29: 公告与事件
  [260, 250, '公告管理', 1, '/messages/announcements', 'modules/notification/views/admin/AnnouncementList', 'notification:announcement:list', 'Notification', 6, 1, 0],
  [261, 250, '事件管理', 1, '/messages/events', 'modules/notification/views/admin/EventDefinitionList', 'notification:event:list', 'Operation', 7, 1, 0],
  [262, 260, '公告管理', 2, null, null, 'notification:announcement:manage', null, 1, 1, 0],
  [263, 261, '事件管理', 2, null, null, 'notification:event:manage', null, 1, 1, 0],
]

export function initSchemaAndSeed(): void {
  db.exec(SCHEMA)

  const hasUser = one<{ c: number }>('SELECT COUNT(*) AS c FROM sys_user')!.c
  if (hasUser > 0) return

  const t = nowStr()
  // 角色（V2）
  run(`INSERT INTO sys_role (role_name, role_code, description, status, is_deleted, created_at, updated_at) VALUES (?,?,?,1,0,?,?)`,
    '超级管理员', 'ROLE_ADMIN', '系统超级管理员', t, t)
  run(`INSERT INTO sys_role (role_name, role_code, description, status, is_deleted, created_at, updated_at) VALUES (?,?,?,1,0,?,?)`,
    '普通用户', 'ROLE_USER', '系统普通用户', t, t)
  // 用户（BCrypt hash 与 Java 侧完全一致；admin/test 同 hash = admin123）
  const hash = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2'
  run(`INSERT INTO sys_user (username, nickname, password, email, status, is_deleted, created_at, updated_at) VALUES (?,?,?,?,1,0,?,?)`,
    'admin', '管理员', hash, 'admin@workflow.com', t, t)
  run(`INSERT INTO sys_user (username, nickname, password, email, status, is_deleted, created_at, updated_at) VALUES (?,?,?,?,1,0,?,?)`,
    'test', '测试用户', hash, 'test@workflow.com', t, t)
  const adminId = one<{ id: number }>('SELECT id FROM sys_user WHERE username=?', 'admin')!.id
  const testId = one<{ id: number }>('SELECT id FROM sys_user WHERE username=?', 'test')!.id
  const adminRoleId = one<{ id: number }>('SELECT id FROM sys_role WHERE role_code=?', 'ROLE_ADMIN')!.id
  const userRoleId = one<{ id: number }>('SELECT id FROM sys_role WHERE role_code=?', 'ROLE_USER')!.id
  run('INSERT INTO sys_user_role (user_id, role_id) VALUES (?,?)', adminId, adminRoleId)
  run('INSERT INTO sys_user_role (user_id, role_id) VALUES (?,?)', testId, userRoleId)
  // 菜单
  for (const m of MENU_SEED) {
    run(
      `INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], t, t,
    )
  }
  // ROLE_ADMIN 授权全部菜单（V3 及后续授权合并语义）
  for (const m of MENU_SEED) {
    run('INSERT INTO sys_role_menu (role_id, menu_id) VALUES (?,?)', adminRoleId, m[0])
  }
  // V32：通知事件定义 + 模板种子
  const evDefs: Array<[string, string, string]> = [
    ['WF_TASK_ASSIGNED', '工作流任务待办', '用户任务分配给办理人时推送待办通知'],
    ['WF_PROCESS_FINISHED', '工作流办结通知', '流程实例全部审批完成时通知发起人'],
    ['WF_TASK_REMINDED', '工作流催办通知', '发起人对待办任务发起催办时通知办理人'],
  ]
  for (const [code, name, desc] of evDefs) {
    run(
      `INSERT INTO msg_event_definition (tenant_id, event_code, event_name, description, business_domain, enabled, created_by, created_at, updated_at)
       VALUES ('default',?,?,?,'WORKFLOW',1,'system',?,?)`,
      code, name, desc, t, t,
    )
  }
  const templates: Array<[string, string, string, string]> = [
    ['TPL_WF_TASK_ASSIGNED', '工作流-任务待办通知', '您有新的待办任务：${taskName}', '流程「${processName}」已流转至节点「${taskName}」，发起人：${initiatorName}，请及时处理。'],
    ['TPL_WF_PROCESS_FINISHED', '工作流-办结通知', '您的流程「${processName}」已办结', '您发起的流程「${processName}」（单号：${businessKey}）已全部审批完成。'],
    ['TPL_WF_TASK_REMINDED', '工作流-催办通知', '催办提醒：${taskName}', '您有待办任务「${taskName}」被发起人催办，请尽快处理。'],
  ]
  for (const [code, name, title, content] of templates) {
    run(
      `INSERT INTO msg_template (tenant_id, template_code, name, title, content, content_type, channel, priority, category, is_system, enabled, created_at)
       VALUES ('default',?,?,?,?, 'TEXT','IN_APP','NORMAL','WORKFLOW',1,1,?)`,
      code, name, title, content, t,
    )
  }
  // SystemDataSourceInitializer：SYSTEM 数据源两条
  const sysDs: Array<[string, string, string]> = [
    ['dept-tree', '部门树', '部门树系统数据源'],
    ['user-tree', '用户树', '用户树系统数据源'],
  ]
  for (const [sk, name, _desc] of sysDs) {
    run(
      `INSERT INTO wf_data_source (id, tenant_id, name, "type", form_key, source_key, form_id, "params", status, created_by, created_at, updated_at)
       VALUES (?, 'system', ?, 'SYSTEM', NULL, ?, NULL, NULL, 'ENABLED', 'system', ?, ?)`,
      uid(), name, sk, t, t,
    )
  }
  console.log('[db] schema + seed 初始化完成')
}

/** 校验 admin BCrypt 可用（启动自检） */
export function selfCheck(): boolean {
  const u = one<{ password: string }>('SELECT password FROM sys_user WHERE username=?', 'admin')
  return !!u && bcrypt.compareSync('admin123', u.password)
}
