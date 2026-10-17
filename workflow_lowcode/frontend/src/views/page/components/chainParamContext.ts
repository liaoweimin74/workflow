/**
 * 动作链参数上下文注册表。
 *
 * ChainParamInput 渲染在三个配置面板（Actions/Events/ColumnAdvanced）里，
 * 拿不到设计器实例；容器 target 候选（页面绑定层 dataSources）与行字段
 * （$row. 模板/脚本 row. 补全候选）由 PageDesigner setup 时注入，
 * 模式同 formulaFieldRegistry：单页只有一个活跃设计器，provider 抛错按空兜底。
 */

export interface ChainContainerTarget {
  /** target 参数值（数据源标识 ds_xxx，即容器寻址键） */
  value: string
  /** 下拉展示名（数据源名 + id） */
  label: string
}

export interface ChainParamContext {
  containerTargets: ChainContainerTarget[]
  rowFields: string[]
}

type ChainParamContextProvider = () => ChainParamContext

let provider: ChainParamContextProvider | null = null

const EMPTY: ChainParamContext = { containerTargets: [], rowFields: [] }

export function setChainParamContextProvider(fn: ChainParamContextProvider): void {
  provider = fn
}

/** 仅测试用：清空注册，避免用例间串扰 */
export function resetChainParamContextProvider(): void {
  provider = null
}

export function getChainParamContext(): ChainParamContext {
  if (!provider) return EMPTY
  try {
    return provider() ?? EMPTY
  } catch {
    return EMPTY
  }
}
