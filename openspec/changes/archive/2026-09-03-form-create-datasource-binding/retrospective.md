# Retrospective: form-create-datasource-binding

> Written: 2026-09-03 (after full-suite tests pass + browser E2E verification)
> Commit range: `58999d1..HEAD` (12 implementation commits)
> Worktree: `.worktrees/form-create-datasource-binding/`

---

## 0. Evidence

- **Commit range**: `58999d1..HEAD` (12 implementation/artifact commits)
- **Full-suite frontend tests**: 59 files / 694 tests passed; focused option-datasource tests 24 passed
- **TypeScript**: `tsc --noEmit` clean; `npm run build` succeeds
- **Browser E2E (runtime + preview)**: `/page/page2` 与 `/page/page2?preview=true` 下拉均正确显示员工档案数据源 6 条 `name`（张三、张三1、李四、王五1、王五、李四1）；树形选择（elTreeSelect）部门下拉正常显示树（总公司 → 武汉分公司）
- **New external dependencies**: none
- **OpenSpec validate state at archive**: pass

Commit chain:

```
58999d1 change: form-create-datasource-binding
ecec392 feat: add option datasource mapper
a254094 feat: bind form options to data sources
97c8ab0 chore: verify form option datasource binding
3cbb69c feat: align option datasource dialog with table config
a97c365 fix: align option datasource dialog with table
f4ec5c1 fix: use page datasource bindings for options
0f82a4a fix: write page datasource bindings to activeDsBindings store in PageDesigner
7bf61b5 style: align option datasource button with table config button
e15bace fix: make option datasource button full-width like form-create struct button
c184869 fix: resolve option datasource after activeDsBindings ready in loadSchema
6b0368f fix: pass form ds bindings to resolveOptionDataSource and PageRenderer runtime
5f448f9 fix: route option datasource to props.data for tree/cascader and share resolveOptionRules
```

## 1. Wins

- 采用项目自有 vendor 扩展，没有修改 form-create 依赖源码。
- 通过 `OptionDataSourceConfig`、`mapOptionRecords`、`resolveOptionDataSource` 将配置、转换、查询职责分开；并将 `resolveOptionRules`/`hasOptionDatasource` 抽取为共享函数，供表单（FormRenderer）与页面（PageRendererPage）两条路径复用。
- 修复了运行时解析的多个真实 bug（见下），并经浏览器端到端验证通过。
- 保留无 datasource 节点的同步渲染路径，避免历史表单因异步解析改变行为。

## 2. Misses

- 🟡 [painful] 初次的"配置后下拉没数据"根因不全在配置侧，而在运行时解析路径缺失（PageRendererPage 不解析 `effect.datasource`），且 BizDataVO 嵌套结构、options vs props.data 字段错位都会导致取到数却显示不出来；这些问题只能靠真实数据 + 浏览器定位，单元测试初期未覆盖。
- 📌 [nit] jsdom 输出既有 canvas `getContext()` warning，测试仍全部通过；可在后续测试基础设施变更中统一处理。

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 运行时解析 | 额外修复 PageRendererPage 未解析 `effect.datasource`、BizDataVO 嵌套未展开、`elTreeSelect` 选项写错字段（`options` vs `props.data`）三个运行时 bug | 配置侧完成后，真实页面运行时/预览暴露的问题需在运行时解析层解决 |
| 树/级联组件 | `resolveOptionRules` 按组件类型把解析结果写入 `props.data`（elTreeSelect/tree/transfer）或 `props.options`（cascader），而非统一写 rule 级 `options` | `elTreeSelect` 读 `props.data`，写 `options` 导致取到数但下拉空 |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:writing-plans | ✓ |
| superpowers:test-driven-development | ✓（为共享解析器与字段路由补测试后改代码） |
| superpowers:verification-before-completion | ✓（tsc、694 全量测试、build、浏览器 E2E 通过后才报告） |
| superpowers:using-git-worktrees | ✓（worktree 内实现） |

## 5. Surprises

- `elTreeSelect` 的选项承载字段是 `props.data` 而非 rule 级 `options`；`select`/radio/checkbox 用 `options`，`el-cascader` 用 `props.options`——按组件类型路由写入位置是根本解法。
- `queryData` 返回的 records 是 BizDataVO `{id, data:{...}, version}` 嵌套结构；展平时若用 `{...data, id: rowId}` 会让外层记录主键覆盖业务 `data.id`（用户 `valueField=id` 指的是业务列），需业务列优先、记录主键仅兜底。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **选项数据源解析必须按组件类型路由到正确的选项承载字段** → **Promote to project CLAUDE.md**
  > **Why**: `elTreeSelect` 读 `props.data`、`el-cascader` 读 `props.options`、select 类读 rule `options`；统一写 `options` 会导致取到数却显示为空。
  > **How to apply**: 扩展选项数据源解析时，用 `optionTarget(type)` 决定写入 `options` / `props.data` / `props.options`。
- [ ] 🟡 **BizDataVO 展平需业务列优先** → **Promote to project CLAUDE.md**
  > **Why**: 用户配置 `valueField=id` 指业务 `data.id`，外层记录主键 `row.id` 覆盖它会造成错误值。
  > **How to apply**: 展平用 `{...data, version, id: 'id' in data ? data.id : row.id}`，业务列优先、记录主键仅兜底。
