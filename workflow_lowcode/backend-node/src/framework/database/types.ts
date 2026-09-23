import type { Generated } from 'kysely'

/**
 * 时间戳列类型。
 *
 * 刻意用朴素的 `Date` / `Date | null` 而不是 `ColumnType<...>`：
 * 本项目所有时间写入都传 `Date`、读出也都是 `Date`（mysql2 已做转换），
 * 不需要区分 select/insert/update 三种形态。用 ColumnType 反而会导致
 * 「不能用普通对象字面量构造行」这类摩擦，收益为零。
 */
type NullableTimestamp = Date | null
type Timestamp = Date
export interface WfeProcessDefTable {
  id: string
  tenant_id: string
  process_key: string
  version: number
  name: string | null
  category_id: string | null
  bpmn_xml: string
  model_json: string
  /** BPMN 的 targetNamespace —— Flowable 把它当作 ProcessDefinition.category。 */
  target_namespace: string | null
  deployed_config_hash: string | null
  status: string
  draft_id: string | null
  deployed_at: Timestamp
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeProcessInstanceTable {
  id: string
  tenant_id: string
  process_def_id: string
  process_key: string
  process_name: string | null
  business_key: string | null
  /**
   * 实例状态：`RUNNING` / `SUSPENDED` / `COMPLETED` / `TERMINATED`。
   *
   * ⚠️ 挂起在这里是一个**状态值**，而 Flowable 把它建模成与「已结束」正交的标志位。
   *    两者在契约上可观测的结果相同（`suspended` 字段、`status` 文案、`ended`），
   *    前提是**所有「运行中」查询必须把 SUSPENDED 算进去** ——
   *    目前只有 `listRunningInstances` 一处，它已经写成 `status IN ('RUNNING','SUSPENDED')`。
   *    将来新增任何「运行中实例」查询时，别忘了这一条，否则挂起的实例会凭空消失。
   */
  status: string
  initiator: string | null
  /**
   * 乐观锁版本（并发控制，对齐 Flowable 的 REV_）。
   *
   * 每次整份运行时行重写（eplaceRuntimeRows）都在同一事务里 +1；落库前用
   * WHERE id = ? AND lock_version = <loadState 读到的值> 做 compare-and-swap，
   * 影响行数 0 ⇒ 期间被别的请求改过 ⇒ 抛并发冲突。
   * ⚠️ 不要手动读写它（除 CAS 语句本身），也不要把它暴露到响应里。
   */
  lock_version: number
  parent_instance_id: string | null
  parent_node_id: string | null
  start_time: Timestamp
  end_time: NullableTimestamp
  delete_reason: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeExecutionTable {
  id: string
  instance_id: string
  parent_id: string | null
  node_id: string
  container_id: string | null
  scope_id: string | null
  status: string
  is_active: number
  is_concurrent: number
  is_scope: number
  mi_root_id: string | null
  mi_index: number | null
  called_instance_id: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeActivityTable {
  id: string
  instance_id: string
  execution_id: string | null
  node_id: string
  node_type: string
  node_name: string | null
  status: string
  start_time: Timestamp
  end_time: NullableTimestamp
  duration_ms: number | null
  mi_root_id: string | null
  mi_index: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeTaskTable {
  id: string
  tenant_id: string
  instance_id: string
  execution_id: string | null
  node_id: string
  activity_instance_id: string | null
  name: string | null
  assignee: string | null
  status: string
  create_time: Timestamp
  claim_time: NullableTimestamp
  end_time: NullableTimestamp
  due_date: NullableTimestamp
  mi_index: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeTaskCandidateTable {
  id: string
  task_id: string
  user_id: string
  created_at: Timestamp
}

/**
 * 任务委派状态（`wfe_task_delegation`，V36）。
 *
 * 侧表而不是任务行上的两列 —— 理由写在迁移文件的注释里（任务行是"整实例删表重建"，
 * 不在引擎内存态里的列会被覆盖）。
 */
export interface WfeTaskDelegationTable {
  task_id: string
  instance_id: string
  tenant_id: string
  /** 原办理人；resolve 时还回 assignee。 */
  owner: string | null
  /** `PENDING`（已委派）/ `RESOLVED`（已交还）。 */
  delegation_state: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface WfeVariableTable {
  id: string
  instance_id: string
  execution_id: string | null
  scope_id: string | null
  name: string
  type: string
  value_json: string | null
  create_time: Timestamp
  update_time: Timestamp
}

/** 系统管理表（由 V1 基线创建，原本是 JPA ddl-auto 建的）。 */
export interface SysUserTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  username: string
  nickname: string | null
  password: string
  email: string | null
  phone: string | null
  avatar: string | null
  org_id: number | null
  status: number
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

export interface SysRoleTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  role_code: string
  role_name: string
  description: string | null
  status: number
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

export interface SysMenuTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  parent_id: number | null
  menu_name: string
  menu_type: number
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sort_order: number | null
  status: number
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

export interface SysUserRoleTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  user_id: number
  role_id: number
}

export interface SysRoleMenuTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  role_id: number
  menu_id: number
}

export interface SysOrganizationTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  org_code: string
  org_name: string
  parent_id: number | null
  sort_order: number | null
  status: number | null
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

/** 流程定义草稿（V6 迁移创建；deployed_config_hash 由 V18 补）。 */
export interface WfProcessDraftTable {
  id: string
  process_key: string
  name: string
  category_id: string | null
  bpmn_xml: string
  status: string
  version: number
  tenant_id: string
  deploy_id: string | null
  process_definition_id: string | null
  deployed_config_hash: string | null
  deployed_xml: string | null
  last_deployed_at: NullableTimestamp
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
}

/** 字典类型（V1 基线创建）。 */
export interface SysDictTypeTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  dict_code: string
  dict_name: string
  remark: string | null
  status: number
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

/** 字典数据（V1 基线创建）。 */
export interface SysDictDataTable {
  /** 自增主键：写入时省略，由数据库生成。 */
  id: Generated<number>
  dict_code: string
  label: string
  value: string
  sort_order: number | null
  status: number
  is_deleted: number
  created_at: NullableTimestamp
  created_by: string | null
  updated_at: NullableTimestamp
  updated_by: string | null
}

/** 催办记录（V16 迁移创建）。 */
export interface WfTaskRemindTable {
  id: string
  tenant_id: string
  task_id: string
  process_instance_id: string
  remind_from: string
  remind_to: string
  remind_time: NullableTimestamp
}

/** 审批意见（V13 迁移创建）。process_instance_id + task_id 关联到引擎表。 */
export interface WfTaskCommentTable {
  id: string
  tenant_id: string
  task_id: string
  process_instance_id: string
  user_id: string
  /** submit / approve / reject / add_sign / forward_sign / transfer … */
  action: string
  comment: string | null
  target_user_id: string | null
  created_at: NullableTimestamp
}

/**
 * 任务转办审计（V14 迁移创建）。
 *
 * ⚠️ 只写不读 —— 没有任何端点回显这张表，转办的效果体现在
 *    `wfe_task.assignee` 与 `wf_task_comment(action='transfer')` 上。
 *    所以它不会造成契约可见的残留。
 *
 * ⚠️ `from_user` 是 NOT NULL，Java 写入的是 **改 assignee 之前** 的 `task.getAssignee()`；
 *    任务没有办理人时会插 NULL ⇒ 数据库拒绝 ⇒ HTTP 500（照抄这个行为）。
 */
export interface WfTaskTransferTable {
  id: string
  tenant_id: string
  task_id: string
  process_instance_id: string
  from_user: string
  to_user: string
  reason: string | null
  created_at: NullableTimestamp
}

/** 流程节点配置（V4 迁移创建）。process_definition_id 非空表示该部署版本的快照。 */
export interface WfNodeConfigTable {
  id: string
  process_def_id: string
  process_definition_id: string | null
  node_id: string
  node_type: string
  /**
   * ⚠️ 列类型是 MySQL `json`，mysql2 会把它**自动解析成对象**，
   *    而 Java 侧响应里 `nodeConfigs` 的值是 JSON **字符串**。
   *    读取后必须用 `toConfigJsonString()` 归一化回字符串，否则契约类型不符。
   */
  config_json: string
  tenant_id: string
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}


/**
 * MySQL `BIT(1)` 列的返回形态。
 *
 * ⚠️ mysql2 **不会**把 BIT 解析成 JS boolean，而是返回 `Buffer`（长度 1）；
 *    Java 侧 JPA 把 `bit(1)` 映射为 `Boolean`，序列化成 `true`/`false`。
 *    读取后必须经 `bitToBool()` 归一化，否则契约里会出现 `{"type":"Buffer","data":[1]}`
 *    这种前端无法消费的值。这里显式声明成联合类型，逼调用方处理。
 */
type BitFlag = Buffer | number

/** `BIT(1)` → boolean。对齐 Java 侧 `Boolean` 字段的取值。 */
export function bitToBool(value: BitFlag | boolean | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return value.length > 0 && value[0] !== 0
}

/** 全局数据源定义（`wf_data_source`）。状态机：DRAFT → ENABLED ⇄ DISABLED。 */
export interface WfDataSourceTable {
  id: string
  tenant_id: string
  name: string
  /** FORM（业务表单）/ SYSTEM（系统结构）/ API（外部接口）/ WORKFLOW。 */
  type: string
  form_key: string | null
  source_key: string | null
  form_id: string | null
  params: string | null
  status: string
  created_by: string | null
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}

/** 页面定义（`wf_page_def`）。type：VIEW（视图）/ PAGE（自定义页面）。 */
export interface WfPageDefTable {
  id: string
  tenant_id: string
  name: string
  key: string
  type: string
  form_key: string | null
  data_source_id: string | null
  schema: string | null
  version: number
  status: string
  published_version: number | null
  created_by: string | null
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}

/** 表单定义（`wf_form_def`）。type：FORM（独立表单）/ WORKFLOW（流程表单）。 */
export interface WfFormDefTable {
  id: string
  tenant_id: string
  name: string
  key: string
  type: string
  schema: string | null
  /** MySQL `json` 列，已由 DatabaseModule 的 typeCast 保持原文本（见 wf_node_config 的同类说明）。 */
  column_config: string | null
  version: number
  status: string
  published_version: number | null
  process_key: string | null
  created_by: string | null
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}

/** 消息模板（`msg_template`）。 */
export interface MsgTemplateTable {
  id: Generated<number>
  tenant_id: string
  template_code: string
  event_code: string | null
  name: string
  title: string | null
  content: string | null
  content_type: string | null
  channel: string | null
  priority: string | null
  category: string | null
  is_system: BitFlag
  enabled: BitFlag
  created_at: NullableTimestamp
}

/**
 * 渠道运行时配置（`msg_channel_config`）。
 * `__enabled` 是保留键，存管理员对渠道的启停开关（`is_encrypted = 0`）。
 */
export interface MsgChannelConfigTable {
  id: Generated<number>
  channel: string
  config_key: string
  config_value: string | null
  is_encrypted: BitFlag
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}

/** 投递重试记录（`msg_delivery_retry`）。 */
export interface MsgDeliveryRetryTable {
  id: Generated<number>
  tenant_id: string
  message_id: number
  recipient_id: number
  channel: string
  status: string
  retry_count: number
  max_retry: number
  next_retry_at: NullableTimestamp
  last_error: string | null
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
}

/** 消息主表（`msg_message`）。 */
export interface MsgMessageTable {
  id: Generated<number>
  tenant_id: string
  template_code: string
  event_code: string | null
  sender_id: number
  sender_type: string
  title: string | null
  /** MySQL `json` 列：typeCast 保持原文本，序列化时需要还原成对象。 */
  content: string | null
  link_json: string | null
  content_type: string | null
  priority: string | null
  category: string | null
  message_type: string | null
  status: string | null
  created_at: NullableTimestamp
}

/** 消息收件人（`msg_recipient`）。status：PENDING（未读）/ SENT（已读）。 */
export interface MsgRecipientTable {
  id: Generated<number>
  tenant_id: string
  message_id: number
  user_id: number
  username: string | null
  nickname: string | null
  channel: string
  status: string
  phone: string | null
  email: string | null
  sent_at: NullableTimestamp
  created_at: NullableTimestamp
}

/** 消息业务事件定义（`msg_event_definition`）。 */
export interface MsgEventDefinitionTable {
  id: Generated<number>
  tenant_id: string
  event_code: string
  event_name: string
  description: string | null
  business_domain: string | null
  enabled: BitFlag
  created_by: string
  created_at: NullableTimestamp
  updated_by: string | null
  updated_at: NullableTimestamp
}

/** 订阅规则（`msg_subscription_rule`）。action：ALLOW / DENY / FORCE。 */
export interface MsgSubscriptionRuleTable {
  id: Generated<number>
  tenant_id: string
  event_code: string
  channel: string
  priority: string | null
  enable: BitFlag
  action: string
  condition_expr: string | null
  created_by: string | null
  created_at: NullableTimestamp
}

/** 流程分类（`wf_category`）。 */
export interface WfCategoryTable {
  id: string
  tenant_id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  created_at: NullableTimestamp
}

/**
 * 表单实例数据（`wf_form_data`）。
 *
 * 同一 `process_instance_id + form_def_id` 只保留一条**当前数据**（`is_snapshot = 0`）；
 * 审批快照（`is_snapshot = 1`）每次新建、不可变。
 * 发起页草稿是 `process_instance_id IS NULL AND is_snapshot = 0` 的那一条。
 */
export interface WfFormDataTable {
  id: string
  tenant_id: string
  form_def_id: string
  form_version: number
  process_instance_id: string | null
  task_id: string | null
  data_json: string | null
  created_by: string | null
  created_at: NullableTimestamp
  updated_at: NullableTimestamp
  is_snapshot: BitFlag
}

/**
 * Kysely 数据库类型定义。
 *
 * 只声明已由迁移脚本创建、且代码确实要查询的表。
 * 未声明的表在类型层不可见 —— 这是刻意的，避免裸 SQL 引入表名拼写错误。
 *
 * 注意：其余业务表（表单、数据源、页面、通知等）按模块增量补充声明。
 */
export interface DB {
  wfe_process_def: WfeProcessDefTable
  wfe_process_instance: WfeProcessInstanceTable
  wfe_execution: WfeExecutionTable
  wfe_activity: WfeActivityTable
  wfe_task: WfeTaskTable
  wfe_task_candidate: WfeTaskCandidateTable
  wfe_task_delegation: WfeTaskDelegationTable
  wfe_variable: WfeVariableTable

  sys_user: SysUserTable
  sys_role: SysRoleTable
  sys_menu: SysMenuTable
  sys_user_role: SysUserRoleTable
  sys_role_menu: SysRoleMenuTable
  sys_organization: SysOrganizationTable

  wf_process_draft: WfProcessDraftTable
  wf_node_config: WfNodeConfigTable
  wf_task_comment: WfTaskCommentTable
  wf_task_transfer: WfTaskTransferTable
  wf_task_remind: WfTaskRemindTable
  sys_dict_type: SysDictTypeTable
  sys_dict_data: SysDictDataTable

  wf_data_source: WfDataSourceTable
  wf_page_def: WfPageDefTable
  wf_form_def: WfFormDefTable
  wf_category: WfCategoryTable
  wf_form_data: WfFormDataTable

  msg_template: MsgTemplateTable
  msg_channel_config: MsgChannelConfigTable
  msg_delivery_retry: MsgDeliveryRetryTable
  msg_message: MsgMessageTable
  msg_recipient: MsgRecipientTable
  msg_event_definition: MsgEventDefinitionTable
  msg_subscription_rule: MsgSubscriptionRuleTable
}
