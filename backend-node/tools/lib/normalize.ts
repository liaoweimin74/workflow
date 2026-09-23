/**
 * 黄金样本规范化。
 *
 * 契约冻结关注的是「响应形状」而非「具体 ID 与时间」。录制时把易变值替换为
 * 占位符，比对时两边用同一套规则，这样形状差异会暴露、而随机的 ID 不会造成假失败。
 */

const PATTERNS: Array<[RegExp, string]> = [
  // JWT 必须排在通用十六进制规则之前，否则会被误判
  [/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, '<JWT>'],
  // UUID
  [/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, '<UUID>'],
  // 业务 ID：32 位十六进制（本项目 Java 侧的 ID 生成方式）
  [/^[0-9a-fA-F]{32}$/, '<ID>'],
  // ISO 8601
  [/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/, '<TIME>'],
  // yyyy-MM-dd HH:mm:ss
  [/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, '<TIME>'],
  // 纯日期
  [/^\d{4}-\d{2}-\d{2}$/, '<DATE>'],
]

/**
 * 递归规范化：字符串按 PATTERNS 替换，对象/数组递归，其余原样。
 *
 * @param literals 额外的「原样替换」字面量，如本次运行的 runId。
 *   契约场景会创建带随机后缀的 processKey（避免 version 累加），
 *   响应里会回显该 key —— 必须替换掉，否则两侧必然不同。
 * @param path 当前 JSON 路径（内部递归用），用于路径相关的规则。
 */
export function normalizeBody(body: unknown, literals: string[] = [], path = '$'): unknown {
  // ⚠️ 自增主键的值**依赖环境**：Java 那次运行建了 role id=3，
  //    Node 那次建了 id=4（因为 3 已被 Java 消耗）。这不是契约破损，
  //    而是「环境相关的标识符」—— 与数据量同类。
  //
  //    这里把路径末段为 `id` 的**数字**归一为 <NUM>。
  //    注意仍保留类型检查：若某侧返回的是字符串 id，它不命中本规则，
  //    两侧就会不一致 —— 这正是我们要抓的（例如实例 id 必须是 UUID 而非 32 位 hex）。
  if (typeof body === 'number' && /(^|\.)id$/i.test(path)) return '<NUM>'

  // ⚠️ 同一个「自增主键依赖环境」问题在**字符串形态**下也要处理：
  //    `BizDataVO.id`（`/api/v1/internal/system/*` 的部门与用户）是**字符串**，
  //    内容就是自增主键（"24" / "26"）。不归一的话两侧必然不同 ——
  //    实测就是这样挂的（契约场景「内部系统数据源写操作」）。
  //
  //    只归一**纯数字**字符串：UUID 与 32 位 hex 不受影响；
  //    而「一侧数字、一侧字符串」仍会被判为类型不符（数字分支在上面先命中），
  //    类型检查没有被削弱。
  if (typeof body === 'string' && /(^|\.)id$/i.test(path) && /^\d+$/.test(body)) return '<NUM>'

  if (typeof body === 'string') return normalizeString(body, literals)
  if (Array.isArray(body)) {
    return body.map((item, i) => normalizeBody(item, literals, `${path}[${i}]`))
  }
  if (body !== null && typeof body === 'object') {
    const out: Record<string, unknown> = {}
    // 保持键顺序：Object.entries 对字符串键按插入顺序返回
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = normalizeBody(v, literals, `${path}.${k}`)
    }
    return out
  }
  return body
}

/** UUID 出现在串中间时也要替换（如 `key:1:<uuid>` 形式的 processDefinitionId）。 */
const UUID_INLINE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g

/**
 * 32 位 hex 业务 ID 出现在串中间时也要替换。
 *
 * ⚠️ 踩坑：错误消息里会**回显自己刚生成的 id**
 *    （`数据源不存在: cc3693a34fb5482a8b616392572a32e9`）。golden 录制时的 id 与
 *    回放时 Node 生成的 id 必然不同，而 `PATTERNS` 里的 `^[0-9a-fA-F]{32}$` 是
 *    **整串**匹配，够不到嵌在句子里的 id —— 实测「数据源写操作」的
 *    `dswGetAfterDelete` 就是这样挂了唯一一处不一致。
 *
 *    归一化只抹掉「哪个 id」，**不削弱格式契约**：句子前缀、冒号、空格都还在，
 *    Node 若漏写 id 或写成 UUID，两侧仍会不等（<ID> vs <UUID> / 无占位符）。
 *
 * ⚠️ `\b` 两头卡死是刻意的：64 位 sha256 之类的长 hex 串**不会**被切出 32 位来误伤
 *    （串中间没有词边界），32 位 hex 后面接字母数字的标识符同样不受影响。
 */
const HEX32_INLINE = /\b[0-9a-fA-F]{32}\b/g

/**
 * 流程副本 key 的后缀：`_copy_<新 UUID 的前 8 位>`。
 *
 * ⚠️ Java `ProcessDesignService.copyProcess` 用
 *    `source.getKey() + "_copy_" + newId.substring(0, 8)` 生成副本 key，
 *    那 8 位是**每次复制都不同**的新 UUID 前缀 —— 不归一化的话，
 *    `POST /process-definitions/{id}/copy` 的响应两侧必然不同。
 *
 *    单独立一条规则而不是放宽整个 `key` 字段：key 的**格式**（源 key + `_copy_` + 8 位）
 *    本身是契约的一部分，只把那段随机后缀换掉才能既可比对、又留住格式约束。
 */
const COPY_SUFFIX_INLINE = /_copy_[0-9a-fA-F]{8}\b/g

function normalizeString(value: string, literals: string[]): string {
  let out = value
  for (const literal of literals) {
    if (literal !== '' && out.includes(literal)) {
      out = out.split(literal).join('<RUN>')
    }
  }
  // ⚠️ 字面量替换后必须继续走后续规则，不能提前 return ——
  //    否则像 `contract_flow_<RUN>:1:<uuid>` 这种「既含 runId 又含 UUID」的值里，
  //    UUID 会被漏掉，两侧永远不一致（实测踩到过）。
  for (const [re, placeholder] of PATTERNS) {
    if (re.test(out)) return placeholder
  }
  // 整串不匹配时，再做一次「串内 UUID / 串内 32 位 hex ID / 副本 key 后缀」替换
  return out
    .replace(UUID_INLINE, '<UUID>')
    .replace(HEX32_INLINE, '<ID>')
    .replace(COPY_SUFFIX_INLINE, '_copy_<ID8>')
}

/** 只保留与契约相关的响应头（Content-Type）。 */
const KEPT_HEADERS = ['content-type']

export function normalizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of KEPT_HEADERS) {
    const value = headers.get(name)
    if (value !== null) out[name] = value.toLowerCase()
  }
  return out
}


