import { ElCol, ElForm, ElRow } from 'element-plus'
import { thin } from './_thin'

/**
 * @lc/ui-mobile 布局族薄组件。
 * 布局容器对齐 view 容器契约（row/col），表单容器对齐 uni-forms。
 */

/** view 行契约：横向弹性容器 + gutter */
export const LcRow = thin('LcRow', ElRow, { gutter: { type: Number, default: 0 } })

/** view 列契约：span 栅格（uni 侧 24 栅格同构） */
export const LcCol = thin('LcCol', ElCol, { span: { type: Number, default: 24 } })

/** uni-forms 契约：model + labelWidth/labelPosition(left|top) + 校验由 form-create 驱动 */
export const LcForm = thin('LcForm', ElForm, {
  labelWidth: { type: [String, Number], default: '80px' },
  labelPosition: { type: String, default: 'left' },
})
