/**
 * uni-shell 侧 glue（Task 3.3）：生成页与宿主之间的桥接面。
 * 依赖单向：src/pages/gen/*.vue → glue → @lc/runtime-uni（emit 产物不直接
 * import 宿主实现）。main.ts 把 pageDeps 挂到 app 全局属性 $lc，生成页经
 * getCurrentInstance().appContext 消费（Task 5.x 模板接线细化）。
 */
import { runAction } from '@lc/runtime-uni/actions'
import { useUniForm } from '@lc/runtime-uni/form'
import { buildChartOption } from '@lc/runtime-uni/charts'
import { request } from './request'

/** 生成页运行时依赖面（glue 单例） */
export const pageDeps = { request, runAction, useUniForm, buildChartOption }
