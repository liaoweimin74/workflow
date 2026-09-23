# Verification Report

> 此檔案由 `openspec-verify-change` skill 在 apply 完成後產生，用以確認實作
> 與 specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後
> 再重跑 verify。

**Change**: `process-config-and-version`
**Verified at**: `PENDING — apply 阶段完成后重跑`
**Verifier**: `<who / which agent>`

> ⚠️ **状态说明（占位）**：本文件在 `/opsx-ff`（fast-forward）阶段创建。
> verify.md 须在 apply 阶段（实现完成后）重新生成——届时执行 PRECHECK
> （commit 计数 + tasks `[x]` 计数均 > 0）后，按下列检查清单逐项执行并覆盖本文件。

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全數 items `"valid": true`

**結果**：

```text
<PENDING — apply 后运行 openspec validate --all>
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
| process-operation-policy | ✗ 待 apply 後 sync | 新 capability |
| deploy-change-detection | ✗ 待 apply 後 sync | 新 capability |
| process-version-history | ✗ 待 apply 後 sync | 新 capability |
| task-transfer | ✗ 待 apply 後 sync | delta |
| task-detail | ✗ 待 apply 後 sync | delta |
| bpmn-designer | ✗ 待 apply 後 sync | delta |

---

## 4. Design / Specs Coherence Spot Check

抽樣比對 `design.md` 的決策是否反映在 `specs/*.md` 的 Requirements 與
Scenarios 中：

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| D1 流程级操作权限总控 | `approvalPolicy.operations` 四开关 + AND 生效 | process-operation-policy §1/§2 | 无 |
| D2 转办/转签合并 | 统一 `setAssignee`，forward-sign 保留兼容 | task-transfer delta | 无 |
| D3 部署 hash | SHA-256(XML + 规范化 nodeConfigMap) | deploy-change-detection §1/§2 | 无 |
| D4 历史版本 | `/key/{key}/versions` + `/versions/{procDefId}/editor` + 只读设计器 | process-version-history §1-§4 | 无 |

**漂移警告**（非阻塞）：

- 無（plan 阶段已修正 D2 实现路径：MI 节点统一 setAssignee，非 ForwardSignService 路由）

---

## 5. Implementation Signal

- [ ] Worktree 內無未 staged 的檔案
- [ ] 所有相關 commit 已推送

**Commit 範圍**（若知道）：`<PENDING — apply 后填写>`

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

偵測:

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [ ] 無檔案,或存在的檔案是 schema 安裝前的合法存留

**洩漏清單**（若有）：

| 檔案 | 內容是否已 captured 進 change | 建議動作 |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | 真正 gap? |
|---|---|---|---|
| —（plan 无 `[~]` deferred 任务，本节空白即 PASS） | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [ ] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意：`<說明>`
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**下一步**：apply 阶段完成后重新运行本 verify（覆盖本文件）。
