/**
 * uni-ui 主题 token 克隆（单一来源）。
 *
 * design 风险登记：@lc/ui-mobile 皮肤与真实 uni-ui 漂移 → 锁定 uni-ui 版本、
 * token 全部从这里派生（画布 --ds-* 令牌、组件包取色统一走本模块）；
 * 产物级预览 + 真机二维码作发布前核对。
 */

/** 锁定的 uni-ui 版本（升级须同步核对 token 值与组件 props/事件契约） */
export const UNI_UI_VERSION = '1.5.7'

/** uni-ui 官方 uni.scss 主题变量克隆（https://uniapp.dcloud.net.cn/component/uniui/theme.html） */
export const UNI_THEME_TOKENS = {
  primary: '#007aff',
  success: '#4cd964',
  warning: '#f0ad4e',
  error: '#dd524d',
  mainColor: '#303133',
  contentColor: '#606266',
  tipsColor: '#909399',
  lightColor: '#c0c4cc',
  borderColor: '#e5e5e5',
  bgColor: '#f8f8f8',
} as const

/** 画布 --ds-* 令牌（DeviceFrame/皮肤层消费；命名统一 --ds- 前缀） */
export const UNI_CSS_VARS: Record<string, string> = {
  '--ds-primary': UNI_THEME_TOKENS.primary,
  '--ds-success': UNI_THEME_TOKENS.success,
  '--ds-warning': UNI_THEME_TOKENS.warning,
  '--ds-error': UNI_THEME_TOKENS.error,
  '--ds-text-main': UNI_THEME_TOKENS.mainColor,
  '--ds-text-content': UNI_THEME_TOKENS.contentColor,
  '--ds-text-tips': UNI_THEME_TOKENS.tipsColor,
  '--ds-border': UNI_THEME_TOKENS.borderColor,
  '--ds-bg': UNI_THEME_TOKENS.bgColor,
}
