/**
 * 示例选人函数（业务系统接入参考实现）。
 *
 * 真实业务系统应在本应用之外（自己的扩展代码/插件）调用
 * `registerAssigneeResolver(name, fn, meta)` 注册选人函数；本文件提供
 * 三个**开箱可用**的内置样例，用于：
 * 1. 演示元数据注册方式（中文名 / 描述 / 参数声明）；
 * 2. 设计器面板「自定义选人函数」下拉有真实数据可选；
 * 3. 覆盖三种参数类型的声明方式（string / number / select）。
 *
 * 样例均**同步、零外部依赖**（只读流程变量与配置参数），符合引擎
 * 同步解析链约束；查库/调远程接口的函数请自行预载或用进程内缓存。
 */

import {
  registerAssigneeResolver,
  type AssigneeResolveContext,
} from './assignee-resolver-registry'

/** 流程变量取值（string/number 原文转 string，缺值返回 null）。 */
function variableAsString(ctx: AssigneeResolveContext, key: string): string | null {
  const v = ctx.variables[key]
  if (typeof v === 'string' && v.trim() !== '') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/** 注册全部内置样例（main.ts 启动时调用一次；重复调用会按同名覆盖）。 */
export function registerSampleAssigneeResolvers(): void {
  // 样例 1：项目负责人 —— 从流程变量解析（变量名可作为参数在节点上配置）
  registerAssigneeResolver(
    'project_leader_resolver',
    (ctx, params) => {
      const variableName = String(params.variableName ?? '').trim() || 'project_manager_id'
      const leader = variableAsString(ctx, variableName)
      return leader === null ? [] : [leader]
    },
    {
      displayName: '项目负责人',
      description: '从流程变量中解析项目负责人；变量名可在下方参数中调整（缺省 project_manager_id）',
      params: [
        {
          key: 'variableName',
          label: '流程变量名',
          type: 'string',
          required: true,
          defaultValue: 'project_manager_id',
          placeholder: '如：project_manager_id',
          description: '存放项目负责人用户 ID 的流程变量（发起表单字段名或服务预置变量名）',
        },
      ],
    },
  )

  // 样例 2：固定用户组 —— 按参数返回固定用户（演示 string + select 参数）
  registerAssigneeResolver(
    'fixed_user_group',
    (_ctx, params) => {
      const raw = String(params.userIds ?? '').trim()
      if (raw === '') return []
      const users = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
      return String(params.returnMode ?? 'all') === 'first' ? users.slice(0, 1) : users
    },
    {
      displayName: '固定用户组',
      description: '返回参数中配置的固定用户（英文逗号分隔），适合演示参数化选人与兜底场景',
      params: [
        {
          key: 'userIds',
          label: '用户 ID 列表',
          type: 'string',
          required: true,
          placeholder: '如：1,2,3',
          description: '英文逗号分隔的用户 ID',
        },
        {
          key: 'returnMode',
          label: '返回模式',
          type: 'select',
          defaultValue: 'all',
          options: [
            { label: '全部用户（或签/会签）', value: 'all' },
            { label: '仅第一个用户', value: 'first' },
          ],
        },
      ],
    },
  )

  // 样例 3：顺序轮选 —— 从候选列表中按序取人（演示 number 参数）
  registerAssigneeResolver(
    'round_robin_picker',
    (_ctx, params) => {
      const raw = String(params.userIds ?? '').trim()
      if (raw === '') return []
      const users = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
      if (users.length === 0) return []
      const start = Number(params.startIndex ?? 1)
      const index = (Number.isFinite(start) && start >= 1 ? Math.trunc(start) : 1) - 1
      return [users[index % users.length]]
    },
    {
      displayName: '顺序轮选',
      description: '在候选用户列表中按序号取一人（超过列表长度时取模轮回），可做简单分流',
      params: [
        {
          key: 'userIds',
          label: '候选用户列表',
          type: 'string',
          required: true,
          placeholder: '如：101,102,103',
          description: '英文逗号分隔的用户 ID',
        },
        {
          key: 'startIndex',
          label: '起始序号',
          type: 'number',
          defaultValue: 1,
          placeholder: '从 1 开始',
          description: '取列表中第 N 个用户（超出长度自动取模）',
        },
      ],
    },
  )
}
