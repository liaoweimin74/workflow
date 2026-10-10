// ----- 回归：列高级配置「汇总」计数→无 保存后回读仍是计数（Task 汇总修复）-----
// 根因：ColumnAdvancedConfig 选「无」patch({ aggregate: undefined })，QueryColumnsConfig
//       pickAdvanced 对 undefined 字段跳过写回，旧值 count 经列对象扩散残留。
// 修复：pickAdvanced 始终显式写回 aggregate（undefined 覆盖旧键）。
// 测试策略：jsdom 下 el-table 表体不渲染（入口按钮拿不到），故以组件事件契约为边界——
//       ColumnAdvancedConfig 桩直发真实组件同构的 save payload，驱动 saveAdvanced+pickAdvanced。
// npx vitest run src/views/page/__tests__/QueryColumnsConfig.aggregate.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

// ColumnAdvancedConfig 桩：无条件渲染 save 按钮（真实模板中该组件始终挂载，visible 仅控制内容显隐）
vi.mock('../components/ColumnAdvancedConfig.vue', () => ({
  default: defineComponent({
    name: 'ColumnAdvancedConfigStub',
    props: ['visible', 'column', 'mode', 'columnType'],
    emits: ['update:visible', 'save'],
    setup(props, { emit }) {
      // 真实组件 save payload = 正在编辑列的完整副本 + 表单补丁；桩以固定 key 直发同构 payload
      const base = () => ({ key: 'age', label: '年龄', width: 120, ...((props.column as Record<string, any>) || {}) })
      return () =>
        h('div', { class: 'stub-advanced' }, [
          h('button', {
            class: 'stub-save-none',
            onClick: () => emit('save', { ...base(), aggregate: undefined }),
          }, '保存为无'),
          h('button', {
            class: 'stub-save-sum',
            onClick: () => emit('save', { ...base(), aggregate: 'sum' }),
          }, '保存为求和'),
        ])
    },
  }),
}))

import QueryColumnsConfig from '../components/QueryColumnsConfig.vue'

function mountConfig(columns: any[]) {
  return mount(QueryColumnsConfig, {
    props: {
      candidates: [{ key: 'age', label: '年龄', columnType: 'number' }],
      searchFields: [],
      columns,
      mode: 'table',
    },
    global: { plugins: [ElementPlus] },
  })
}

function lastColumnsEmit(wrapper: ReturnType<typeof mount>): any[] {
  const events = wrapper.emitted('update:columns') as unknown[][] | undefined
  expect(events, '应发出 update:columns').toBeTruthy()
  // emitted 每条记录是参数数组 [payload]，取首个参数（columns 数组本体）
  const last = events![events!.length - 1] as any[]
  return (Array.isArray(last) && last.length && Array.isArray(last[0]) ? last[0] : last) as any[]
}

describe('QueryColumnsConfig — 列高级配置 aggregate 写回（汇总 计数→无 回归）', () => {
  it('计数→无：save payload aggregate=undefined → update:columns 该列 aggregate 被清除（不残留 count）', async () => {
    const wrapper = mountConfig([{ key: 'age', label: '年龄', width: 120, aggregate: 'count' }])

    await (wrapper.find('.stub-save-none').element as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    const cols = lastColumnsEmit(wrapper)
    const age = cols.find((c) => c.key === 'age')
    expect(age, '写回应包含 age 列').toBeTruthy()
    expect(age!.aggregate, 'count 改无后 aggregate 应为 undefined（旧值不残留）').toBeUndefined()
  })

  it('计数→求和：save payload aggregate=sum → 该列 aggregate 正常写回 sum（正路径不回归）', async () => {
    const wrapper = mountConfig([{ key: 'age', label: '年龄', width: 120, aggregate: 'count' }])

    await (wrapper.find('.stub-save-sum').element as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    const cols = lastColumnsEmit(wrapper)
    const age = cols.find((c) => c.key === 'age')
    expect(age!.aggregate).toBe('sum')
  })

  it('未配置聚合的列保存高级配置 → 不引入 aggregate 键（undefined 不序列化进 schema）', async () => {
    const wrapper = mountConfig([{ key: 'age', label: '年龄', width: 120 }])

    await (wrapper.find('.stub-save-none').element as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    const cols = lastColumnsEmit(wrapper)
    const age = cols.find((c) => c.key === 'age')
    expect(age!.aggregate).toBeUndefined()
    // JSON 序列化后不应出现 aggregate 字段（写入 schema 时保持干净）
    expect(JSON.parse(JSON.stringify(age))).not.toHaveProperty('aggregate')
  })
})
