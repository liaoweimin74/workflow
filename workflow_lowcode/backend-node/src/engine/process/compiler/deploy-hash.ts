import { createHash } from 'node:crypto'

/**
 * 部署指纹，对齐 Java `ProcessDesignService.computeDeployHash`。
 *
 * Java 实现：
 * ```java
 * TreeMap<String, String> sorted = new TreeMap<>(nodeConfigMap);
 * String canonicalJson = objectMapper.writeValueAsString(sorted);
 * String input = trimToNull(effectiveBpmnXml) + "|" + canonicalJson;
 * return hex(sha256(input));
 * ```
 *
 * ⚠️ 关于「值能否与 Java 一致」：
 *   算法本身已完整复刻，但 **`effectiveBpmnXml` 这个输入无法一致** ——
 *   Java 传的是「经 MultiInstanceBpmnRewriter 改写 + injectEventNames 注入事件名」
 *   之后的 **Flowable 归一化 XML**，那是 Flowable BPMN 解析器的产物。
 *   因此自研引擎算出的 hash 与 Java 的 hash 必然不同。
 *
 *   结论：该字段按「仅结构比对」处理（见规格 §5.4.10）。
 *   它是流程定义自身的指纹，只要求**在 Node 内部稳定且能检测配置变化**，
 *   前端不依赖它的具体取值。
 */

/** 对齐 Java `trimToNull`：去空白后为空则返回 null。 */
function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * 计算部署指纹。
 *
 * 两个容易写错的点（都会导致同一个 Java 侧变化在 Node 侧检测不出来）：
 *   1. nodeConfigs 必须**按键排序**后再序列化（Java 用 TreeMap 保证顺序稳定）
 *   2. `trimToNull(xml) + "|" + json` —— 当 xml 为空白时，Java 的字符串拼接
 *      得到的是字面量 `"null|..."`，不是空串加竖线
 */
export function computeDeployHash(
  effectiveBpmnXml: string | null | undefined,
  nodeConfigs: Record<string, string>,
): string {
  const sortedKeys = Object.keys(nodeConfigs).sort()
  const sorted: Record<string, string> = {}
  for (const key of sortedKeys) sorted[key] = nodeConfigs[key]

  const canonicalJson = JSON.stringify(sorted)
  const input = `${trimToNull(effectiveBpmnXml) ?? 'null'}|${canonicalJson}`
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
