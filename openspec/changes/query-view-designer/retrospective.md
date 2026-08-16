# Retrospective: query-view-designer

> Written: 2026-08-16（planning 階段預檢版本）
> Commit range: `--`（apply 尚未開始）
> Worktree: `.worktrees/query-view-designer/`

---

## 0. 預檢狀態

> 本 retro 於 `/opsx-ff`（fast-forward：只生成 artifacts）流程中產出。
> retrospective.md 規範上在 **apply 完成且 verify 通過後**才正式撰寫——本文件
> 標記為 planning 占位版本，apply 完成後必須重跑並覆蓋為正式 retro。
>
> 現有前置條件（本次可產出占位版本的原因）：
> - ✅ verify.md 存在（`openspec/changes/query-view-designer/verify.md`）
> - ✅ verify.md 的 Overall Decision 未標記為 `❌ FAIL`（當前為 NOT APPLICABLE）
>
> 以下量化數據於 apply 後填寫：

- **Commit range**: `<base-sha>..<head-sha>`（apply 後填）
- **Diff size**: 待 apply
- **Tasks done**: 0/68（tasks.md 全部 `- [ ]`，apply 後更新）
- **Active hours**: 待 apply
- **Subagent dispatches**: 待 apply
- **New external dependencies**: none（設計零新增依賴，沿用 form-create 生態）
- **Bugs encountered post-merge**: 待 apply
- **OpenSpec validate state at archive**: 待 apply 驗證
- **Test coverage signal**: 待 apply

**本次 planning 階段已產出 artifacts（8/8）**：

```
6f0b54e (base main) fix: 子表(subForm)内 LookupPicker/dataPicker 字段无法发现与配置
+ brainstorm.md / design.md / proposal.md
+ specs/query-view-definition/spec.md
+ specs/query-page-renderer/spec.md
+ specs/custom-page-designer/spec.md
+ tasks.md / plan.md / verify.md / retrospective.md
```

---

## 1. Wins（planning 階段觀察）

- [evidence: brainstorm.md] 六個決策點（數據源/配置內容/定義模型/一對多/消費方式/設計器形態）經 user 逐項確認才定稿，避免設計返工
- [evidence: design.md D2] "視圖編譯為 form-create rule"統一運行時的決策源於對專案既有 `FormRenderer.vue` 四處復用 + `formCreateInject` 先例的驗證，非紙上談兵
- [evidence: specs/query-view-definition] "發布不建表"以可測 Scenario（"不執行任何 CREATE TABLE / ALTER TABLE 語句"）固化成規格，壓縮 DDL-free 承諾
- [evidence: plan.md Task 4/5] 發布校驗拆分為 PageValidator（TDD 失敗路徑）+ ViewCompiler，職責單一、可獨立測試

## 2. Misses（planning 階段觀察）

- 🟡 [painful | evidence: verify.md §0] verify.md / retrospective.md 在 ff 流程中被迫早產——schema 的 `requires` 依賴鏈要求全 artifacts 產出，但這兩個 artifact 本質是 apply 後產物。已用占位版本標記，apply 後須覆蓋，否則 archive 時可能誤判驗證已過
- 📌 [nit | evidence: design.md D3] 視圖 schema 的 `events` 語法（trigger/target/actions）與未來 PAGE 軌的 form-create 原生事件語法並存，apply 時需明確兩者交集/邊界的文件化，避免用戶困惑

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| —（planning 階段，無 apply 對照） | — | — |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓（brainstorm.md 產出，全程引導設計討論） |
| superpowers:writing-plans | ✓（plan.md 產出，按 skill 結構分解微任務） |
| superpowers:using-git-worktrees | ✓（opsx-ff 自動 ensure-worktree） |
| superpowers:subagent-driven-development | ✗（apply 階段才使用） |
| (transitive) superpowers:test-driven-development | ✗（apply 階段才使用） |
| (transitive) superpowers:requesting-code-review | ✗（apply 階段才使用） |
| superpowers:finishing-a-development-branch | ✗（opsx-finish 階段才使用） |

### Deliberately Skipped Skills

> ff 流程產出 artifacts 不涉及實作，以下 skill 之 ✗ 為**流程階段性跳過**：

- **`superpowers:subagent-driven-development` / `test-driven-development` / `requesting-code-review` / `finishing-a-development-branch`**
  - **What was skipped**: 整個 skill（apply/verify/finish 階段才觸發）
  - **Why this cycle**: `/opsx-ff` 為 fast-forward 流程，只生成 artifacts 並 commit 回 main，**不寫實作碼**（plan.md Task 1-14 全部為 `- [ ]` 未勾選可證）。apply 前的實作 skill 無觸發情境
  - **How to prevent recurrence**: `scope-judgment rule` — `/opsx-ff` 的 scope 判定為「僅 artifacts 產出」，實作 skill 標記 ✗ 屬預期；`/opsx-apply` 開始後同 skill 必須 ✓，否則為真實違規

## 5. Surprises

- 專案前端並未實現 PRD 3.2.4 的事件腳本沙箱（grep 無 `new Function`/`eval`/sandbox 命中）——設計中 ScriptSandbox 屬**補足**而非復用，應用期需從零實現（plan.md Task 12 已覆蓋）
- `openspec.ps1`（PowerShell 包裝）啟動時報 `registry-utils.js` Join-Path 錯誤，但不影響命令執行——與 superpowers-bridge 的 openspec CLI 集成存在環境雜訊，未阻斷流程

## 6. Promote candidates → long-term learning

- [ ] 🟡 **ff 流程中 verify/retrospective 應標記 pre-apply 占位，避免 archive 誤判** → **Promote to schema**
  > **Why**: 本次 verify.md/retrospective.md 被迫早產，內容為 NOT APPLICABLE/占位，若 archive 流程按文件存在即驗證通過，會產生假陽性
  > **How to apply**: `/opsx-ff` 產出的 verify.md 應自帶「apply 後重跑」狀態標記（本變更已如此處理），schema 模板可考慮加入 pre-apply 標記自動化

- [ ] 📌 **`openspec.ps1` 啟動雜訊錯誤可忽略** → **One-off**（記錄即可,不 promote）
  > **Why**: `registry-utils.js` Join-Path 錯誤僅影響 PowerShell 包裝層的健康檢查，命令本體正常；屬環境特定問題，不具泛化價值
  > **How to apply**: 後續 cycle 若見同一錯誤，跳過並繼續執行即可，無需修復阻塞

---

> **Update pointer**: 本文件為 planning 占位版本。apply 完成、verify 正式通過後，須以真實 commit 數據與測試結果覆蓋重寫（不改寫原則不適用於占位版本本身）。