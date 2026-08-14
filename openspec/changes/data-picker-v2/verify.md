# Verification Report

> 此檔案由 `openspec-verify-change` skill 於 apply 完成後產生，用以確認實作
> 與 specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後
> 再重跑 verify。

**Change**: `data-picker-v2`
**Verified at**: `PENDING — apply 階段尚未開始`
**Verifier**: `—`

---

## 狀態說明

本檔案為 `/opsx-ff` 流程產生的占位版本：`verify.md` 依 schema 規定必須在
**apply 階段完成後**生成正式報告（PRECHECK 要求 commit evidence 與 tasks.md
`- [x]` 數量均 > 0）。

當前狀態：
- apply 尚未執行（無實現 commit）
- tasks.md 所有項均為 `- [ ]`

**正式驗證流程**：實現完成後執行 `/opsx-verify`（或等效檢查），按下列檢查清單
重跑並覆寫本檔案：

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變更為 `- [x]`

## 3. Delta Spec Sync State

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| data-picker | PENDING | apply 後與 `openspec/specs/data-picker/spec.md` 比對 |

## 4. Design / Specs Coherence Spot Check

- [ ] 待 apply 後抽樣比對

## 5. Implementation Signal

- [ ] Worktree 內無未 staged 檔案
- [ ] 所有相關 commit 已推送

## 6. Front-Door Routing Leak Detector（warning, 非阻塞）

- [ ] 待檢查 `docs/superpowers/specs/*.md`

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

- [ ] plan.md 無 `[~]` 標記（本節空白即 PASS）

## Overall Decision

- [x] ⏸️ DEFERRED — 占位文件；apply 完成後由 `/opsx-verify` 生成正式報告

**下一步**：執行 `/opsx-apply` 開始實現，完成後重跑本檢查並覆寫此檔案。
