# Retrospective: backend-logic-config

> Written: 2026-08-03（**ff / artifacts 生成階段** — apply 尚未執行）
> Commit range: 待 apply 完成後填寫（`<base-sha>..<head-sha>`）
> Worktree: `.worktrees/backend-logic-config/`

> ⚠️ **本 retrospective 為 ff 階段的佔位**。apply 完成且 verify PASS 後，須以實際
> Evidence（commit range、diff size、tasks done、test coverage）覆蓋本文件並補齊
> §1–§6 分析。本文件目前僅記錄 plan 與 artifacts 層面的初判。

---

## 0. Evidence

> 量化前置數據 — apply 完成後以 `git log <base>..HEAD`、`tasks.md`、`verify.md` 重建。

- **Commit range**: （待 apply 後填 `base..HEAD`，N commits）
- **Diff size**: （待填）
- **Tasks done**: 0/17（`tasks.md` §1–§7，apply 尚未開始）
- **Active hours**: （待填）
- **Subagent dispatches**: n/a（本 change artifacts 由 orchestrator 直接產出）
- **New external dependencies**: `org.apache.groovy:groovy`（script 執行，版本由 Spring Boot BOM 管理；apply 時加）
- **Bugs encountered post-merge**: none（尚未 merge）
- **OpenSpec validate state at archive**: 「change」valid=true；既有 `bpmn-designer` 有 pre-existing ERROR（非本 change 引入）
- **Test coverage signal**: plan 規劃後端 JUnit5+Mockito、前端 Vitest；apply 後記錄

Commit chain（apply 後填）:

```
(base) <ff artifacts commit>
...
(head) <最後實作 commit>
```

---

## 1. Wins

- 本次 artifacts 已鎖定三個關鍵架構決策（事件監聽反查 / Bean 白名單 / Groovy），與既有 `wf_node_config` 儲存無縫接軌。[evidence: `brainstorm.md`、`design.md`]
- 前端儲存「零表結構變更」——僅擴充 `NodeConfigData.backendLogic`，避免 schema 遷移。[evidence: `plan.md` Task 1]

## 2. Misses

（apply 後補）

- 🟡 [painful | evidence: apply 時填] <description>

## 3. Plan deviations

（apply 後補）

| Plan task | What changed | Why |
|-----------|--------------|-----|
| —         | —            | —   |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming              | ✓ （brainstorm.md 已產出） |
| superpowers:writing-plans              | ✓ （plan.md 已產出） |
| superpowers:using-git-worktrees        | ✓ （worktree 建置） |
| superpowers:subagent-driven-development | （apply 階段確認） |
| (transitive) superpowers:test-driven-development | （apply 階段確認） |
| superpowers:finishing-a-development-branch | （apply+finish 階段確認） |

### Deliberately Skipped Skills

（apply 完成後如跳過任何 apply skill，填寫；artifacts 階段全綠）

## 5. Surprises

- `docs/superpowers/specs/*.md` 存在 3 個 schema 安裝前的舊規格檔，非本 change 輸出——已於 verify §6 確認非洩漏。[evidence: verify.md §6]

## 6. Promote candidates → long-term learning

- [ ] 🟡 **既有 spec `bpmn-designer` 缺 SHALL/MUST keyword，`openspec validate` 全域報 ERROR** → **Promote to project CLAUDE.md/fragment**（或改 `openspec/specs/README.md`）
  > **Why**: 既有 spec 於 schema 安裝前寫成，`validate --all` 將此 pre-existing ERROR 混入本次 change 的驗證結果，易誤判本次 scope 問題。
  > **How to apply**: 任一新 change 的 verify 若見非本 change 的既有 spec ERROR，於 server pre-existing 標註，勿視為本次失敗。

- [ ] 📌 **Groovy 沙箱安全為設計時間的已知 trade-off** → **One-off**（design.md D5 已記錄，非新見解）
  > **Why**: 偏 fetch 於編譯 allow-list 而非完整沙箱，屬工程取捨而非意外的發現。