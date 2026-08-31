# Retrospective: keepalive-tab-cache

> Written: 2026-08-31 (after verify passed)
> Commit range: `67c1beb..d7bfbbe` (4 commits)
> Worktree: `.worktrees/keepalive-tab-cache/`

---

## 0. Evidence

- **Commit range**: `67c1beb..d7bfbbe` (4 commits: artifacts + impl + 2 fixes)
- **Diff size**: +295 / -189 lines across 10 files (impl) + further fix commits
- **Tasks done**: 5/5 groups (AdminLayout, 组件命名, 强制刷新, 删除 store, 验证测试)
- **Active hours**: ~3h
- **Subagent dispatches**: n/a（用户要求不派发子代理）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **Test results**: 39 failed | 586 passed (baseline: 39 failed | 580 passed — 零回归)

---

## 1. Wins

- 分析了业界 4 种多页签方案（keep-alive、v-show、localStorage、若依），选择了 keep-alive + key=route.path
- 识别了 pageQueryStateStore 从未接线（cacheKey 无传入方），安全删除 93 行
- 修复了 keep-alive 经典陷阱：缓存实例共享全局 route 对象导致 pageKey 漂移、错误重载
- 所有新增测试通过，零回归

---

## 2. Misses

- pageKey 快照方案在第一次提交时遗漏，用户实测后发现并发请求才修复
- max 值（15）需要在实际使用中调优

---

## 3. Surprises

- pageQueryStateStore 完全未接线（cacheKey 从未传入，menuPathMap/bumpPageRefresh 零调用）
- 被 keep-alive 缓存的实例仍响应全局 route 变化——这是 Vue 的已知行为，但在实际实现中容易遗漏

---

## 4. Callouts

- pageKey 必须是挂载时快照（ref），不能是 computed(route.params)——否则缓存实例的 pageKey 会因全局 route 变化而漂移
- 所有 watch route 的地方都需要 ownPath 过滤，否则缓存实例会响应其他页签的 route 变化
- SearchTable 内部的 query 状态在 keep-alive 下天然保留，不需要手动缓存

---

## 5. Artifacts Touched

| Artifact | Action |
|----------|--------|
| brainstorm.md | Created |
| design.md | Created |
| proposal.md | Created |
| specs/tab-state-preservation/spec.md | Created |
| tasks.md | Created, marked all done |
| plan.md | Created |
| verify.md | Created |
| retrospective.md | Created, updated |
