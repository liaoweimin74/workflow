/**
 * schema.generated.ts — SQLite schema for the Node.js backend (Task 12-c).
 *
 * 派生来源（三部分，均已与沙箱 H2 实库核对）：
 *  1. SYS_*   ：8 个 JPA 实体（system/domain/entity/*，含 BaseEntity 公共列）。
 *               Hibernate 默认命名策略 snake_case → 大写落库（SQLite 惯例大写，不加引号）。
 *  2. wf_* / MSG_*：Flyway V*.sql 的 CREATE TABLE，并按沙箱 H2 实况补齐 JPA 实体
 *               （ddl-auto=update）在启动期增补的列（如 wf_process_draft."process_key"、
 *               wf_form_data."is_snapshot"、wf_task_comment."target_user_id"、
 *               msg_message."event_code"/"content_type" 等）——实库以实体列为准。
 *               H2 实况核对结论：Hibernate 先于 Flyway 建表，Flyway 的 CREATE TABLE
 *               IF NOT EXISTS 多为 no-op；表列以 @Column 映射为准（V2/V6 等差异见各表注释）。
 *  3. WF_* 引擎 7 表：新引擎迁移设计（Task 12 系列约定），仅 SQLite 新增。
 *
 * 转换规则（Task 12-c 契约）：
 *  - BIGINT/IDENTITY 主键 → INTEGER PRIMARY KEY AUTOINCREMENT（可显式赋值，保留值语义）
 *  - BIGINT → INTEGER；VARCHAR(n)/CLOB/LONGTEXT/TEXT/JSON/ENUM → TEXT（不限长）
 *  - TIMESTAMP/DATETIME → TEXT（统一 "yyyy-MM-dd HH:mm:ss"）；INT → INTEGER
 *  - BOOLEAN/TINYINT(1) → INTEGER (0/1)；DECIMAL/NUMERIC → REAL
 *  - 不建外键约束（SQLite 弱化，与 Java 端靠应用层对齐）；UNIQUE 约束保留
 *  - Flyway 建的小写表（wf_*）保持小写：表名原样，列名在 DDL 中双引号引用
 *    （含 Hibernate 实体里的 `key`/`schema`/`type`/`params` 反引号小写列，
 *    即摘要记录的「WF_FORM_DEF 小写列名需引号」）
 *  - Hibernate 建的表（SYS_ 与 MSG_ 系列）与引擎表（WF_ 引擎 7 表）表名列名一律大写
 *
 * 语义类型见 COLUMN_KINDS（key 与 DDL 同大小写）：long→Jackson 序列化为字符串、
 * datetime 保持文本、bool 为 0/1，供 Node 端序列化对齐 Java API 输出。
 */

// ---------------------------------------------------------------------------
// 1. 平台表（SYS_* 8 张 + wf_* 10 张 + MSG_* 8 张）
// ---------------------------------------------------------------------------

export const SCHEMA_SQL: string[] = [
  // ===================== SYS_*（Hibernate/JPA，大写） =====================

  // SysUser + BaseEntity（id, is_deleted, created_by, created_at, updated_by, updated_at）
  `CREATE TABLE SYS_USER (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    USERNAME TEXT NOT NULL,
    NICKNAME TEXT,
    PASSWORD TEXT NOT NULL,
    EMAIL TEXT,
    PHONE TEXT,
    AVATAR TEXT,
    ORG_ID INTEGER,
    STATUS INTEGER NOT NULL DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT,
    CONSTRAINT UK_SYS_USER_USERNAME UNIQUE (USERNAME)
  )`,

  // SysRole + BaseEntity
  `CREATE TABLE SYS_ROLE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    ROLE_NAME TEXT NOT NULL,
    ROLE_CODE TEXT NOT NULL,
    DESCRIPTION TEXT,
    STATUS INTEGER NOT NULL DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT,
    CONSTRAINT UK_SYS_ROLE_ROLE_CODE UNIQUE (ROLE_CODE)
  )`,

  // SysMenu + BaseEntity（status 数据库级默认 1，种子省略列时可插入，与 H2 对齐）
  `CREATE TABLE SYS_MENU (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PARENT_ID INTEGER,
    MENU_NAME TEXT NOT NULL,
    MENU_TYPE INTEGER NOT NULL,
    PATH TEXT,
    COMPONENT TEXT,
    PERMISSION TEXT,
    ICON TEXT,
    SORT_ORDER INTEGER DEFAULT 0,
    STATUS INTEGER NOT NULL DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT
  )`,

  // SysUserRole（无 BaseEntity，仅三列）
  `CREATE TABLE SYS_USER_ROLE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    USER_ID INTEGER NOT NULL,
    ROLE_ID INTEGER NOT NULL
  )`,

  // SysRoleMenu（无 BaseEntity，仅三列）
  `CREATE TABLE SYS_ROLE_MENU (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    ROLE_ID INTEGER NOT NULL,
    MENU_ID INTEGER NOT NULL
  )`,

  // SysOrganization + BaseEntity
  `CREATE TABLE SYS_ORGANIZATION (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PARENT_ID INTEGER,
    ORG_NAME TEXT NOT NULL,
    ORG_CODE TEXT NOT NULL,
    SORT_ORDER INTEGER DEFAULT 0,
    STATUS INTEGER DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT,
    CONSTRAINT UK_SYS_ORG_ORG_CODE UNIQUE (ORG_CODE)
  )`,

  // SysDictType + BaseEntity
  `CREATE TABLE SYS_DICT_TYPE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    DICT_NAME TEXT NOT NULL,
    DICT_CODE TEXT NOT NULL,
    REMARK TEXT,
    STATUS INTEGER NOT NULL DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT,
    CONSTRAINT UK_SYS_DICT_TYPE_DICT_CODE UNIQUE (DICT_CODE)
  )`,

  // SysDictData + BaseEntity
  `CREATE TABLE SYS_DICT_DATA (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    DICT_CODE TEXT NOT NULL,
    LABEL TEXT NOT NULL,
    VALUE TEXT NOT NULL,
    SORT_ORDER INTEGER DEFAULT 0,
    STATUS INTEGER NOT NULL DEFAULT 1,
    IS_DELETED INTEGER NOT NULL DEFAULT 0,
    CREATED_BY TEXT,
    CREATED_AT TEXT,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT
  )`,

  // ===================== wf_*（Flyway + 实体补列，小写、列名加引号） =====================

  // V4 wf_node_config + NodeConfig 实体的 process_definition_id（Hibernate 补列）。
  //     13-6a：不建 Flyway V4 的 uk_node UNIQUE（tenant_id,process_def_id,node_id）——
  //     实库 H2 由 Hibernate 依实体建表（Flyway CREATE IF NOT EXISTS 为 no-op），
  //     NodeConfig 实体未声明唯一约束；且 Java 部署快照逻辑对同一草稿多版本
  //     各存一份 (tenant,draft,node) 行，若保留约束会阻断第二次部署。
  `CREATE TABLE wf_node_config (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "process_def_id" TEXT NOT NULL,
    "process_definition_id" TEXT,
    "node_id" TEXT NOT NULL,
    "node_type" TEXT NOT NULL,
    "config_json" TEXT NOT NULL,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V5 wf_category
  `CREATE TABLE wf_category (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V6 wf_process_draft + V8 last_deployed_at + V18 deployed_config_hash
  //    + 实体补列 deployed_xml / process_key。
  //    注：实库（H2）由 Hibernate 建表，实体 @Column(name="process_key") 映射 key 字段，
  //    Flyway V6 的 `key` 列在实库中不存在，故此处不建该列。
  `CREATE TABLE wf_process_draft (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "process_key" TEXT NOT NULL,
    "category_id" TEXT,
    "bpmn_xml" TEXT NOT NULL,
    "deployed_xml" TEXT,
    "deployed_config_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "process_definition_id" TEXT,
    "deploy_id" TEXT,
    "last_deployed_at" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V12 wf_form_def + V19 type/column_config + V30 process_key。
  //     "key"/"schema" 为小写列名（实体 @Column(name="\`key\`")/("\`schema\`")），须引号。
  `CREATE TABLE wf_form_def (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'WORKFLOW',
    "column_config" TEXT,
    "schema" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "process_key" TEXT,
    "published_version" INTEGER,
    "created_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_form_def_tenant_key_version UNIQUE ("tenant_id", "key", "version")
  )`,

  // V12 wf_form_data + 实体补列 is_snapshot（Boolean → INTEGER 0/1）
  `CREATE TABLE wf_form_data (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "form_def_id" TEXT NOT NULL,
    "form_version" INTEGER NOT NULL,
    "process_instance_id" TEXT,
    "task_id" TEXT,
    "data_json" TEXT,
    "is_snapshot" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // V13 wf_task_comment + 实体补列 target_user_id
  `CREATE TABLE wf_task_comment (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "process_instance_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment" TEXT,
    "action" TEXT NOT NULL,
    "target_user_id" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V14 wf_task_transfer
  `CREATE TABLE wf_task_transfer (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "process_instance_id" TEXT NOT NULL,
    "from_user" TEXT NOT NULL,
    "to_user" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V16 wf_task_remind
  `CREATE TABLE wf_task_remind (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "process_instance_id" TEXT NOT NULL,
    "remind_from" TEXT NOT NULL,
    "remind_to" TEXT NOT NULL,
    "remind_time" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V20 wf_page_def + V23 data_source_id；"key"/"schema" 小写须引号（type 实体无反引号 → 常规列）
  `CREATE TABLE wf_page_def (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VIEW',
    "form_key" TEXT,
    "data_source_id" TEXT,
    "schema" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "published_version" INTEGER,
    "created_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_page_def_tenant_key_version UNIQUE ("tenant_id", "key", "version")
  )`,

  // V20 wf_data_source + V22 form_id + V31 (tenant_id, source_key) 唯一。
  //     "type"/"params" 为实体反引号小写列，须引号。
  `CREATE TABLE wf_data_source (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "form_key" TEXT,
    "source_key" TEXT,
    "form_id" TEXT,
    "params" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_ds_tenant_name UNIQUE ("tenant_id", "name"),
    CONSTRAINT uk_ds_tenant_source_key UNIQUE ("tenant_id", "source_key")
  )`,

  // ===================== MSG_*（Hibernate/JPA，大写） =====================

  // V24 msg_message + V27 tenant_id 改 VARCHAR + V28 content_type + V29 event_code
  `CREATE TABLE MSG_MESSAGE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    TEMPLATE_CODE TEXT NOT NULL,
    EVENT_CODE TEXT,
    SENDER_ID INTEGER NOT NULL,
    SENDER_TYPE TEXT NOT NULL,
    TITLE TEXT NOT NULL,
    CONTENT TEXT,
    LINK_JSON TEXT,
    PRIORITY TEXT,
    CATEGORY TEXT,
    MESSAGE_TYPE TEXT,
    CONTENT_TYPE TEXT,
    STATUS TEXT,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V24 msg_recipient + V27 tenant_id 改 VARCHAR
  `CREATE TABLE MSG_RECIPIENT (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    MESSAGE_ID INTEGER NOT NULL,
    USER_ID INTEGER NOT NULL,
    USERNAME TEXT NOT NULL,
    NICKNAME TEXT,
    EMAIL TEXT,
    PHONE TEXT,
    CHANNEL TEXT NOT NULL,
    STATUS TEXT NOT NULL,
    SENT_AT TEXT,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V24 msg_template + V27 tenant_id 改 VARCHAR + V28/V32 content_type/enabled/event_code
  `CREATE TABLE MSG_TEMPLATE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    TEMPLATE_CODE TEXT NOT NULL,
    EVENT_CODE TEXT,
    NAME TEXT NOT NULL,
    TITLE TEXT,
    CONTENT TEXT,
    CONTENT_TYPE TEXT,
    CHANNEL TEXT,
    PRIORITY TEXT,
    CATEGORY TEXT,
    IS_SYSTEM INTEGER NOT NULL DEFAULT 0,
    ENABLED INTEGER NOT NULL DEFAULT 1,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_MSG_TPL_TENANT_CODE UNIQUE (TENANT_ID, TEMPLATE_CODE)
  )`,

  // V24 msg_subscription_rule + V27 tenant_id 改 VARCHAR + V29 action
  `CREATE TABLE MSG_SUBSCRIPTION_RULE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    EVENT_CODE TEXT NOT NULL,
    CHANNEL TEXT NOT NULL,
    PRIORITY TEXT,
    ENABLE INTEGER NOT NULL DEFAULT 1,
    ACTION TEXT NOT NULL DEFAULT 'ALLOW',
    CONDITION_EXPR TEXT,
    CREATED_BY TEXT,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V24 msg_user_subscription + V27 tenant_id 改 VARCHAR
  `CREATE TABLE MSG_USER_SUBSCRIPTION (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    USER_ID INTEGER NOT NULL,
    USERNAME TEXT NOT NULL,
    CHANNEL TEXT NOT NULL,
    SUBSCRIBED INTEGER NOT NULL DEFAULT 1,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_MSG_USER_SUB UNIQUE (TENANT_ID, USER_ID, CHANNEL)
  )`,

  // V24 msg_delivery_retry + V25 (status, next_retry_at) 索引 + V27 tenant_id 改 VARCHAR
  //     + 实体补列 message_id
  `CREATE TABLE MSG_DELIVERY_RETRY (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    MESSAGE_ID INTEGER NOT NULL,
    RECIPIENT_ID INTEGER NOT NULL,
    CHANNEL TEXT NOT NULL,
    RETRY_COUNT INTEGER NOT NULL DEFAULT 0,
    MAX_RETRY INTEGER NOT NULL DEFAULT 3,
    LAST_ERROR TEXT,
    NEXT_RETRY_AT TEXT,
    STATUS TEXT NOT NULL,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // V29 msg_event_definition（实体唯一键 tenant_id + event_code）
  `CREATE TABLE MSG_EVENT_DEFINITION (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TENANT_ID TEXT NOT NULL,
    EVENT_CODE TEXT NOT NULL,
    EVENT_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    BUSINESS_DOMAIN TEXT,
    ENABLED INTEGER NOT NULL DEFAULT 1,
    CREATED_BY TEXT NOT NULL,
    CREATED_AT TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UPDATED_BY TEXT,
    UPDATED_AT TEXT,
    CONSTRAINT UK_MSG_EVENT_TENANT_CODE UNIQUE (TENANT_ID, EVENT_CODE)
  )`,

  // msg_channel_config：无 Flyway DDL，Hibernate（ChannelConfig 实体）独立建表，
  // 与沙箱 H2 实库一致（ID/CHANNEL/CONFIG_KEY/CONFIG_VALUE/IS_ENCRYPTED/CREATED_AT/UPDATED_AT）
  `CREATE TABLE MSG_CHANNEL_CONFIG (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    CHANNEL TEXT NOT NULL,
    CONFIG_KEY TEXT NOT NULL,
    CONFIG_VALUE TEXT,
    IS_ENCRYPTED INTEGER NOT NULL DEFAULT 0,
    CREATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    UPDATED_AT TEXT DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT UK_MSG_CHANNEL_CONFIG UNIQUE (CHANNEL, CONFIG_KEY)
  )`,
];

// ---------------------------------------------------------------------------
// 2. 新引擎 7 表（Task 12 迁移设计，大写，无外键）
// ---------------------------------------------------------------------------

export const ENGINE_TABLES_SQL: string[] = [
  `CREATE TABLE WF_PROC_INST (
    ID TEXT PRIMARY KEY,
    PROC_DEF_ID TEXT,
    BUSINESS_KEY TEXT,
    START_USER_ID TEXT,
    START_TIME TEXT,
    END_TIME TEXT,
    DURATION_MS INTEGER,
    STATUS TEXT,
    TENANT_ID TEXT
  )`,

  `CREATE TABLE WF_TASK_INST (
    ID TEXT PRIMARY KEY,
    PROC_INST_ID TEXT,
    PROC_DEF_ID TEXT,
    TASK_DEF_KEY TEXT,
    NAME TEXT,
    ASSIGNEE TEXT,
    OWNER TEXT,
    PRIORITY INTEGER,
    CREATE_TIME TEXT,
    CLAIM_TIME TEXT,
    END_TIME TEXT,
    DURATION_MS INTEGER,
    STATUS TEXT,
    TENANT_ID TEXT,
    FORM_KEY TEXT
  )`,

  `CREATE TABLE WF_ACTIVITY_INST (
    ID TEXT PRIMARY KEY,
    PROC_INST_ID TEXT,
    PROC_DEF_ID TEXT,
    ACT_ID TEXT,
    ACT_NAME TEXT,
    ACT_TYPE TEXT,
    ASSIGNTEE TEXT,
    START_TIME TEXT,
    END_TIME TEXT,
    DURATION_MS INTEGER,
    STATUS TEXT,
    TENANT_ID TEXT
  )`,

  `CREATE TABLE WF_EXEC_TOKEN (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PROC_INST_ID TEXT,
    CURRENT_NODE TEXT,
    PARENT_TOKEN_ID TEXT,
    STATUS TEXT,
    SUSPENSION_STATE INTEGER
  )`,

  `CREATE TABLE WF_PROC_DEPLOY (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    NAME TEXT,
    KEY_ TEXT,
    CATEGORY TEXT,
    VERSION INTEGER,
    DEPLOY_TIME TEXT,
    RESOURCE_NAME TEXT,
    DIAGRAM_RESOURCE_NAME TEXT,
    TENANT_ID TEXT,
    CONFIG_JSON TEXT,
    -- 13-6a 补列（对齐 Flowable ACT_RE_PROCDEF.SUSPENSION_STATE_ 1=active 2=suspended）：
    SUSPENSION_STATE INTEGER NOT NULL DEFAULT 1,
    -- 13-6a 补列（对齐 Flowable ACT_GE_BYTEARRAY 资源语义）：部署生效 BPMN XML 原文，
    -- 供 /deployed-processes/{id}/xml 与历史版本 editor 按版本精确读取。
    BPMN_XML TEXT
  )`,

  `CREATE TABLE WF_TASK_CANDIDATE (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    TASK_ID TEXT,
    TYPE TEXT,
    CANDIDATE_ID TEXT
  )`,

  `CREATE TABLE WF_ENGINE_SEQ (
    NAME TEXT PRIMARY KEY,
    NEXT_VAL INTEGER
  )`,
];

// ---------------------------------------------------------------------------
// 3. 列语义类型（Jackson 序列化对齐用：long→字符串、datetime 保持文本、bool 为 0/1）
//    key 与上方 DDL 的表名同大小写。
// ---------------------------------------------------------------------------

export type ColumnKind = 'long' | 'int' | 'datetime' | 'text' | 'bool';

export const COLUMN_KINDS: Record<string, Record<string, ColumnKind>> = {
  // ----- SYS_* -----
  SYS_USER: {
    ID: 'long', USERNAME: 'text', NICKNAME: 'text', PASSWORD: 'text',
    EMAIL: 'text', PHONE: 'text', AVATAR: 'text', ORG_ID: 'long',
    STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  SYS_ROLE: {
    ID: 'long', ROLE_NAME: 'text', ROLE_CODE: 'text', DESCRIPTION: 'text',
    STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  SYS_MENU: {
    ID: 'long', PARENT_ID: 'long', MENU_NAME: 'text', MENU_TYPE: 'int',
    PATH: 'text', COMPONENT: 'text', PERMISSION: 'text', ICON: 'text', SORT_ORDER: 'int',
    STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  SYS_USER_ROLE: { ID: 'long', USER_ID: 'long', ROLE_ID: 'long' },
  SYS_ROLE_MENU: { ID: 'long', ROLE_ID: 'long', MENU_ID: 'long' },
  SYS_ORGANIZATION: {
    ID: 'long', PARENT_ID: 'long', ORG_NAME: 'text', ORG_CODE: 'text',
    SORT_ORDER: 'int', STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  SYS_DICT_TYPE: {
    ID: 'long', DICT_NAME: 'text', DICT_CODE: 'text', REMARK: 'text',
    STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  SYS_DICT_DATA: {
    ID: 'long', DICT_CODE: 'text', LABEL: 'text', VALUE: 'text', SORT_ORDER: 'int',
    STATUS: 'int', IS_DELETED: 'int',
    CREATED_BY: 'text', CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },

  // ----- wf_* -----
  wf_node_config: {
    id: 'text', tenant_id: 'text', process_def_id: 'text', process_definition_id: 'text',
    node_id: 'text', node_type: 'text', config_json: 'text',
    created_at: 'datetime', updated_at: 'datetime',
  },
  wf_category: {
    id: 'text', tenant_id: 'text', name: 'text', parent_id: 'text',
    sort_order: 'int', created_at: 'datetime',
  },
  wf_process_draft: {
    id: 'text', tenant_id: 'text', name: 'text', process_key: 'text', category_id: 'text',
    bpmn_xml: 'text', deployed_xml: 'text', deployed_config_hash: 'text', status: 'text',
    process_definition_id: 'text', deploy_id: 'text', last_deployed_at: 'datetime',
    version: 'int', created_by: 'text', created_at: 'datetime', updated_at: 'datetime',
  },
  wf_form_def: {
    id: 'text', tenant_id: 'text', name: 'text', key: 'text', type: 'text',
    column_config: 'text', schema: 'text', version: 'int', status: 'text',
    process_key: 'text', published_version: 'int', created_by: 'text',
    created_at: 'datetime', updated_at: 'datetime',
  },
  wf_form_data: {
    id: 'text', tenant_id: 'text', form_def_id: 'text', form_version: 'int',
    process_instance_id: 'text', task_id: 'text', data_json: 'text', is_snapshot: 'bool',
    created_by: 'text', created_at: 'datetime', updated_at: 'datetime',
  },
  wf_task_comment: {
    id: 'text', tenant_id: 'text', task_id: 'text', process_instance_id: 'text',
    user_id: 'text', comment: 'text', action: 'text', target_user_id: 'text',
    created_at: 'datetime',
  },
  wf_task_transfer: {
    id: 'text', tenant_id: 'text', task_id: 'text', process_instance_id: 'text',
    from_user: 'text', to_user: 'text', reason: 'text', created_at: 'datetime',
  },
  wf_task_remind: {
    id: 'text', tenant_id: 'text', task_id: 'text', process_instance_id: 'text',
    remind_from: 'text', remind_to: 'text', remind_time: 'datetime',
  },
  wf_page_def: {
    id: 'text', tenant_id: 'text', name: 'text', key: 'text', type: 'text',
    form_key: 'text', data_source_id: 'text', schema: 'text', version: 'int', status: 'text',
    published_version: 'int', created_by: 'text', created_at: 'datetime', updated_at: 'datetime',
  },
  wf_data_source: {
    id: 'text', tenant_id: 'text', name: 'text', type: 'text', form_key: 'text',
    source_key: 'text', form_id: 'text', params: 'text', status: 'text',
    created_by: 'text', created_at: 'datetime', updated_at: 'datetime',
  },

  // ----- MSG_* -----
  MSG_MESSAGE: {
    ID: 'long', TENANT_ID: 'text', TEMPLATE_CODE: 'text', EVENT_CODE: 'text',
    SENDER_ID: 'long', SENDER_TYPE: 'text', TITLE: 'text', CONTENT: 'text', LINK_JSON: 'text',
    PRIORITY: 'text', CATEGORY: 'text', MESSAGE_TYPE: 'text', CONTENT_TYPE: 'text',
    STATUS: 'text', CREATED_AT: 'datetime',
  },
  MSG_RECIPIENT: {
    ID: 'long', TENANT_ID: 'text', MESSAGE_ID: 'long', USER_ID: 'long',
    USERNAME: 'text', NICKNAME: 'text', EMAIL: 'text', PHONE: 'text',
    CHANNEL: 'text', STATUS: 'text', SENT_AT: 'datetime', CREATED_AT: 'datetime',
  },
  MSG_TEMPLATE: {
    ID: 'long', TENANT_ID: 'text', TEMPLATE_CODE: 'text', EVENT_CODE: 'text',
    NAME: 'text', TITLE: 'text', CONTENT: 'text', CONTENT_TYPE: 'text', CHANNEL: 'text',
    PRIORITY: 'text', CATEGORY: 'text', IS_SYSTEM: 'bool', ENABLED: 'bool',
    CREATED_AT: 'datetime',
  },
  MSG_SUBSCRIPTION_RULE: {
    ID: 'long', TENANT_ID: 'text', EVENT_CODE: 'text', CHANNEL: 'text', PRIORITY: 'text',
    ENABLE: 'bool', ACTION: 'text', CONDITION_EXPR: 'text',
    CREATED_BY: 'text', CREATED_AT: 'datetime',
  },
  MSG_USER_SUBSCRIPTION: {
    ID: 'long', TENANT_ID: 'text', USER_ID: 'long', USERNAME: 'text', CHANNEL: 'text',
    SUBSCRIBED: 'bool', CREATED_AT: 'datetime', UPDATED_AT: 'datetime',
  },
  MSG_DELIVERY_RETRY: {
    ID: 'long', TENANT_ID: 'text', MESSAGE_ID: 'long', RECIPIENT_ID: 'long', CHANNEL: 'text',
    RETRY_COUNT: 'int', MAX_RETRY: 'int', LAST_ERROR: 'text', NEXT_RETRY_AT: 'datetime',
    STATUS: 'text', CREATED_AT: 'datetime', UPDATED_AT: 'datetime',
  },
  MSG_EVENT_DEFINITION: {
    ID: 'long', TENANT_ID: 'text', EVENT_CODE: 'text', EVENT_NAME: 'text', DESCRIPTION: 'text',
    BUSINESS_DOMAIN: 'text', ENABLED: 'bool', CREATED_BY: 'text',
    CREATED_AT: 'datetime', UPDATED_BY: 'text', UPDATED_AT: 'datetime',
  },
  MSG_CHANNEL_CONFIG: {
    ID: 'long', CHANNEL: 'text', CONFIG_KEY: 'text', CONFIG_VALUE: 'text',
    IS_ENCRYPTED: 'bool', CREATED_AT: 'datetime', UPDATED_AT: 'datetime',
  },

  // ----- 引擎表 -----
  WF_PROC_INST: {
    ID: 'long', PROC_DEF_ID: 'text', BUSINESS_KEY: 'text', START_USER_ID: 'text',
    START_TIME: 'datetime', END_TIME: 'datetime', DURATION_MS: 'long',
    STATUS: 'text', TENANT_ID: 'text',
  },
  WF_TASK_INST: {
    ID: 'long', PROC_INST_ID: 'text', PROC_DEF_ID: 'text', TASK_DEF_KEY: 'text',
    NAME: 'text', ASSIGNEE: 'text', OWNER: 'text', PRIORITY: 'int',
    CREATE_TIME: 'datetime', CLAIM_TIME: 'datetime', END_TIME: 'datetime',
    DURATION_MS: 'long', STATUS: 'text', TENANT_ID: 'text', FORM_KEY: 'text',
  },
  WF_ACTIVITY_INST: {
    ID: 'long', PROC_INST_ID: 'text', PROC_DEF_ID: 'text', ACT_ID: 'text', ACT_NAME: 'text',
    ACT_TYPE: 'text', ASSIGNTEE: 'text', START_TIME: 'datetime', END_TIME: 'datetime',
    DURATION_MS: 'long', STATUS: 'text', TENANT_ID: 'text',
  },
  WF_EXEC_TOKEN: {
    ID: 'long', PROC_INST_ID: 'text', CURRENT_NODE: 'text', PARENT_TOKEN_ID: 'text',
    STATUS: 'text', SUSPENSION_STATE: 'int',
  },
  WF_PROC_DEPLOY: {
    ID: 'long', NAME: 'text', KEY_: 'text', CATEGORY: 'text', VERSION: 'int',
    DEPLOY_TIME: 'datetime', RESOURCE_NAME: 'text', DIAGRAM_RESOURCE_NAME: 'text',
    TENANT_ID: 'text', CONFIG_JSON: 'text',
    SUSPENSION_STATE: 'int', BPMN_XML: 'text',
  },
  WF_TASK_CANDIDATE: { ID: 'long', TASK_ID: 'text', TYPE: 'text', CANDIDATE_ID: 'text' },
  WF_ENGINE_SEQ: { NAME: 'text', NEXT_VAL: 'int' },
};
