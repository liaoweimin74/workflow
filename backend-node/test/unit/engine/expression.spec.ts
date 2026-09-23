import { describe, expect, it } from 'vitest'
import { EngineException } from '../../../src/common/exception/engine-exception'
import {
  evaluateCondition,
  unwrapExpression,
} from '../../../src/engine/runtime/expression'

const vars = { amount: 100, level: 2, type: 'A', flag: true, nested: { x: 5 } }

const ok = (expr: string, expected: boolean, v: Record<string, unknown> = vars): void => {
  expect(evaluateCondition(expr, v), expr).toBe(expected)
}

describe('unwrapExpression', () => {
  it('去掉 ${...} 外壳', () => {
    expect(unwrapExpression('${amount > 1}')).toBe('amount > 1')
  })

  it('没有外壳时原样返回（去空白）', () => {
    expect(unwrapExpression('  amount > 1 ')).toBe('amount > 1')
  })

  it('多行内容也能处理', () => {
    expect(unwrapExpression('${\n  amount > 1\n}')).toBe('amount > 1')
  })
})

describe('字面量', () => {
  it('数字比较', () => {
    ok('${100 > 50}', true)
    ok('${1 >= 2}', false)
  })

  it('负数', () => {
    ok('${-5 < 0}', true)
  })

  it('单引号与双引号字符串', () => {
    ok("${'a' == 'a'}", true)
    ok('${"b" == "b"}', true)
    ok("${'a' == 'b'}", false)
  })

  it('true / false / null 字面量', () => {
    ok('${true}', true)
    ok('${false}', false)
    ok('${null == null}', true)
  })

  it('字符串里的转义', () => {
    ok("${'it\\'s' == \"it's\"}", true)
  })
})

describe('变量与比较', () => {
  it('按名字取变量', () => {
    ok('${amount == 100}', true)
    ok('${flag}', true)
  })

  it('不存在的变量为 undefined（falsy），不抛异常', () => {
    ok('${notDefined}', false)
    ok('${notDefined == null}', true)
  })

  it('数字与数字字符串宽松相等（变量值来自 JSON 时常是字符串）', () => {
    ok('${amount == "100"}', true)
    expect(evaluateCondition('${"100" == amount}', vars)).toBe(true)
  })

  it('=== 严格相等不做类型转换', () => {
    ok('${amount === 100}', true)
    ok('${amount === "100"}', false)
  })

  it('!= 与 !==', () => {
    ok('${amount != 200}', true)
    ok('${amount !== "100"}', true)
    ok('${amount !== 100}', false)
  })

  it('字符串比较', () => {
    ok("${type == 'A'}", true)
    ok("${type != 'B'}", true)
  })

  it('大小比较', () => {
    ok('${amount >= 100}', true)
    ok('${amount <= 100}', true)
    ok('${amount > 100}', false)
    ok('${level < 3}', true)
  })

  it('null 与 undefined 相互相等', () => {
    expect(evaluateCondition('${a == b}', { a: null, b: undefined })).toBe(true)
  })

  it('成员访问', () => {
    ok('${nested.x == 5}', true)
    ok('${nested.missing == null}', true)
  })
})

describe('逻辑运算与优先级', () => {
  it('&& 与 ||', () => {
    ok('${amount > 50 && type == "A"}', true)
    ok('${amount > 500 || type == "A"}', true)
    ok('${amount > 500 && type == "A"}', false)
  })

  it('! 取反', () => {
    ok('${!flag}', false)
    ok('${!notDefined}', true)
  })

  it('括号改变优先级：&& 优先于 ||，括号可覆盖', () => {
    // false || (true && false) = false
    ok('${false || true && false}', false)
    // (false || true) && false = false
    ok('${(false || true) && false}', false)
    // false || (true && true) = true
    ok('${false || true && true}', true)
  })

  it('比较优先于逻辑', () => {
    ok('${amount > 50 && level > 1 && type == "A"}', true)
  })

  it('嵌套括号', () => {
    ok('${((amount > 50) && (level > 1)) || false}', true)
  })
})

describe('空表达式', () => {
  it('空串视为无条件命中（宽松写法）', () => {
    ok('${}', true)
    ok('', true)
  })
})

describe('错误处理：表达式写错要报错，不能静默当成 false', () => {
  const bad = (expr: string, pattern: RegExp): void => {
    expect(() => evaluateCondition(expr, vars), expr).toThrow(EngineException)
    expect(() => evaluateCondition(expr, vars), expr).toThrow(pattern)
  }

  it('字符串未闭合', () => {
    bad("${type == 'A}", /字符串未闭合/)
  })

  it('括号不匹配', () => {
    bad('${(amount > 1}', /缺少 "\)"/)
  })

  it('无法识别的字符', () => {
    bad('${amount @ 1}', /无法识别的字符/)
  })

  it('表达式不完整', () => {
    bad('${amount >}', /无法解析/)
  })

  it('多余内容', () => {
    bad('${amount 100}', /多余内容/)
  })

  it('成员访问缺少属性名', () => {
    bad('${nested. == 1}', /缺少属性名/)
  })
})

describe('安全性：不得执行任意代码', () => {
  it('不存在的函数不会被调用（当作 undefined）', () => {
    // 若实现用了 eval，这行会抛 ReferenceError 或真的执行；这里应当安全地得到 false
    expect(() => evaluateCondition('${constructor("return 1")()}', vars)).toThrow(EngineException)
  })

  it('不访问原型链上的敏感属性（只做普通取值）', () => {
    // nested.constructor 取到的是 Object 构造函数对象（非 undefined），
    // 但绝不会被当作函数调用 —— 表达式语法本身不允许函数调用
    expect(() => evaluateCondition('${nested.constructor()}', vars)).toThrow(EngineException)
  })

  it('赋值语句不被支持', () => {
    expect(() => evaluateCondition('${amount = 5}', vars)).toThrow(EngineException)
  })

  it('不修改传入的变量对象', () => {
    const before = JSON.stringify(vars)
    evaluateCondition('${amount > 1}', vars)
    expect(JSON.stringify(vars)).toBe(before)
  })
})
