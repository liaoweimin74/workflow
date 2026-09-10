# Retrospective: unify-form-create

## What Was Done

将项目从双表单轨道（自定义 FormBuilder + form-create FormRenderer）统一为单一 form-create 轨道。

- LookupPicker 适配 form-create（inject + api.setValue），全局注册 + FcDesigner 拖拽面板注册
- FormRenderer 扩展支持 `rule` prop + `initialValues` + `getFormData()`
- 创建 FormPageLayout 统一外壳组件
- SearchTable 内部 FormBuilder → FormRenderer，FormConfig.fields → FormConfig.rule
- 7 个 CRUD 页面迁移（UserPage, RolePage, OrgPage, DictPage, MenuPage, ProcessListPage, FormListPage）
- 删除 FormBuilder.vue + FormBuilder.test.ts + FormField/FormLayout/FormBuilderProps 类型
- 后端清理 formKey 残留（Repository 方法 + 测试 + Flyway checksum）

## What Went Well

- **并行迁移有效**: 7 个页面分 4 批并行委托给 subagent，大幅缩短迁移时间
- **测试驱动**: 每次迁移后运行 vitest + mvn test，及时发现问题
- **增量提交**: 每个 Phase 独立 commit，rebase/回滚粒度细

## What Could Be Improved

- **revert 不彻底**: 引入 formKey 后 revert 时漏删了 Repository 方法和测试，导致后端启动失败两次（PropertyReferenceException + Flyway checksum mismatch）。revert 应有检查清单：entity → repository → service → test → migration → flyway history
- **subagent 凭证冷却**: 2 个 subagent 因 429/credential cooldown 失败，需手动接管。并行任务应有降级方案
- **tasks.md 编号错误**: 出现重复条目（4.3 重复，5.4 错位），说明 plan 阶段审查不够
- **手动验证未完成**: tasks 7.3–7.7（手动 CRUD 验证）依赖运行环境，在 finish 阶段无法完成。应在 plan 阶段明确哪些任务需要运行时验证

## Surprises

- form-create 的 `update` 回调可以替代 FormField 的 `onChange` 实现 MenuPage 的 menuType 联动，且更简洁
- Flyway repair 命令可以直接修复 checksum mismatch，不需要手动改数据库

## Lessons

1. **revert 是高风险操作** — 必须沿依赖链检查：entity → repository → service → controller → test → migration
2. **subagent 并行有上限** — 凭证冷却和限流是真实约束，关键路径应有手动兜底
3. **Flyway repair 是有用工具** — `mvn flyway:repair -Dflyway.url=... -Dflyway.user=... -Dflyway.password=...` 可修复 checksum

## Metrics

- Commits: 15
- Files changed: ~20
- Lines deleted: ~700+ (FormBuilder + 类型 + 测试)
- Lines added: ~300 (rule JSON + FormRenderer 扩展)
- 前端测试: 84 passed
- 后端测试: BUILD SUCCESS
- FormBuilder 残留: 0
