# Verification Report

> 此檔案由 `openspec-verify-change` skill 於 apply 完成後產生，用以確認實作與 specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後再重跑 verify。

**Change**: `bizdata-extension-examples`
**Verified at**: `2026-09-06（占位）`
**Verifier**: `Sisyphus (opencode) — /opsx-ff artifact 生成階段`

> ⚠️ **占位狀態說明（PRECHECK 未通過）**
>
> 依 verify artifact 指令之 PRECHECK，需以下兩項證據皆 > 0 才產生正式報告：
> 1. Commit evidence（`git merge-base HEAD origin/main..HEAD` 提交數）
> 2. Task progress（`tasks.md` 中 `- [x]` 數量）
>
> 本變更目前處於 `/opsx-ff` 的 **artifact 生成階段**，`/opsx-apply` 尚未執行：
>
> ```text
> commits: 0   （worktree 分支尚無提交）
> done-tasks: 0 （tasks.md 全部為 - [ ]）
> ```
>
> 因此此份 verify.md 為**占位模板**，僅為滿足 schema 依賴鏈（plan → verify → retrospective）而存在。
> **必須在 `/opsx-apply` 完成實現後，重新執行 `openspec verify bizdata-extension-examples`（或依下方清單手動執行），並以真實結果覆寫本檔。** Verify 可多次重跑，每次以當前狀態覆寫。

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`

**結果**：

```text
<待 apply 後執行：openspec validate --all --json，確認本 change 與主 specs 全數 valid>
```

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變更為 `- [x]`

**未完成任務**（若有）：6 組任務（覆蓋聲明 / Support 拆分 / 守衛 / 接線 / emp / leave / 整體驗證）均待 `/opsx-apply` 實施。

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| 1.1-6.3 全部 | 實現階段尚未開始（ff 流程 artifacts 已備齊） | 是（apply 前不可 archive） |

---

## 3. Delta Spec Sync State

對每個 `openspec/changes/<name>/specs/` 下的 capability 目錄，與 `openspec/specs/<capability>/spec.md` 比對：

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| bizdata-handler-extension | ⏳ Needs sync | 新能力，apply 後 archive 時同步 |
| form-process-guard | ⏳ Needs sync | 新能力，apply 後 archive 時同步 |
| biz-extension-examples | ⏳ Needs sync | 新能力，apply 後 archive 時同步 |
| business-form-data | ⏳ Needs sync | 既有能力 delta（MODIFIED 4 個 requirement） |

---

## 4. Design / Specs Coherence Spot Check

抽樣比對 `design.md` 的決策是否反映在 `specs/*.md` 的 Requirements 與 Scenarios 中：

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| D1 覆蓋聲明（去 formKey、fail-fast、裝飾不執行） | bizdata-handler-extension：三個 Requirement 全覆蓋 | 覆蓋聲明/衝突檢測/裝飾不執行 | 無 |
| D2 BizDataSupport 拆解（無循環依賴） | bizdata-handler-extension：BizDataSupport 復用面 | 無 |
| D4 守衛契約與綁定（processKey、運行中禁改禁刪） | form-process-guard：四個 Requirement 全覆蓋 | 無 |
| D5 example 結構與全鏈路 | biz-extension-examples：四個 Requirement 全覆蓋 | 無 |

**漂移警告**（非阻塞）：

- 無

---

## 5. Implementation Signal

- [ ] Worktree 內無未 staged 的檔案
- [ ] 所有相關 commit 已推送

**Commit 範圍**（若知道）：`<from-sha>..<to-sha>` — 待 apply 後填寫。

---

## 6. Front-Door Routing Leak Detector（warning, 非阻塞）

偵測：

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [ ] 無檔案或存在的檔案是 schema 安裝前的合法存留

**洩漏清單**（若有）：無（brainstorm 已重定向至 `openspec/changes/bizdata-extension-examples/brainstorm.md`）。

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` 目前無 `[~]` deferred 標記之 task，本節不需填寫（空白即 PASS）。

---

## Overall Decision

- [ ] ✅ PASS — 可進入 finishing-a-development-branch / archive
- [ ] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify
- [x] ⏸️ **DEFERRED（占位）** — apply 尚未執行；`/opsx-apply` 完成後必須重跑本 verify 並覆寫

**下一步**：

在 worktree 對應分支執行 `/opsx-apply` 實現本變更（依 plan.md 的 TDD 微步驟），完成後回到此處以真實結果覆寫 verify.md 並做出 Overall Decision。