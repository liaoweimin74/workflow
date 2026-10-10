/**
 * 自研工作流引擎表（Task 13-6）：替代 Flowable 内部表。
 * 设计依据：docs/migration/engine-semantics.md（E 章）+ 现有查询契约。
 * 历史数据自 Flowable 历史/运行时表转换导入（见 db/import-h2.ts），保留原 Flowable ID 以维持
 * WF_TASK_COMMENT 等既有业务表的关联不断裂。
 */

export const ENGINE_TABLE_DDL: string[] = [
  // 流程实例（对应 ACT_HI_PROCINST + ACT_RU_EXECUTION 聚合）
  `CREATE TABLE IF NOT EXISTS "WF_PROC_INST" (
    "ID" TEXT PRIMARY KEY,
    "PROC_KEY" TEXT NOT NULL,
    "PROC_NAME" TEXT,
    "PROC_VERSION" INTEGER,
    "DRAFT_ID" TEXT,
    "DEPLOY_ID" TEXT,
    "BUSINESS_KEY" TEXT,
    "TITLE" TEXT,
    "START_USER" TEXT,
    "START_TIME" TEXT,
    "END_TIME" TEXT,
    "STATUS" TEXT NOT NULL,
    "DELETE_REASON" TEXT,
    "TENANT_ID" TEXT,
    "VARIABLES_JSON" TEXT,
    "CURRENT_NODE_KEYS" TEXT,
    "FORM_DATA_ID" TEXT,
    -- callActivity 子流程链接（Task 16：子实例 → 父实例 + 父图中调用活动节点）
    "PARENT_ID" TEXT,
    "PARENT_NODE_KEY" TEXT
  )`,
  // 任务实例（对应 ACT_HI_TASKINST + ACT_RU_TASK）
  `CREATE TABLE IF NOT EXISTS "WF_TASK_INST" (
    "ID" TEXT PRIMARY KEY,
    "PROC_INST_ID" TEXT NOT NULL,
    "PROC_KEY" TEXT,
    "NODE_KEY" TEXT NOT NULL,
    "NODE_NAME" TEXT,
    "ASSIGNEE" TEXT,
    "OWNER" TEXT,
    "CANDIDATES_JSON" TEXT,
    "STATUS" TEXT NOT NULL,
    "PRIORITY" INTEGER,
    "CLAIM_TIME" TEXT,
    "START_TIME" TEXT,
    "END_TIME" TEXT,
    "COMPLETED_BY" TEXT,
    "DELETE_REASON" TEXT,
    "DELEGATION" TEXT,
    "FORM_DEF_ID" TEXT,
    "MI_GROUP_ID" TEXT,
    "MI_INDEX" INTEGER,
    "MI_TOTAL" INTEGER,
    "TENANT_ID" TEXT
  )`,
  // 节点活动轨迹（对应 ACT_HI_ACTINST）：审批记录/流程图高亮
  `CREATE TABLE IF NOT EXISTS "WF_ACTIVITY_INST" (
    "ID" TEXT PRIMARY KEY,
    "PROC_INST_ID" TEXT NOT NULL,
    "NODE_KEY" TEXT NOT NULL,
    "NODE_NAME" TEXT,
    "NODE_TYPE" TEXT,
    "STATUS" TEXT,
    "START_TIME" TEXT,
    "END_TIME" TEXT,
    "ASSIGNEE" TEXT,
    "ACTION" TEXT,
    "COMMENT" TEXT,
    "MI_GROUP_ID" TEXT,
    "TENANT_ID" TEXT
  )`,
  // 运行时令牌：网关分支/多实例计数/驳回移动的执行位置
  // SCOPE：嵌套 subProcess 作用域链（Task 17，"/"分隔祖先 subProcess 节点 id；NULL=顶层）
  `CREATE TABLE IF NOT EXISTS "WF_EXEC_TOKEN" (
    "ID" TEXT PRIMARY KEY,
    "PROC_INST_ID" TEXT NOT NULL,
    "NODE_KEY" TEXT NOT NULL,
    "STATUS" TEXT NOT NULL,
    "MI_GROUP_ID" TEXT,
    "MI_INDEX" INTEGER,
    "CREATED_AT" TEXT,
    "SCOPE" TEXT
  )`,
  // 流程定义部署快照（对应 ACT_RE_PROCDEF/ACT_RE_DEPLOYMENT + 设计器配置冻结）
  `CREATE TABLE IF NOT EXISTS "WF_PROC_DEPLOY" (
    "ID" TEXT PRIMARY KEY,
    "DRAFT_ID" TEXT NOT NULL,
    "PROC_KEY" TEXT NOT NULL,
    "PROC_NAME" TEXT,
    "VERSION" INTEGER NOT NULL,
    "DIAGRAM_JSON" TEXT,
    "NODE_CONFIGS_JSON" TEXT,
    "PROCESS_CONFIG_JSON" TEXT,
    "DEPLOYED_AT" TEXT,
    "DEPLOYED_BY" TEXT,
    "TENANT_ID" TEXT
  )`,
  // 候选人关联（对应 ACT_RU_IDENTITYLINK candidate 场景，查询我的待办用）
  `CREATE TABLE IF NOT EXISTS "WF_TASK_CANDIDATE" (
    "ID" TEXT PRIMARY KEY,
    "TASK_ID" TEXT NOT NULL,
    "PROC_INST_ID" TEXT,
    "USER_ID" TEXT,
    "CREATED_AT" TEXT
  )`,
  // 引擎内部序列（版本号等）
  `CREATE TABLE IF NOT EXISTS "WF_ENGINE_SEQ" (
    "SEQ_KEY" TEXT PRIMARY KEY,
    "SEQ_VALUE" INTEGER NOT NULL
  )`,
];

/**
 * 引擎表增量列迁移已统一收纳在 lib/db.ts 的 COLUMN_MIGRATIONS（含镜像表），
 * 此处不再单独维护，避免双源漂移。
 */

export const ENGINE_COLUMN_KINDS: Record<string, Record<string, string>> = {
  WF_PROC_INST: {
    ID: "text", PROC_KEY: "text", PROC_NAME: "text", PROC_VERSION: "int", DRAFT_ID: "text",
    DEPLOY_ID: "text", BUSINESS_KEY: "text", TITLE: "text", START_USER: "text", START_TIME: "ts",
    END_TIME: "ts", STATUS: "text", DELETE_REASON: "text", TENANT_ID: "text", VARIABLES_JSON: "json",
    CURRENT_NODE_KEYS: "json", FORM_DATA_ID: "text", PARENT_ID: "text", PARENT_NODE_KEY: "text",
  },
  WF_TASK_INST: {
    ID: "text", PROC_INST_ID: "text", PROC_KEY: "text", NODE_KEY: "text", NODE_NAME: "text",
    ASSIGNEE: "text", OWNER: "text", CANDIDATES_JSON: "json", STATUS: "text", PRIORITY: "int",
    CLAIM_TIME: "ts", START_TIME: "ts", END_TIME: "ts", COMPLETED_BY: "text", DELETE_REASON: "text",
    DELEGATION: "text", FORM_DEF_ID: "text", MI_GROUP_ID: "text", MI_INDEX: "int", MI_TOTAL: "int",
    TENANT_ID: "text",
  },
  WF_ACTIVITY_INST: {
    ID: "text", PROC_INST_ID: "text", NODE_KEY: "text", NODE_NAME: "text", NODE_TYPE: "text",
    STATUS: "text", START_TIME: "ts", END_TIME: "ts", ASSIGNEE: "text", ACTION: "text",
    COMMENT: "text", MI_GROUP_ID: "text", TENANT_ID: "text",
  },
  WF_EXEC_TOKEN: {
    ID: "text", PROC_INST_ID: "text", NODE_KEY: "text", STATUS: "text", MI_GROUP_ID: "text",
    MI_INDEX: "int", CREATED_AT: "ts", SCOPE: "text",
  },
  WF_PROC_DEPLOY: {
    ID: "text", DRAFT_ID: "text", PROC_KEY: "text", PROC_NAME: "text", VERSION: "int",
    DIAGRAM_JSON: "json", NODE_CONFIGS_JSON: "json", PROCESS_CONFIG_JSON: "json",
    DEPLOYED_AT: "ts", DEPLOYED_BY: "text", TENANT_ID: "text",
  },
  WF_TASK_CANDIDATE: {
    ID: "text", TASK_ID: "text", PROC_INST_ID: "text", USER_ID: "text", CREATED_AT: "ts",
  },
  WF_ENGINE_SEQ: { SEQ_KEY: "text", SEQ_VALUE: "int" },
};
