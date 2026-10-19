# 页面模板 · Schema 重映射算法实现方案

> 状态：设计稿（未实现）。范围仅覆盖**重映射核心算法**——另存模板、模板库 CRUD、导入绑定向导复用本算法，不在此方案内展开。
> 设计前提（2026-10-17 讨论结论）：模板全量保留配置；跨项目走导出文件制；数据源按 key 锚定、导入时重绑。

## 1. 问题定义

页面 schema（PageDesigner.vue:1417 保存为 4 段 JSON）：

```
{ rule, option, dataSources: [{ id, refId, searchFields? }], actions }
```

实例化（项目内新建页面）与导入（跨项目）共享同一步骤：

```
remap(parsedSchema, idMap) → { schema: parsedSchema', report }
```

纯函数、不修改入参（JSON clone 后原地改写）。`idMap: Record<旧dsId, 新dsId>` 由调用方构造：

- **实例化**：保持 refId 绑定不变，只生成新 `ds_xxx` ID；
- **导入**：先按 processKey / 数据源 key 在新项目解析出 refId（解析不到回退用户手选），再生成新 ID。refId 变更后的 `searchFields` 需按新实体 metadata 重新推导，无法推导时清空并记入报告。

## 2. 引用槽位清单（重映射面）

`ds_xxx` 的合法被引用位置，即算法要改写的全部槽位：

| # | 槽位 | 位置 | 证据 |
|---|---|---|---|
| D0 | `dataSources[].id` | schema 顶层 | ID 权威集合（PageDesigner.vue:377–383） |
| D1 | `props.dataSourceId` | 任意 rule 节点（含嵌套子节点） | 7 类数据组件 + dataPicker/LookupPicker（PageDesigner.vue:776–1038；option-datasource.ts:116） |
| D2 | `actions[].source`、`actions[].steps[].target` | 总线动作 | pageActionCatalog.ts:51,70；PageRendererPage.vue:567,581 |
| D3 | 链动作 `params[key='target'].value` | **委托类容器动作**（open-container / close-container / load-record / save-container，即 `CHAIN_ACTIONS` 中 `delegated=true` 的 4 个） | PageDataTable.vue:1077；候选目录来自设计器 dataSources（PageDesigner.vue:398–404） |
| D4 | 链动作 `params[key='recordId'].value` 内模板 | load-record，如 `$row.ds_` 前缀不存在则天然不涉及；仅当模板变量段恰为旧 ID 时改写（防御性，预期 0 命中） | PageDataTable.vue:957–960 |

链动作容器（D3/D4）在 rule 树中的**承载点**（递归遍历要覆盖）：

- `props.viewEvents[]`（表格/卡片整组件事件，EventsConfig 写入）
- `props.viewActions.actions[]`（操作按钮自定义链；注意键名错位：持久化键是 `actions`，TS 类型叫 `buttons`，PageDataTable.vue:197）
- `props.viewColumns[].onCellClick.actions[]`（列点击链）

**不改写**：`props.viewEvents[].target`（组件内部子区域名 table/search，PageDataTable.vue:1155–1158）；`$param.*`（路由参数）；`pageKey`（运行时注入，不在 schema）。

## 3. 算法

```
remapPageSchema(schema, idMap, opts) → { schema, report }

1  deep clone schema
2  walkRuleTree(schema.rule):                       # 递归 children，覆盖嵌套
3    ├─ 节点.props.dataSourceId ∈ idMap        → 改写（D1）
4    ├─ 收集节点内全部链动作容器（D3 承载点三类）
5    │   对 delegated op 且 params 含 key='target' → 值 ∈ idMap 才改写（D3）
6    └─ 非 delegated op 的 key='target' 值命中 idMap → 记 warn，不改（业务字段同名风险）
7  for a of schema.actions:                          # D2
8    a.source ∈ idMap → 改写；steps[].target ∈ idMap → 改写
9    steps[].field / value / recordId 模板变量段 → 对新旧数据源做字段比对（见 §4）
10 dataSources 整体重建：id=idMap[旧]，refId/searchFields 由调用方传入的绑定结果决定
11 悬空校验：全部槽位最终值必须 ∈ 新 ID 集合 ∪ ''，否则记 dangling（见 §4）
```

改写判定一律用**精确 ID 相等**（值 === 旧 dsId），不做子串替换——值模板里的 `$row.{id}` 字段名不是 ID 引用，误替换的唯一防线就是精确匹配 + 槽位白名单。

## 4. 校验与报告（report 结构）

| 类别 | 判定 | 级别 | 处理 |
|---|---|---|---|
| dangling | 槽位值 ∉ 已知 ds ID 集（历史脏引用） | error | 置空 + 报告列出组件 |
| field-missing | `steps[].field` / set-filter 参数名 / searchFields 在新实体不存在 | warn | **保留原值**，交用户处理（第一期不做字段自动映射） |
| script-ref | 脚本动作 `params.source` 含 `api.`（上下文引用 pageKey/refId） | warn | 列出所在组件，人工复核 |
| unknown-op | 链动作 type ∉ CHAIN_ACTIONS | warn | 原样保留（契约外遗留键先例：chainParamView 的 custom 标记） |
| key-conflict | 新 ds ID 与既有值碰撞 | error | 生成 ID 时按位加一重试 |

报告只提示不阻断（与"导入未匹配字段降级为丢弃+报告"的既定方向一致；dangling 置空属数据清理，不算阻断）。

## 5. ID 生成策略

`ds_` + `Date.now().toString(36)` + 序号后缀（同批多条目避免同毫秒碰撞）。**不用随机**——模板导出文件里 ID 稳定可读，预览 diff 友好。生成后先与 schema 内全部字符串值做一次碰撞扫描（key-conflict）。

## 6. 文件与接线

- 新增 `workflow_lowcode/frontend/src/views/page/templateSchema.ts`：纯函数（`remapPageSchema` / `buildIdMap` / `validatePageSchema`），不依赖 Vue。`validatePageSchema` 供后续"删除组件级联清理"复用同一套槽位遍历。
- 槽位判定从 `pageActionCatalog.ts` 读取（delegated 集合 `CONTAINER_OPS`、paramKinds），不另抄一份清单。
- 消费方（后续）：另存为模板（不调用 remap，原样入库）、实例化（idMap only）、导入（绑定结果 + idMap + searchFields 重推导）。

## 7. 测试计划（TDD）

样例 schema 覆盖：嵌套容器内 dataSourceId、三类链承载点各一条 open-container、总线 source+target 联动对、delegated 留空回退（不写 target 参数）、非 delegated 同名 target 值恰好等于 ds ID（warn 不改）、dangling、脚本含 api.。断言改写正确 + report 分类准确。

## 8. 开放点（实现时已核实）

1. ~~总线 `set-value` 的 target 语义~~ **已核实**：`executeStep`（PageRendererPage.vue:581–651）全部 op 的 target 都经 `componentRefs`/容器解析按 dataSourceId 寻址；唯 `reload-record`/`save-record` 不读 target（页面级操作），改写它们无害。
2. ~~page-chart `props.config`~~ **已核实**：`pageChartConfig.ts` 不含任何 ds/refId 引用，无需入槽位表。
3. `field-missing`（§4）**未落在 remap 内核**：字段存在性需新旧实体 metadata，属导入绑定向导职责；内核只保证 ID 引用正确。非委托动作同名 target 的告警类型实现为 `target-like-id`。
