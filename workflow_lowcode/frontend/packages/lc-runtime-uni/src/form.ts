/**
 * @lc/runtime-uni/form：出码页表单的字段模型与校验（Task 3.2 骨架，5.2 扩展）。
 *
 * useUniForm(rule) 为出码模板提供 v-model 后端：reactive model 按字段名承载
 * 表单值，validate 按 form-create rule 子集（props.required）做字段校验；
 * 校验消息写进 errors 供模板逐字段展示。真实控件绑定（uni-easyinput 等）
 * 由 Task 5.x 的字段族模板消费。
 *
 * Task 5.2（容器段）：UniFormField 增 init 初值形态——model 预填（字段片段的
 * v-model 与 openContainer 的整表复位都依赖键存在；叶字段缺省 '' 对位 web
 * form 字段全 '' 初始化，嵌套容器按 shape 给 []/{}）+ reset() 整表复位
 * （openContainer 打开时调用；复位语义 = 回到声明形态，不是清成 undefined）。
 */
import { reactive } from 'vue'

/** form-create rule 的 uniapp 侧子集（模板 emit 按字段族裁剪后传入） */
export interface UniFormField {
  field: string
  title?: string
  props?: { required?: boolean; [key: string]: unknown }
  /** 初值形态：缺省 ''；嵌套行数组 [] / 子表单对象 {}（对位 web fields 推导） */
  init?: unknown
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

/** 声明形态复位：数组/对象回空壳（不共享 init 引用，行数组 push 不污染声明），其余回 init ?? '' */
function shapeInit(init: unknown): unknown {
  if (Array.isArray(init)) return []
  if (init && typeof init === 'object') return {}
  return init ?? ''
}

export function useUniForm(rules: UniFormField[]) {
  const model = reactive<Record<string, unknown>>({})
  const errors = reactive<Record<string, string>>({})
  for (const rule of rules) model[rule.field] = shapeInit(rule.init)

  /** 整表复位：全部字段回到声明形态（openContainer 打开时调用） */
  function reset(): void {
    for (const rule of rules) model[rule.field] = shapeInit(rule.init)
  }

  /** 全量校验：required 字段为空即失败；返回是否全部通过 */
  function validate(): boolean {
    let ok = true
    for (const rule of rules) {
      if (rule.props?.required && isEmpty(model[rule.field])) {
        errors[rule.field] = `${rule.title ?? rule.field} 不能为空`
        ok = false
      } else {
        delete errors[rule.field]
      }
    }
    return ok
  }

  return { model, errors, validate, reset }
}
