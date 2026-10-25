/**
 * uni 出码共享工具（Task 11.2 抽取）：数据源寻址与字符串字面量序列化。
 *
 * 这两件事此前在 emit-list / emit-widget 各写了一份（`sq` 两份、数据源寻址四处），
 * picker 族（emit-field）要用第三份时收拢到这里 —— 「首源判定」「登记表下标」这类
 * 口径一旦各写一份就会漂移，漂移就是查错表（拿 ds.refId 去取第二个数据源）。
 */

import type { IrNode, IrPage } from '../ir'

/**
 * 数据源寻址：IR 里的数据源引用 → 产物里的 refId 表达式。
 *
 * 产物里 `ds` 常量只代表 dataSources[0]，其余源必须查产物自己的常量表 —— 同一页两个
 * 组件各绑各的源时，一律走 ds.refId 就是拿错 refId 取错表。载体的键名按族不同：
 *  · 取数组件（列表/容器/仪表盘件/图表/数据容器）→ parse 写 `ds-ref-id`（kind=dsRef）；
 *  · 选择器（LookupPicker / dataPicker）→ parse 写 `global-data-source-id`
 *    （kind=globalDataSourceId，parse.ts:995 的 derived:globalDataSourceId 分支）。
 * 两族走同一函数，避免「首源判定」与「登记表下标」各写一份。
 */
export function refIdExprOf(node: IrNode, ir: IrPage | undefined, propName = 'ds-ref-id'): string {
  const dsProp = node.props.find((x) => x.name === propName)
  const sourceId =
    dsProp && (dsProp.value.kind === 'dsRef' || dsProp.value.kind === 'globalDataSourceId')
      ? String(dsProp.value.sourceId ?? '')
      : ''
  // 页面一个源都没声明 → 产物不出登记表（emit-uni 按 dataSources.length 决定），
  // 生成 dataSources['x'] 就是引用不存在的常量（运行期 ReferenceError）；退 ds.refId
  // ——ds 常量的 refId 为空串，取数层 fetchRows 空 refId 直接短路，弹层停在没有数据的可用形态
  if (!ir || !ir.dataSources.length) return 'ds.refId'
  const firstDsId = String(ir.dataSources[0]?.id ?? '')
  return sourceId && sourceId !== firstDsId ? `dataSources['${sourceId}']` : 'ds.refId'
}

/** 单引号字符串字面量（含转义）：产物常量与内联字面量统一走这里 */
export const sq = (v: string): string => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`