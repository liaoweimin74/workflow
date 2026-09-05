# Verification Report

> 此檔案由 `openspec-verify-change` skill 在 apply 完成後產生。本文件由 `/opsx-ff` 生成骨架，**待 `/opsx-apply` 实现后填充**。

**Change**: `array-value-text-columns`
**Verified at**: `TBD (apply 完成后填写)`
**Verifier**: `TBD`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`

**結果**：

```text
TBD
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

對每個 `openspec/changes/<name>/specs/` 下的 capability 目錄，與
`openspec/specs/<capability>/spec.md` 比對：

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| `array-value-label-columns` | N/A（新能力） | 实现后 sync |
| `biz-form-json-multi-values` | 待 sync | 实现后按 delta 更新主 spec |

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

- [ ] Worktree 內無未 staged 的檔案
- [ ] 所有相關 commit 已推送

**Commit 範圍**（若知道）：`TBD`

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

- [ ] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [ ] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意：`<說明>`
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**下一步**：`/opsx-apply` 实现后运行 `openspec-verify-change` 填充本报告。
