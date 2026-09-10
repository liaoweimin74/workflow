# Verification Report

> 此檔案由 `openspec-verify-change` skill 於 **apply 完成後**產生，用以確認實作與
> specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後再重跑 verify。

**Change**: `table-column-customization`
**Verified at**: `(待 apply 階段填入)`
**Verifier**: `(待 apply 階段填入)`

> ⚠️ **占位骨架（規劃期 / `/opsx-ff` 產出）**
>
> 本變更目前僅完成全部 artifacts 的規劃生成（brainstorm/design/proposal/specs/tasks/plan）。
> 依 OpenSpec 規則，verify.md 與 retrospective.md 必須在 **apply 階段（實作完成）之後**才產生：
>
> - 本文件現階段 precheck 預期失敗（`git log` commit 數 = 0、tasks.md 無 `- [x]`）——
>   屬正常規劃期狀態，**非**失敗。
> - 待 `/opsx-apply` 完成實作後，執行 `/opsx-verify` 重跑下列檢查並**覆寫本文件**。
> - 下方保留標準模板結構，供 apply 後直接填寫。

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`

**結果**：

```text
<apply 完成後貼上 openspec validate --all 的輸出摘要>
```

若有失敗項目，列出 id + issues：

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變為 `- [x]`

**未完成任務**（若有）：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| table-column-customization | 待 apply 後比對 | 需 sync 至 `openspec/specs/table-column-customization/` |
| page-data-table | 待 apply 後比對 | ADDED requirements 需 sync |
| query-page-renderer | 待 apply 後比對 | ADDED requirements 需 sync |

---

## 4. Design / Specs Coherence Spot Check

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| D1 公共渲染模組 | `tableColumnRenderer` 統一取值/渲染 | specs/table-column-customization 「公共列渲染模組」 | 一致 |
| D2 evalCellExpression | scriptSandbox 帶返回值求值 | specs/table-column-customization 「動態內容」 | 一致 |
| D5 列級 onCellClick | 命中列短路整表級 | page-data-table / query-page-renderer ADDED | 一致 |

**漂移警告**（非阻塞）：無

---

## 5. Implementation Signal

- [ ] Worktree 內無 unstaged 的檔案
- [ ] 所有相關 commit 已推送

**Commit 範圍**（若知道）：`(apply 完成後填入)`

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

偵測:

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [ ] 無檔案；或存在的檔案為 schema 安裝前的合法存留

**洩漏清單**（若有）：無

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md 中無 `[~]` 標記之 deferred 手動 dogfood row，本節留白即 PASS。

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | 真正 gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [x] ⚠️ PASS WITH WARNINGS — 規劃期占位，待 apply 完成後重跑 verify 覆寫本文件
- [ ] ✅ PASS — 可進入 finishing-a-development-branch / archive
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**下一步**：執行 `/opsx-apply` 完成實作，再執行 `/opsx-verify` 覆寫本文件並填寫 retrospective。
