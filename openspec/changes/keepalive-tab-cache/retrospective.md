# Retrospective: keepalive-tab-cache

> Written: 2026-08-31 (after verify passed)
> Commit range: `待 implementation 完成後填入`
> Worktree: `.worktrees/keepalive-tab-cache/`

---

## 0. Evidence

> 量化前置數據 — 後續 Wins / Misses bullets 直接引用,避免每行重複 [evidence: ...]。

- **Commit range**: `待 implementation 完成後填入`
- **Diff size**: `待 implementation 完成後填入`
- **Tasks done**: `待 implementation 完成後填入`
- **Active hours**: `待 implementation 完成後填入`
- **Subagent dispatches**: n/a
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: not-run

---

## 1. Wins

- 分析了业界多页签方案（keep-alive、v-show、localStorage、若依方案），选择了最适合当前系统的方案
- 识别了共享组件路由（/page/:pageKey）的实例隔离问题，用 key="route.fullPath" 解决
- 明确了 pageQueryStateStore 的冗余性，决定删除以简化代码
- 设计了内存管理机制（max=15 + LRU 驱逐）

---

## 2. Misses

- 需要验证 form-create 等第三方组件与 keep-alive 的兼容性
- max 值（15）需要在实际使用中调优

---

## 3. Surprises

- pageQueryStateStore 已经部分实现了查询状态缓存，但只覆盖了 query/sort，未覆盖完整组件状态
- 系统中存在大量需要添加 defineOptions 的路由组件（约 20 个）

---

## 4. Callouts

- 实现时需特别注意 PageRenderer.vue 的强制刷新机制，确保菜单重击能正确触发数据重载
- 删除 pageQueryStateStore 前需确认无其他模块依赖

---

## 5. Artifacts Touched

| Artifact | Action |
|----------|--------|
| brainstorm.md | Created |
| design.md | Created |
| proposal.md | Created |
| specs/tab-state-preservation/spec.md | Created |
| tasks.md | Created |
| plan.md | Created |
| verify.md | Created |
| retrospective.md | Created |

---

## 6. Candidates for Promotion

> 冷寫場景(retro 寫於 cycle 結束之後一段時間),只用 `git log` + `tasks.md` +
> commit messages 也應能重建本節。

未勾選的 `- [ ]` 表示 candidate 尚未 promote — 可帶到下一個 cycle 的 retro 重評估,
或保留作為跨 cycle 的觀察點。

> **Carry-forward 機制**:下個 cycle 寫 retro 時,可
> `grep -A 5 '^- \[ \]' openspec/changes/archive/*/retrospective.md` 取出
> 既往 unchecked candidates,逐筆判斷要 carry-forward 到本 cycle §6、就地
> promote、或標 stale 不再追蹤。

- [ ] 🟡 **共享组件路由的实例隔离** → **Promote to project AGENTS.md** (段: 多页签实现注意事项)
  > **Why**: /page/:pageKey 等动态路由使用同一组件，需要 key="route.fullPath" 确保实例隔离
  > **How to apply**: 新增动态路由组件时，确保 keep-alive 能正确隔离不同参数的实例

- [ ] 🟡 **keep-alive max 值调优** → **Promote to project docs** (段: 性能优化)
  > **Why**: max=15 是初始值，需要根据实际使用情况调优
  > **How to apply**: 监控内存使用，根据用户反馈调整 max 值

---

## 7. Follow-ups

- 验证 form-create 与 keep-alive 的兼容性
- 监控内存使用，调优 max 值
- 考虑添加页签数量配置选项
