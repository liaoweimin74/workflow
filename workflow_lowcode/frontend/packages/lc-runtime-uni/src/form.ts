/**
 * @lc/runtime-uni/form：出码页表单的字段模型与校验（Task 3.2 骨架）。
 *
 * useUniForm(rule) 为出码模板提供 v-model 后端：reactive model 按字段名承载
 * 表单值，validate 按 form-create rule 子集（props.required）做字段校验；
 * 校验消息写进 errors 供模板逐字段展示。真实控件绑定（uni-easyinput 等）
 * 由 Task 5.x 的字段族模板消费。
 */
import { reactive } from 'vue'

/** form-create rule 的 uniapp 侧子集（模板 emit 按字段族裁剪后传入） */
export interface UniFormField {
  field: string
  title?: string
  props?: { required?: boolean; [key: string]: unknown }
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === ''

export function useUniForm(rules: UniFormField[]) {
  const model = reactive<Record<string, unknown>>({})
  const errors = reactive<Record<string, string>>({})

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

  return { model, errors, validate }
}
