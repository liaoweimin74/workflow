# Verification Report

> 此檔案由 `openspec-verify-change` skill 在 apply 完成後產生。本文件由 `/opsx-ff` 生成骨架，**已在 `/opsx-apply` 实现后填充**。

**Change**: `array-value-text-columns`
**Verified at**: `2026-09-05 12:20`
**Verifier**: `主代理（Sisyphus）`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] 全數 items `"valid": true`

**結果**：

```text
openspec validate --all --json → 97 items 全部 "valid": true
（修复：array-value-label-columns/spec.md 头部由 ## Requirements 改为 ## ADDED Requirements）
```

若有失敗項目，列出 id + issues：

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] 所有 `- [ ]` 已變為 `- [x]`（7 组 21 任务全部完成）

**未完成任務**（若有）：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

對每個 `openspec/changes/<name>/specs/` 下的 capability 目錄，與
`openspec/specs/<capability>/spec.md` 比對：

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| `array-value-label-columns` | 待 sync（新能力） | 由 `/opsx-finish` 合并时同步到主 specs |
| `biz-form-json-multi-values` | 待 sync | 实现完成，delta 待 sync |

---

## 4. Design / Specs Coherence Spot Check

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| 双列生成（主列 JSON + text 列） | §Decisions 1 | array-value-label-columns Req 1 / delta Req 1 | 一致 |
| cascader emitPath=false 叶子值 | §Decisions 2 | Req 2 | 一致 |
| 前端生成 label | §Decisions 3 | Req 3 | 一致 |
| 显示走 text 列 | §Decisions 4 | Req 4 | 一致 |
| 模糊 LIKE + 精确 JSON_CONTAINS | §Decisions 5 | Req 5 / Req 6 | 一致 |
| 回显走 value | §Decisions 6 | Req 7 | 一致 |

**漂移警告**（非阻塞）：

- 无

---

## 5. Implementation Signal

- [x] Worktree 內無未 staged 的檔案（统一提交后）
- [ ] 所有相關 commit 已推送（feature 分支，待 `/opsx-finish` 合并）

**Commit 範圍**（若知道）：`2d3e9b7`（artifacts）.. `de90a8f`（7 任务实现）、`d0ccac7`（方案 A：select 单选统一 JSON 双列）

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

- [ ] 無檔案,或存在的檔案是 schema 安裝前的合法存留

**洩漏清單**（若有）：

| 檔案 | 內容是否已 captured 進 change | 建議動作 |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md 无 `[~]` 標記 row，本節不適用（空白即 PASS）。

---

## Overall Decision

- [x] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [ ] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意：`<說明>`
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**驗證摘要**：
- 前端 vitest：73 文件 891 测试全过（含方案 A 后）；vue-tsc 无新增错误（arrayValueLabel/ColumnConfigDialog 改动文件类型干净，其余为既有错误集）
- 后端 mvn test：821 测试，仅 1 个既有失败（PageDefinitionPublishIntegrationTest.publish_sameContent_rejectedAsUnchanged，stash 隔离验证与本次改动无关）
- openspec validate：97 项全部 valid
- 实现覆盖：后端列映射双列生成（ColumnTypeMapper）、前端列映射双列生成（ColumnConfigDialog）+ cascader emitPath=false、提交生成 label（arrayValueLabel + BizDataListPage）、列表显示走 text 列（BizDataListPage/PageDataTable）、模糊查询走 text LIKE + 精确查询走 JSON_CONTAINS/JSON_OVERLAPS（BizDataQueryBuilder + BizDataService）
- 方案 A（select 单选统一 JSON，commit `d0ccac7`）：`isArrayComponent`/`mapComponentToColumn` 对 select 一律 JSON+text 双列（前后端同步），查询全走 `_text` 列；select 单选提交单值字符串存 JSON 列，读回单值兼容回显；ColumnTypeMapperTest 44/44、ColumnConfigDialog 39/39、arrayValueLabel 12/12
- 回显兜底修复（`injectFallbackOptions` + FormRenderer 接入）：数组组件 options 无匹配时用 `<key>_text` 注入 `{value, label}` 兜底显示，避免显示原始 value（覆盖异步数据源未就绪/类型不匹配/静态缺失）；arrayValueLabel.test.ts 新增 8 用例（20/20）、FormRenderer.test.ts 36/36；前端全量 73 文件 899 测试全过，vue-tsc 无新增错误
- `_text` 生成修复（commit 待定）：①树形/级联显示文本改全路径 `/` 分割（tree/elTreeSelect 由叶子 label 改 collectPathLabels）；②提交用渲染时解析后选项（FormRenderer.getFormData 基于 resolvedSchema 跑 withArrayLabels，BizDataListPage 已有 `_text` 不覆盖）；arrayValueLabel 21/21、FormRenderer 37/37；前端全量 73 文件 901 测试全过，vue-tsc 无新增错误
- cascader emitPath 修复（commit 待定）：①`emitPath=true`（存量/已配置）提交值为路径数组，buildText 按路径段映射 label 并 `/` 连接（修掉"逗号分割多值"）；`injectFallbackOptions` 对 cascader emitPath=true 跳过注入（单节点无法重建树路径）；②`_text` 覆盖策略改"值可映射覆盖、纯回退保留"，编辑改值后 `_text` 与 value 一致；arrayValueLabel 25/25；前端全量 73 文件 905 测试全过，vue-tsc 无新增错误
- 级联/树形统一规范（commit 待定）：①主列统一叶子 value 数组（`toLeafArray`：单选单值 → `[v]`、cascader emitPath=true 路径数组 → 取叶子）；②`_text` 带前导 `/` 完整路径（`/总公司/武汉分公司`），多选逗号无空格连接；③编辑框回显 `normalizeEchoData` 单选数组解包为单值（兼容存量路径数组）+ 注入叶子 label 兜底；④表格列显示 `leafDisplayText` 取叶子 label（BizDataListPage/PageDataTable）；arrayValueLabel 34/34、FormRenderer 37/37、BizDataListPage 11/11、PageDataTable 11/11；前端全量 73 文件 914 测试全过，vue-tsc 无新增错误
- select `_text` 覆盖 + 树形回显修复（commit 待定）：①`buildText` 返回 `{text, mapped}`，walk 用 mapped 决定覆盖——修复多选双跑（FormRenderer 生成正确 `_text` → BizDataListPage 用原始 schemaRules 再跑因选项缺失回退 value，原 `join(',')` vs `join(', ')` 分隔符误判为"映射成功"覆盖为 value）；②树形/级联**移除兜底注入**（根级孤立节点污染树结构导致"选择节点不对"），仅扁平组件（select/checkbox）保留注入；③树形回显显示全路径：`annotateFullPath` 递归注解 `fullPath`（前导 `/`）+ 显示 label 字段指向 `fullPath`（用户未自定义时）；arrayValueLabel 37/37；前端全量 73 文件 917 测试全过，vue-tsc 无新增错误
- 回显类型匹配修复（commit 待定）：`injectFallbackOptions.hasOption` 改**严格类型比较**——数据源 select（valueField=id 数字）主列存 `'7'`（字符串）读回后与 option value `7`（数字）类型不匹配，原 String 容错判定"有匹配"→ 不注入兜底 → el-select 显示原始 value；严格比较后注入 `{value:'7', label:_text}` 兜底项，组件显示 label；arrayValueLabel 38/38、FormRenderer 38/38；前端全量 73 文件 919 测试全过，vue-tsc 无新增错误

**下一步**：`/opsx-finish` 合并 worktree 到 main、同步 delta specs、归档。
