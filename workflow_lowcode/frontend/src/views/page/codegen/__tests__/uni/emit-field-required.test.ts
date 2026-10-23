// ----- Task 4.4: uni 必填标记与校验消息通道 golden -----
// golden 快照先行（plan Task 4.4）：uni-forms-item 开标签统一为
// label + name（字段寻址，恒出）+ required（契约 $required 值为 true 才出星标）
// + :error-message（恒出——errors 由页面装配的 useUniForm.validate 提供，Task 3.2
// 的设计意图「校验消息写进 errors 供模板逐字段展示」）。契约侧 $required 与 title
// 对称落 el-form-item 载体：web 模板不消费它（校验仍在 form-create 运行时，artifact
// 模板字节不变），uniapp 侧读同键出 required；rename 供回导还原。
// 设计器必填控件写 rule 顶层 $required（vendor utils Required → formCreate$required），
// 契约登记后 $required: true 不再是 unsupported 噪声（4.4 修复点）。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-field-required.test.ts

import { describe, expect, it } from 'vitest'

import type { IrNode } from '../../ir'
import { parseIr } from '../../parse'
import { generatePage } from '../../generate'
import { reverseToSchema } from '../../reverse'
import { emitFieldNode } from '../../uni/emit-field'
import { PROFILES } from '../../target-profile'
import schema from '../fixtures/test_page.schema.json'

const profile = PROFILES.uniapp

const WEB_META = { pageKey: 'test_page', pageName: '测试页面', exportedAt: '2026-10-20' }
const WEB_SRC = 'TestPage.vue'

function parseOf(rule: Record<string, unknown>) {
  return parseIr(
    { option: {}, rule: [rule], dataSources: [], actions: [] },
    { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-field-required' },
  )
}

describe('emitFieldNode — 必填标记与校验消息通道（Task 4.4）', () => {
  it('$required: true → uni-forms-item 出 required 星标 + name 寻址 + 错误通道', () => {
    const ir = parseOf({
      type: 'input',
      field: 'name',
      title: '姓名',
      $required: true,
      props: { placeholder: '请输入姓名' },
    })
    expect(ir.unsupported, '$required: true 不再是未登记噪声（Task 4.4 契约修复点）').toEqual([])
    expect(emitFieldNode(ir.nodes[0]!, profile).template).toBe(
      [
        `<!-- lc:node=n1 type=input field=name -->`,
        `<uni-forms-item label="姓名" name="name" required :error-message="errors.name">`,
        `  <uni-easyinput v-model="form.name" placeholder="请输入姓名" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('$required: false（缺省值）→ 不出 required 星标，name/错误通道恒出', () => {
    const ir = parseOf({ type: 'input', field: 'nickname', title: '昵称', $required: false, props: {} })
    const tpl = emitFieldNode(ir.nodes[0]!, profile).template
    expect(tpl).toContain(`<uni-forms-item label="昵称" name="nickname" :error-message="errors.nickname">`)
    expect(tpl).not.toContain('required')
  })

  it('契约登记：$required 与 title 对称落 el-form-item 载体（attrs + rename，供回导还原）', () => {
    const ir = parseOf({ type: 'input', field: 'name', title: '姓名', $required: true, props: {} })
    const node = ir.nodes[0] as IrNode
    expect(node.attrs['el-form-item']).toMatchObject({ label: '姓名', required: true })
    expect(node.artifact.renames).toContainEqual({ from: '$required', to: 'el-form-item@required' })
  })

  it('嵌套容器内必填子字段：星标与错误通道经递归保留', () => {
    const ir = parseOf({
      type: 'formContainer',
      field: 'detail',
      title: '订单',
      props: {
        dataSourceId: 'ds_1',
        rule: [
          {
            type: 'subForm',
            field: 'payee',
            title: '收款信息',
            props: { rule: [{ type: 'input', field: 'account', title: '账号', $required: true, props: {} }] },
          },
        ],
      },
    })
    const sub = ir.nodes[0]!.children.find((n) => n.artifact.type === 'subForm')!
    expect(emitFieldNode(sub, profile).template).toContain(
      `    <uni-forms-item label="账号" name="account" required :error-message="errors.account">`,
    )
  })

  it('web 回导闭环：$required: true 在 el-form-item 载体有真证据（rename 校验通过、值保真）', () => {
    const s = JSON.parse(JSON.stringify(schema)) as { rule: Array<Record<string, never>> }
    // test_page 的 rule[1].props.rule[0] 是带显式 $required: false 的字段（原回导失败路径），改成 true 走真载体
    ;(s.rule[1].props.rule[0] as Record<string, unknown>).$required = true
    const gen = generatePage(s as never, WEB_META)
    const rev = reverseToSchema(s as never, gen.files[WEB_SRC], gen.manifest)
    expect(rev.holes).toEqual([])
    const checks = rev.renameChecks.filter((r) => r.path.endsWith('$required'))
    expect(checks.length, '有 $required 的键都应有一条 rename 校验').toBeGreaterThan(0)
    expect(checks.every((c) => c.ok && c.schema === true && c.artifact === true), JSON.stringify(checks)).toBe(true)
  })
})
