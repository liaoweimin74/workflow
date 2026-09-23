import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { parseBackendLogicItems } from '../../../src/engine/logic/backend-logic-config'
import {
  BackendLogicExecutor,
  type BackendLogicContext,
} from '../../../src/engine/logic/backend-logic-executor'
import {
  completedActivityIdSnapshot,
  newlyCompletedEndEventNodeIds,
} from '../../../src/engine/logic/backend-logic-hook'
import type { EngineActivity, EngineState } from '../../../src/engine/runtime/engine-runtime'

/**
 * 节点级后端逻辑（规格 U38）的单测。
 *
 * 契约网只能覆盖「成功的 http 调用 + `resultVar` 写回」这一条路径（见 executor 类注释的
 * 可观测性分析），其余分支**只能**靠这里钉住：
 *   - `enabled` / `trigger` 的过滤语义（尤其 Java 的 `boolean` 基本类型：缺省即 false）
 *   - 配置解析的容错（坏 JSON / 空数组 / 非数组 → 该节点没有逻辑，而不是抛错）
 *   - 失败时的**不中断**语义（`IGNORE_CONTINUE` 与 `FAIL_FLOW` 的可观测行为相同）
 *   - `bean` / `script` / 未知 type 记录日志后跳过，且**不改流程行为**
 */

// ⚠️ 静音 Nest 日志：本 spec 有多个「失败路径」用例（失败只记日志、绝不抛错），
//    不静音的话输出会被十几条**预期内**的 error 堆栈淹没，真正的失败反而看不见。
Logger.overrideLogger([])

function makeExecutor(options: {
  configJson: string | null
  httpResult?: string
  httpError?: Error
}): {
  executor: BackendLogicExecutor
  calls: Array<Record<string, unknown>>
} {
  const calls: Array<Record<string, unknown>> = []
  const repository = {
    findNodeConfig: async () => (options.configJson === null ? null : { config_json: options.configJson }),
  }
  const httpExecutor = {
    execute: async (...args: unknown[]) => {
      calls.push({ args })
      if (options.httpError !== undefined) throw options.httpError
      return options.httpResult ?? '{"ok":true}'
    },
  }
  const executor = new BackendLogicExecutor(repository as never, httpExecutor as never)
  return { executor, calls }
}

function context(overrides: Partial<BackendLogicContext> = {}): {
  ctx: BackendLogicContext
  written: Record<string, unknown>
} {
  const written: Record<string, unknown> = {}
  const ctx: BackendLogicContext = {
    processDefinitionId: 'leave:1',
    nodeId: 'userTask1',
    trigger: 'ENTER',
    vars: { username: 'admin', password: 'wrong' },
    setVariable: async (name, value) => {
      written[name] = value
    },
    ...overrides,
  }
  return { ctx, written }
}

const httpItem = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    backendLogic: [
      {
        id: 'l1',
        name: '登录校验',
        enabled: true,
        trigger: 'ENTER',
        type: 'http',
        errorAction: 'FAIL_FLOW',
        resultVar: 'loginResult',
        http: {
          url: 'http://localhost:8081/api/auth/login',
          method: 'POST',
          bodyParams: [
            { source: 'username', target: 'username' },
            { source: 'password', target: 'password' },
          ],
        },
        ...extra,
      },
    ],
  })

describe('parseBackendLogicItems（对齐 Java ProcessConfigResolver.parseBackendLogic）', () => {
  it('空/非对象/无 backendLogic/空数组 → 该节点没有逻辑', () => {
    expect(parseBackendLogicItems(null)).toEqual([])
    expect(parseBackendLogicItems('')).toEqual([])
    expect(parseBackendLogicItems('   ')).toEqual([])
    expect(parseBackendLogicItems('[]')).toEqual([])
    expect(parseBackendLogicItems('{"other":1}')).toEqual([])
    expect(parseBackendLogicItems('{"backendLogic":[]}')).toEqual([])
    expect(parseBackendLogicItems('{"backendLogic":"x"}')).toEqual([])
  })

  it('坏 JSON 不抛错（Java 只 log.warn）—— 一条坏配置不能炸掉引擎事件', () => {
    expect(parseBackendLogicItems('{"backendLogic":[')).toEqual([])
  })

  it('解析字段并应用 Java 的字段初始化器默认值', () => {
    const items = parseBackendLogicItems(httpItem())
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.name).toBe('登录校验')
    expect(item.type).toBe('http')
    expect(item.trigger).toBe('ENTER')
    expect(item.resultVar).toBe('loginResult')
    // Java `BackendLogicHttpConfig` 的字段初始化器：3000 / 5000 / 0
    expect(item.http?.connTimeoutMs).toBe(3000)
    expect(item.http?.readTimeoutMs).toBe(5000)
    expect(item.http?.retryCount).toBe(0)
    expect(item.http?.bodyParams).toEqual([
      { source: 'username', target: 'username' },
      { source: 'password', target: 'password' },
    ])
  })

  it('⚠️ `enabled` 缺省即 false（Java 是 boolean 基本类型，`"true"` 字符串也不算）', () => {
    const missing = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
    delete missing.backendLogic[0].enabled
    expect(parseBackendLogicItems(JSON.stringify(missing))[0].enabled).toBe(false)

    const stringTrue = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
    stringTrue.backendLogic[0].enabled = 'true'
    expect(parseBackendLogicItems(JSON.stringify(stringTrue))[0].enabled).toBe(false)
  })

  it('显式超时/重试覆盖默认值', () => {
    const json = JSON.stringify({
      backendLogic: [
        {
          enabled: true,
          type: 'http',
          http: { url: 'http://x', connTimeoutMs: 1000, readTimeoutMs: 2000, retryCount: 3 },
        },
      ],
    })
    const http = parseBackendLogicItems(json)[0].http
    expect([http?.connTimeoutMs, http?.readTimeoutMs, http?.retryCount]).toEqual([1000, 2000, 3])
  })
})

describe('BackendLogicExecutor', () => {
  it('ENTER + enabled → 调 HTTP，并把响应体写进 resultVar', async () => {
    const { executor, calls } = makeExecutor({ configJson: httpItem(), httpResult: '{"code":500}' })
    const { ctx, written } = context()
    await expect(executor.execute(ctx)).resolves.toBe(1)
    expect(written).toEqual({ loginResult: '{"code":500}' })
    // 变量表原样传给 HttpLogicExecutor（body 参数从里面取值）
    const args = calls[0].args as unknown[]
    expect(args[0]).toBe('http://localhost:8081/api/auth/login')
    expect(args[1]).toBe('POST')
    expect(args[5]).toEqual({ username: 'admin', password: 'wrong' })
  })

  it('trigger 不匹配 → 不执行（大小写不敏感）', async () => {
    const { executor, calls } = makeExecutor({ configJson: httpItem() })
    const { ctx } = context({ trigger: 'COMPLETE' })
    await expect(executor.execute(ctx)).resolves.toBe(0)
    expect(calls).toHaveLength(0)

    const lower = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
    lower.backendLogic[0].trigger = 'enter'
    const second = makeExecutor({ configJson: JSON.stringify(lower) })
    await expect(second.executor.execute(context().ctx)).resolves.toBe(1)
  })

  it('enabled=false → 不执行（即使 trigger 匹配）', async () => {
    const disabled = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
    disabled.backendLogic[0].enabled = false
    const { executor, calls } = makeExecutor({ configJson: JSON.stringify(disabled) })
    await expect(executor.execute(context().ctx)).resolves.toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('resultVar 空白 → 执行但不写变量', async () => {
    const noVar = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
    noVar.backendLogic[0].resultVar = '   '
    const { executor, calls } = makeExecutor({ configJson: JSON.stringify(noVar) })
    const { ctx, written } = context()
    await expect(executor.execute(ctx)).resolves.toBe(1)
    expect(calls).toHaveLength(1)
    expect(written).toEqual({})
  })

  it('⚠️ 失败**绝不向上抛**（Java 的监听器把异常吞掉了，抛出去会变成 HTTP 500 分叉）', async () => {
    for (const errorAction of ['FAIL_FLOW', 'IGNORE_CONTINUE', undefined]) {
      const json = JSON.parse(httpItem()) as { backendLogic: Array<Record<string, unknown>> }
      if (errorAction === undefined) delete json.backendLogic[0].errorAction
      else json.backendLogic[0].errorAction = errorAction
      const { executor } = makeExecutor({
        configJson: JSON.stringify(json),
        httpError: new Error('401 Unauthorized: "{\\"code\\":401}"'),
      })
      const { ctx, written } = context()
      await expect(executor.execute(ctx)).resolves.toBe(1)
      // 失败时不写 resultVar（两条 errorAction 都是）
      expect(written).toEqual({})
    }
  })

  it('http 配置缺失/URL 为空 → 同失败路径（记录后跳过，不抛）', async () => {
    const noHttp = JSON.stringify({
      backendLogic: [{ enabled: true, trigger: 'ENTER', type: 'http', resultVar: 'r' }],
    })
    const { executor } = makeExecutor({ configJson: noHttp })
    const { ctx, written } = context()
    await expect(executor.execute(ctx)).resolves.toBe(1)
    expect(written).toEqual({})

    const emptyUrl = JSON.stringify({
      backendLogic: [{ enabled: true, trigger: 'ENTER', type: 'http', http: { url: '' }, resultVar: 'r' }],
    })
    const second = makeExecutor({ configJson: emptyUrl })
    await expect(second.executor.execute(context().ctx)).resolves.toBe(1)
  })

  it('bean / script / 未知 type → 记录日志后跳过（节点没有配置 = 不执行；有配置也不能改流程行为）', async () => {
    const types = ['bean', 'script', 'weird']
    for (const type of types) {
      const json = JSON.stringify({
        backendLogic: [
          {
            name: `x-${type}`,
            enabled: true,
            trigger: 'ENTER',
            type,
            resultVar: 'r',
            bean: { beanName: 'b', methodName: 'm' },
            script: { language: 'groovy', source: 'return 1' },
          },
        ],
      })
      const { executor, calls } = makeExecutor({ configJson: json })
      const { ctx, written } = context()
      await expect(executor.execute(ctx)).resolves.toBe(1)
      expect(calls).toHaveLength(0)
      expect(written).toEqual({})
    }
  })

  it('顺序执行多条（按配置数组顺序），部分失败不影响后续', async () => {
    const json = JSON.stringify({
      backendLogic: [
        { name: 'a', enabled: true, trigger: 'ENTER', type: 'http', http: { url: 'http://a' }, resultVar: 'ra' },
        { name: 'b', enabled: true, trigger: 'ENTER', type: 'http', http: { url: 'http://b' }, resultVar: 'rb' },
      ],
    })
    const calls: string[] = []
    const repository = { findNodeConfig: async () => ({ config_json: json }) }
    const httpExecutor = {
      execute: async (url: string) => {
        calls.push(url)
        if (url === 'http://a') throw new Error('boom')
        return 'ok'
      },
    }
    const executor = new BackendLogicExecutor(repository as never, httpExecutor as never)
    const { ctx, written } = context()
    await expect(executor.execute(ctx)).resolves.toBe(2)
    expect(calls).toEqual(['http://a', 'http://b'])
    expect(written).toEqual({ rb: 'ok' })
  })

  it('processDefinitionId / nodeId 为空 → 不查库、不执行', async () => {
    const repository = { findNodeConfig: vi.fn() }
    const executor = new BackendLogicExecutor(repository as never, {} as never)
    await expect(executor.execute(context({ processDefinitionId: null }).ctx)).resolves.toBe(0)
    await expect(executor.execute(context({ nodeId: '' }).ctx)).resolves.toBe(0)
    expect(repository.findNodeConfig).not.toHaveBeenCalled()
  })

  it('该节点没有配置快照行 → 0（部署版本里没配 = 不执行）', async () => {
    const { executor } = makeExecutor({ configJson: null })
    await expect(executor.execute(context().ctx)).resolves.toBe(0)
  })
})

/**
 * 「本次调用新完成的结束事件」求差逻辑。
 *
 * 这段逻辑是**契约抓出来的**：首版直接在每次 `run()` 里调 `runtime.getVariables()`，
 * 而它返回**浅拷贝** ⇒ 后一次落库覆盖前一次，`approveResult` 被 `subEndResult` 顶掉。
 * 修完必须把「只取本次新增 / 只取 endEvent / 去重」这三条钉住，
 * 否则下次有人「顺手」改成按 `endTime != null` 全量收集，就会把上次的结束事件重复触发一遍。
 */
describe('newlyCompletedEndEventNodeIds', () => {
  const activity = (
    id: string,
    nodeId: string,
    nodeType: string,
    endTime: Date | null,
  ): EngineActivity => ({
    id,
    executionId: 'e1',
    nodeId,
    nodeType,
    status: endTime === null ? 'ACTIVE' : 'COMPLETED',
    miRootId: null,
    miIndex: null,
    startTime: new Date('2026-01-01T00:00:00Z'),
    endTime,
  })

  const stateOf = (activities: EngineActivity[]): EngineState =>
    ({ status: 'RUNNING', executions: [], activities, tasks: [], joinArrivals: {}, activeBranchSets: {} }) as EngineState

  it('只返回**本次新增**的结束事件（上次已完成的结束事件不重复触发）', () => {
    const old = activity('a1', 'End_old', 'endEvent', new Date('2026-01-01T00:00:01Z'))
    const fresh = activity('a2', 'End_2', 'endEvent', new Date('2026-01-01T00:00:02Z'))
    const state = stateOf([old, fresh])
    const before = completedActivityIdSnapshot(stateOf([old]))

    expect(newlyCompletedEndEventNodeIds(state, before)).toEqual(['End_2'])
    // 新实例（空快照）⇒ 全部结束事件都算新增
    expect(newlyCompletedEndEventNodeIds(state, new Set())).toEqual(['End_old', 'End_2'])
    // 同一个函数对**同一份 state** 再跑一次（快照含全部）⇒ 什么都不返回（幂等）
    expect(
      newlyCompletedEndEventNodeIds(state, completedActivityIdSnapshot(state)),
    ).toEqual([])
  })

  it('只认 endEvent：userTask / startEvent / 未完成活动都不算', () => {
    const state = stateOf([
      activity('a1', 'Approve_1', 'userTask', new Date('2026-01-01T00:00:01Z')),
      activity('a2', 'Start_2', 'startEvent', new Date('2026-01-01T00:00:01Z')),
      activity('a3', 'End_running', 'endEvent', null),
      activity('a4', 'End_2', 'endEvent', new Date('2026-01-01T00:00:02Z')),
    ])
    expect(newlyCompletedEndEventNodeIds(state, new Set())).toEqual(['End_2'])
  })

  it('同一节点多个活动实例（MI / 重入）只返回一次', () => {
    const state = stateOf([
      activity('a1', 'End_2', 'endEvent', new Date('2026-01-01T00:00:01Z')),
      activity('a2', 'End_2', 'endEvent', new Date('2026-01-01T00:00:02Z')),
    ])
    expect(newlyCompletedEndEventNodeIds(state, new Set())).toEqual(['End_2'])
  })

  it('completedActivityIdSnapshot 只收已完成活动', () => {
    const state = stateOf([
      activity('a1', 'End_2', 'endEvent', new Date('2026-01-01T00:00:01Z')),
      activity('a2', 'Approve_1', 'userTask', null),
    ])
    expect([...completedActivityIdSnapshot(state)]).toEqual(['a1'])
  })
})
