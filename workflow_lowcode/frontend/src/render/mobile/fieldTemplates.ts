/**
 * 字段级移动映射（rule.type 维度的单点，与块级 channelTemplates 同族）。
 *
 * @form-create/vant 内置直通 input/textarea/select/radio/checkbox/datePicker/timePicker/
 * uploader/group/subForm/cascader/switch/stepper/rate 等——表单字段主体天然可用（批 B 摸底结论）。
 * 桌面 EP 侧注册的自定义字段组件（main.ts 注册面）在移动实例上无等价实现，
 * 显式登记缺失：渲染占位提示 + 剥离 validate（占位不产输入值，required 挂上会锁死整表提交）；
 * 发布拦截清单（§8.3）同样以本表为口径。
 *
 * ⚠️ 新增 EP 自定义字段组件时同步登记处置，fieldTemplates.test 完备性用例会红。
 */

export const MOBILE_FIELD_PLACEHOLDER_TYPE = 'mobile-field-placeholder'

/** EP-only 自定义字段组件 → 缺失理由（发布拦截与占位文案的数据源） */
export const MOBILE_MISSING_FIELDS: Readonly<Record<string, string>> = {
  LookupPicker: '数据关联选择器依赖桌面弹窗与树形交互，移动等价为联系人式钻取页（另行设计）',
  dataPicker: '数据选择器依赖桌面弹窗表格，移动等价待钻取页设计',
  SystemUserPicker: '人员选择依赖桌面树形弹窗，移动等价为联系人式钻取页（另行设计）',
  SystemDeptPicker: '部门选择依赖桌面树形弹窗，移动等价为联系人式钻取页（另行设计）',
  SystemAttachment: '附件上传依赖桌面拖拽与预览面板，van-uploader 语义差距大（相机/相册流另行设计）',
  SystemImage: '图片多选与预览面板为桌面交互，移动等价为 van-uploader 相机流（另行设计）',
  FormulaField: '公式字段编辑器面向桌面属性面板（表达式编辑器无移动形态）',
  areaPicker: '省市区选择依赖桌面级联下拉，移动 picker 列级联另行设计',
  dictSelect: '字典下拉带桌面远程搜索交互，移动 picker 形态另行设计',
  AutoNumber: '编号预览依赖桌面弹窗规则配置，移动形态另行设计',
  RelationCard: '关联卡片依赖桌面子表格弹窗，移动等价为卡片钻取（另行设计）',
  LocationPicker: '定位地图为桌面交互，移动端应走原生定位（另行设计）',
  StepsForm: '分步表单依赖桌面步骤条+子表单编排，移动形态另行设计',
  DrawerContainer: '抽屉容器为桌面形态，移动端等价为全屏页栈（另行设计）',
}

export interface MobileFieldRule {
  type?: string
  [key: string]: unknown
}

/**
 * @form-create/vant 内置可用类型白名单（查证=dist 的 alias 映射表 + 内建组件注册面）：
 * 白名单外=移动无实现，保守占位（含桌面 EP 物料 el* 前缀），防未知类型静默 label-only。
 */
const VANT_BUILTIN_TYPES: ReadonlySet<string> = new Set([
  'input',
  'textarea',
  'field',
  'formItem',
  'inputNumber',
  'stepper',
  'switch',
  'slider',
  'rate',
  'select',
  'radio',
  'checkbox',
  'cascader',
  'datePicker',
  'timePicker',
  'calendar',
  'uploader',
  'upload',
  'button',
  'icon',
  'cell',
  'form',
  'row',
  'col',
  'fcRow',
  'group',
  'array',
  'object',
  'subForm',
  'hidden',
  // 移动渲染器自己的占位族（幂等重写不再套娃）
  MOBILE_FIELD_PLACEHOLDER_TYPE,
])

/** 字段类型在移动渲染是否有实现：白名单内=支持；块类型归块级口径；其余保守判不支持 */
export function isMobileSupportedFieldType(type: unknown): boolean {
  if (typeof type !== 'string' || !type) return false
  // page-/dash- 前缀是块类型，归块级 channelTemplates 裁决，不在字段级口径内
  if (/^(page|dash)-/.test(type)) return true
  return VANT_BUILTIN_TYPES.has(type)
}

/** 递归改写：EP-only 字段类型 → 占位组件（validate 剥离），children 递归保留 */
export function rewriteFieldTypesForMobile(rules: readonly MobileFieldRule[]): MobileFieldRule[] {
  return rules.map((rule) => {
    if (!rule || typeof rule !== 'object' || typeof rule.type !== 'string') return rule
    if (isMobileSupportedFieldType(rule.type)) {
      if (Array.isArray(rule.children) && rule.children.length > 0) {
        return { ...rule, children: rewriteFieldTypesForMobile(rule.children as MobileFieldRule[]) }
      }
      return rule
    }
    const { validate: _validate, ...rest } = rule
    return {
      ...rest,
      type: MOBILE_FIELD_PLACEHOLDER_TYPE,
      props: {
        ...(typeof rule.props === 'object' && rule.props ? rule.props : {}),
        field: rule.type,
        reason: MOBILE_MISSING_FIELDS[rule.type] ?? '该字段组件无移动等价实现',
      },
    }
  })
}
