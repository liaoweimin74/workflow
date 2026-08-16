# Verification Report

> 此檔案由 `openspec-verify-change` skill 在 apply 完成後產生，用以確認實作
> 與 specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後
> 再重跑 verify。

**Change**: `query-view-designer`
**Verified at**: `2026-08-16`（planning 階段預檢）
**Verifier**: Sisyphus（orchestrator）

---

## 0. 預檢狀態（apply 尚未執行）

> IMPORTANT timing note：verify.md 規範上是在 **apply 階段完成後**才執行的
> 正式驗證。本次為 `/opsx-ff`（fast-forward：只生成 artifacts，不下實作碼）
> 流程的一部分，apply 尚未開始，因此以下檢查目前不可執行：
>
> 1. Commit evidence：`git log --oneline <merge-base>..HEAD | wc -l`
>    → 目前僅有 artifacts commit（尚未產生實作 commit）
> 2. Task progress：`grep -c '^- \[x\]' tasks.md`
>    → 目前全部 `- [ ]`（0 個勾選）
>
> 兩個預檢皆須 > 0 才能執行完整驗證。**本檔案於 apply 完成後必須重跑並覆蓋。**

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`（待 apply 後執行）

**結果**：

```text
<apply 完成後執行 openspec validate --all --json 並貼上摘要>
```

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變為 `- [x]`（待 apply 後執行）

**未完成任務**（若有）：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| — | — | — |

> 預期：`13.x`（階段二：自定義頁面軌）為跨階段範圍，apply 一期可能保留
> `- [ ]`，屆時於此記錄理由並判定是否阻塞 archive。

---

## 3. Delta Spec Sync State

對每個 `openspec/changes/<name>/specs/` 下的 capability 目錄，與
`openspec/specs/<capability>/spec.md` 比對：

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| `query-view-definition` | ✗ 待 sync | archive 後寫入 openspec/specs/ |
| `query-page-renderer` | ✗ 待 sync | archive 後寫入 openspec/specs/ |
| `custom-page-designer` | ✗ 待 sync | archive 後寫入 openspec/specs/（階段二能力，隨本變更一併定稿） |

---

## 4. Design / Specs Coherence Spot Check

抽樣比對 `design.md` 的決策是否反映在 `specs/*.md` 的 Requirements 與
Scenarios 中：

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| 發布不建表（D5） | publish 不調用 DynamicTableManager、不執行 DDL | query-view-definition「视图定义发布（不建表）」Requirement + Scenario | 無 |
| 獨立 wf_page_def（D1） | 獨立表 + PageDefinition 實體 | query-view-definition「视图定义创建」引用 /api/v1/pages | 無 |
| 雙層事件（D4） | 聲明式動作鏈 + ScriptSandbox | query-view-definition「视图声明式事件」+「视图脚本事件（沙箱执行）」 | 無 |
| 查詢白名單（D6） | filter 僅接受 schema 聲明字段 | query-page-renderer「页面数据查询 API」Scenario「查询未声明的字段被拒绝」 | 無 |
| 頁面軌綁定（D7） | PageDataSource 注入 | custom-page-designer「数据源绑定与注入」 | 無 |

**漂移警告**（非阻塞）：

- 無

---

## 5. Implementation Signal

- [ ] Worktree 內無未 staged 的檔案（待 apply 後執行）

**Commit 範圍**（若知道）：`--`（apply 尚未開始）

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

偵測:

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] 無檔案，或存在的檔案是 schema 安裝前的合法存留

**洩漏清單**（若有）：

| 檔案 | 內容是否已 captured 進 change | 建議動作 |
|---|---|---|
| — | — | — |

> 本變更的 brainstorming/design 已全部輸出至
> `openspec/changes/query-view-designer/`，無洩漏。
> 注意：規劃階段曾嘗試寫 `docs/superpowers/specs/2026-08-16-view-designer-design.md`
> （被多次中斷未寫成），現有內容已完整 captured 進 change 目錄的 design.md。

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md 目前無 `[~]` deferred 標記（全部 `- [ ]`），本節空白即 PASS。

---

## Overall Decision

- [ ] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [x] ⏸️ NOT APPLICABLE（planning 階段）— 於 apply 完成後重跑本驗證

**下一步**：

執行 `/opsx-apply` 依 plan.md 實作。實作完成、tasks.md 全部勾選後，
重跑本 verify.md（覆蓋為正式版本），再進入 `/opsx-finish`（merge + archive）。