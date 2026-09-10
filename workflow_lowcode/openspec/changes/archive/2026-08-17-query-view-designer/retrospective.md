# Retrospective: query-view-designer

> Written: 2026-08-17（apply 完成、verify 正式 PASS 後）
> Commit range: `240b33e..f4f07e5`（33 commits）
> Worktree: `.worktrees/query-view-designer/`

---

## 0. Evidence

> 量化前置數據 —— 後續 Wins / Misses bullets 直接引用，避免每行重複 `[evidence: ...]`。

- **Commit range**: `240b33e..f4f07e5`（33 commits）
- **Diff size**: +37327 / -53 lines across 212 files
- **Tasks done**: 66/69（`grep -cE '^\s*- \[x\]' tasks.md` = 66；3 項為手動驗收活動，見 verify.md §2）
- **Active hours**: 約 16h（planning 2026-08-16 跨 apply 至 2026-08-17，歷經多次 session 壓縮/續跑）
- **Subagent dispatches**: n/a（用戶於 UI 任務明示「不要子代理，你自己完成」；全流程主 agent 直接實施）
- **New external dependencies**: none（數據源/視圖/頁面軌全程沿用 spring-boot + form-create 生態，零新依賴）
- **Bugs encountered post-merge**: 0（尚未 merge；worktree 內 regression 2 件：BizDataListPage colorPicker VNode、DataPickerCreateDialog emit 層級，均於 merge 前修復）
- **OpenSpec validate state at archive**: pass（`openspec validate query-view-designer` → "is valid"）
- **Test coverage signal**: 前端 vitest 343/343（27 files）+ `vue-tsc --noEmit` EXIT=0 + 後端 mvn 510 tests 0 failures

Commit chain（時序，節選關鍵節點）：

```
240b33e (base merged main)
0f2263b change: query-view-designer
0eaa86a feat(page): V20 創建 wf_page_def / wf_data_source 表與頁面、數據源管理菜單
c4109f6 feat(page): PageDefinition 實體與 Repository
c152179 feat(page): PageDefinitionService CRUD（不含發布）
485a3f4 feat(page): 發布校驗器 PageValidator
9deea95 feat(page): 視圖編譯 ViewCompiler + 發布（不建表）
017dbb1 feat(page): 頁面 CRUD/Publish/Data 查詢 API
0536b58 test(page): 發布/查詢/白名單/並發 集成測試
5839a8b feat(datasource): 全局數據源管理（狀態機 + Adapter SPI）
e99a132 feat(page): 前端 pageApi/dataSourceApi 與路由
5e3c6ba feat(page): PageListPage / c286424 ViewDesigner / ee7cabb DataSourceListPage
5b37034 feat(page): 通用渲染頁 PageRenderer
88eaf96 feat(page): ScriptSandbox 沙箱腳本執行
94749e7/3c8ebad feat(page): PAGE 軌後端 + 前端（FcDesigner 設計器）
77e9fed fix(page): PageQueryController 白名單校驗 / d410748 fix(bizdata): filter range
9b6cb16/eb0ed8a docs(datasource): 統一接口設計
129c3e9 Merge branch 'main'
ec10095 feat(datasource): 數據源統一接口後端實施（Adapter SPI + 六端點 + 測試）
f4f07e5 feat(datasource): 前端 UI normal 化（去除 size=small/小字體）+ TS 修復與測試
```

---

## 1. Wins

- [evidence: 0eaa86a + PageDefinitionPublishIntegrationTest `publishViewPage_success_withoutDdl`] 「發布不建表」承諾以可測 Scenario 固話並有整合測試直接斷言，DDL-free 從口號變為回歸屏障
- [evidence: ViewCompilerTest + PageValidatorTest] 發布校驗（PageValidator）與編譯（ViewCompiler）職責單一拆分，失敗路徑（隱藏列/JSON·TEXT 搜索字段/未知 matchType/未發布綁定表單）全部有測試覆蓋
- [evidence: PageQueryControllerTest `flatFilter_withinWhitelist_passesThrough` + `queryData_unknownField_rejected400`] 查詢 filter 白名單化 + 租戶強制過濾在 controller 層有整合測試，安全邊界清晰
- [evidence: 5839a8b + Form/Api/SystemDataSourceAdapter + 各 AdapterTest] 全局數據源 SPI 三態適配器（FORM/API/SYSTEM）獨立實現且各帶測試，為「統一接口」後續演進留足擴展點
- [evidence: f4f07e5] UI normal 化一次性覆蓋 12+ 組件（去除 `size="small"`、12/13px→14px），前端 343 測試仍全綠，證明 normal 化改動低風險高覆蓋
- [evidence: BizDataListPage.vue render 回歸修復 + DataPickerCreateDialog emit 修復] TS 修復引入的兩處 runtime regression（`String()` 包裹破壞 colorPicker VNode、emit 層級取錯）均被測試/自查捕獲並於 merge 前修復，未被帶入 main

## 2. Misses

- 🟡 [painful | evidence: tasks.md 於 finish 時仍 0/69 勾選] **tasks.md 勾選狀態未隨 apply 增量維護**，全部 69 項直到 finish 階段才批量勾選（66 項），失去「任務級進度信號」；3 項手動驗收活動（13.7 e2e / 14.2 / 14.3）因無自動化證據只能保留未勾選 → 見 §6 Promote candidate #1
- 🟡 [painful | evidence: 129c3e9 merge + V20 命名] **plan 預定 V19 遷移被既有 V19__form_def_add_type_and_column_config.sql 佔用**，實際落地為 V20__create_wf_page_def.sql —— plan.md Task 1 文件命名與實際偏差，起因是跨變更並行（其他變更先佔用 V19）；未造成傷害但 plan 與實際文件名的映射需靠人肉對齊
- 🟡 [painful | evidence: ec10095 與 9b6cb16 範圍膨脹] **變更範圍在 apply 中段膨脹**：原 plan 為「視圖軌 + 全局數據源管理」，中段加入「數據源統一接口設計」+ 後端六端點 + 前端 UI normal 化，33 commits 中約 1/3 超出原始 plan 邊界 → §3 Plan deviations
- 📌 [nit | evidence: openspec.ps1 shim 報錯] **PowerShell shim 啟動雜訊**（`Join-Path` 參數綁定錯誤）每次 openspec 命令都打印兩行紅字，但命令本體正常執行；環境特定，不阻斷流程

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1（V19 遷移） | 實際落地為 `V20__create_wf_page_def.sql` | V19 已被並行變更的 `V19__form_def_add_type_and_column_config.sql` 佔用，遷移版本號順延 |
| Task 7.1（PageDefinitionServiceTest） | 拆分為 PageDefinitionServicePublishTest + PageDefinitionPublishIntegrationTest | 發布路徑（鎖/DDL-free/並發/同內容拒絕）與 CRUD 路徑測試關注點分離，更貼合測試目的 |
| 7A.4（SYSTEM/API 未啟用佔位） | API/SYSTEM 適配器實作完整佔位邏輯+測試，非簡單返回未啟用 | 「統一接口」設計（9b6cb16）將三段適配器提升為完整 SPI 落地，擴充點一次到位 |
| 13.x（階段二 PAGE 軌，原訂預留） | PAGE 後端（94749e7）+ PAGE 前端（3c8ebad）+ ScriptSandbox（88eaf96）等階段二能力隨本變更一併實現 | 階段二與階段一共用同一數據層/渲染器，實作成本遠低於預估，提前交付 |
| （無 plan 對應） | 新增「數據源統一接口」設計文件（docs/superpowers/specs/2026-08-17-data-source-unified-api-design.md）+ 後端六端點（ec10095）+ 前端 UI normal 化（f4f07e5） | 用戶於 apply 中段提出統一接口與 UI 規範化訴求，範圍動態擴張 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（brainstorm.md，六決策點逐項用戶確認） |
| superpowers:writing-plans                        | ✓（plan.md，微任務分解） |
| superpowers:using-git-worktrees                  | ✓（.worktrees/query-view-designer/ 全程隔離） |
| superpowers:subagent-driven-development          | ✗（用戶明示禁止子代理） |
| (transitive) superpowers:test-driven-development | ✓（0536b58 集成測試、各 Service/Validator/Compiler/Adapter 測試先於或伴隨實作；regression 修復均有對應測試） |
| (transitive) superpowers:requesting-code-review  | ✗（無正式 code review round） |
| superpowers:finishing-a-development-branch       | ✓（本流程進行中） |

> **Default expectation**: 全部 ✓。任一行 ✗ 都必須在下方提出原因與預防方案。

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整個 skill（plan.md 的任務執行改由主 agent 直接實施，無 subagent 調度）
  - **Why this cycle**: 用戶在 UI normal 化任務明示「不要子代理，你自己完成」（turn-local 指示），主 agent 直接執行所有 plan 任務；非流程失誤
  - **How to prevent recurrence**: `scope-judgment rule` — 用戶明示「你自己完成」時，SDD skill 標 ✗ 屬預期且不可視為違規；下個無人為指示的 cycle 應恢復 SDD 調度

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 整個 skill（無正式 review 環節）
  - **Why this cycle**: 用戶全程在場驅動 + 每階段同步驗證（343/510 測試全綠、vue-tsc 0 error），主 agent 自查捕獲 2 處 runtime regression；無獨立 reviewer 觸發點
  - **How to prevent recurrence**: `skill description tightening` — 於 finish 階段（本 skill 觸發點）主動以「合併前選項展示 + 用戶決策」取代形式化 review round；若用戶選擇 PR，則 review 在 PR 上自然發生

## 5. Surprises

- [evidence: 88eaf96 之前無 grep 命中] 規劃期假設「前端已有事件腳本沙箱可復用」是錯的（無 `new Function`/eval 命中），ScriptSandbox 是從零實現而非復用 — 與 planning retro §5 觀察一致
- [evidence: ec10095/f4f07e5 佔 33 commits 約 1/3] 用戶在 apply 中段追加「數據源統一接口」+「UI normal 化」兩大塊範圍，原 plan 的「階段二預留」也被提前實施 — 變更最終規模（212 files / +37k lines）約為 planning 估計的 2-3 倍
- [evidence: BizDataListPage 修復] 純 TS 型別修復（`String()` 包裹 / emit 型別）會引入 runtime 行為回歸——型別正確 ≠ 行為正確，VNode/事件層級必須靠實際渲染測試佐證

## 6. Promote candidates → long-term learning

- [ ] 🟡 **tasks.md 勾選必須隨 apply 增量維護，不可堆到 finish 批量處理** → **Promote to schema**
  > **Why**: 本次 69 項在 finish 時仍 0 勾選，批量勾選喪失任務級進度信號，且導致 3 項手動驗收活動只能事後憑證據標未勾選
  > **How to apply**: apply 每個 plan task 完成即於 tasks.md 勾選對應項；finish 階段僅核對勾選與實作一致性，不做批量補勾

- [ ] 🟡 **plan 的遷移版本號預留機制：plan 不鎖死具體 V{n}，改為「下一個可用版本號」** → **Promote to CLAUDE.md**（`AGENTS.md`）
  > **Why**: V19 被並行變更佔用導致落地檔名與 plan 偏差，人肉對齊成本高
  > **How to apply**: writing-plans 階段不寫死 `V{n}__`，改寫「創建下一個版本號遷移檔」；落地時以實際命名為準並在 §3 記錄

- [ ] 📌 **`openspec.ps1` shim 啟動雜訊可忽略** → **One-off**（記錄即可，不 promote）
  > **Why**: Join-Path 參數綁定錯誤僅影響 PowerShell 包裝層健康檢查，命令本體正常；環境特定問題，不具泛化價值
  > **How to apply**: 後續 cycle 若見同一錯誤，跳過並繼續執行即可，無需修復阻塞

- [ ] 📌 **範圍在 apply 中段動態膨脹（統一接口 + UI normal 化）是本次變更規模翻倍的根因** → **One-off**（記錄即可，不 promote）
  > **Why**: 由用戶 turn-local 決策驅動，非法則可套用；此類「中段追加範圍」為用戶主導的正常演進，非流程缺陷
  > **How to apply**: 遇到同類中段追加時，主動在 verify.md §3 記錄範圍變化並重估 tasks 勾選，不強行壓縮