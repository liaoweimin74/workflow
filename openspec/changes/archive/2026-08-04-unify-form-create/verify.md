# Verify: unify-form-create

## Implementation Evidence

### Commit History (main..HEAD)

```
cd76116 fix: 删除 FormDefinitionRepository 中残留的 formKey 查询方法
73c7cbc fix: 清理 FormDefinitionServiceTest 中残留的 formKey 测试
63a7c0d chore: 删除 FormBuilder 及相关代码
ee4a926 refactor: 迁移 MenuPage 到 form-create rule
00bfb77 refactor: 迁移 UserPage + RolePage + OrgPage 到 form-create rule
8d46560 refactor: 迁移 ProcessListPage + FormListPage 到 form-create rule
714ef62 refactor: 迁移 DictPage 到 form-create rule
a845fba feat: SearchTable 内部 FormBuilder → FormRenderer
f9079db refactor: FormConfig 接口 fields → rule
deea155 feat: FormRenderer 支持 rule prop + initialValues + getFormData
1087a85 feat: 创建 FormPageLayout 统一外壳组件
fe11e76 feat: FcDesigner 注册 LookupPicker 到拖拽面板
9538315 feat: main.ts 注册 LookupPicker 为 form-create 全局组件
8f940ed feat: LookupPicker 适配 form-create — returnFields 通过 api.setValue 回填
3ce913b change: 修订 artifacts — CRUD 表单 schema 改为前端定义,去掉后端 formKey
```

15 commits, 每个对应一个有意义的逻辑边界。

### Task Completion

tasks.md 中 7.1–7.2（自动化测试）已通过。7.3–7.7（手动验证）待用户在运行时确认。

## Spec Verification

### Capability: crud-form-binding

**要求**: CRUD 页面通过前端 rule JSON 驱动 FormRenderer 渲染表单，数据走业务接口。

**验证**:
- 7 个页面 (UserPage, RolePage, OrgPage, DictPage, MenuPage, ProcessListPage, FormListPage) 均已将 `formConfig.fields` 改为 `formConfig.rule`
- SearchTable 内部使用 FormRenderer 渲染弹窗表单
- 数据提交仍走各页面的 createApi/updateApi/deleteApi

**状态**: ✅ 通过

### Capability: custom-form-components

**要求**: 定制组件（LookupPicker 等）注册为 form-create 组件。

**验证**:
- `main.ts` 中 `formCreate.component('LookupPicker', LookupPicker)` 全局注册
- LookupPicker.vue 通过 `formCreateInject` 获取 api，returnFields 通过 `api.setValue()` 回填
- FcDesigner 注册 LookupPicker 到拖拽面板
- DictPage 使用 `type: 'LookupPicker'` 的 rule

**状态**: ✅ 通过

### Capability: unified-form-layout

**要求**: FormPageLayout 统一外壳。

**验证**:
- `FormPageLayout.vue` 已创建，提供 title prop + default/toolbar/footer 插槽
- 单元测试已编写并通过

**状态**: ✅ 通过

### Capability: form-runtime (modified)

**要求**: FormRenderer 支持 `formDefId`（流程表单）和 `rule`（CRUD 表单）两种模式。

**验证**:
- FormRenderer.vue 增加 `rule` prop（与 formDefId 互斥）
- 增加 `initialValues` prop（编辑场景预填充）
- 暴露 `getFormData()` 方法
- rule 模式测试已编写并通过

**状态**: ✅ 通过

## Test Results

### 前端

```
Test Files  7 passed (7)
     Tests  84 passed (84)
  Duration  6.29s
```

### 后端

```
BUILD SUCCESS
Tests run: 56+, Failures: 0, Errors: 0, Skipped: 0
```

## Cleanup Verification

### FormBuilder 残留检查

```
grep -r "FormBuilder\|FormField\b\|FormLayout\b\|FormBuilderProps\|RenderField" frontend/src/
→ No matches found
```

- FormBuilder.vue: 已删除
- FormBuilder.test.ts: 已删除
- types.ts: FormField/FormLayout/FormBuilderProps 类型已删除
- index.ts: FormBuilder barrel export 已删除

**状态**: ✅ 零残留

## Deviations from Plan

### 偏差 1: 后端 formKey 字段引入后 revert

原 plan.md 中 Phase 1 后端零改动。实际执行中一度引入了 `formKey` 字段（FormDefinition entity + DB migration V13），后因设计决策"CRUD 表单 schema 前端定义"而 revert。revert 过程中遗漏了：
- FormDefinitionRepository 的 `findFirstByTenantIdAndFormKeyAndStatusOrderByPublishedVersionDesc` 方法
- FormDefinitionServiceTest 中的 formKey 测试用例
- Flyway checksum 不匹配

均已修复（commits cd76116, 73c7cbc）。

### 偏差 2: tasks.md 有重复条目

tasks.md 第 29-31 行有重复的 4.3/5.4 条目（编号错误）。已在 verify 阶段清理。

## Overall Decision

**PASS** — 实现与 spec/design 一致，自动化测试全通过，FormBuilder 零残留。

手动验证项（7.3–7.7）需用户在运行环境中确认，不阻塞归档。
