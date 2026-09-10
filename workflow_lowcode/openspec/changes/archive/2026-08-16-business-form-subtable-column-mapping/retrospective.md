# Retrospective: business-form-subtable-column-mapping

> Written: 2026-08-16（/opsx-finish 前，覆盖全部实现与 E2E 修复）
> Commit range: `ef216e9..d96b9c3`（15 commits）
> Worktree: `.worktrees/business-form-subtable-column-mapping/`（feature/business-form-subtable-column-mapping）

---

## 0. Evidence

- **Commit range**: `ef216e9..d96b9c3`（15 commits）
- **Diff size**: ~+2900 / -40 lines across 27 files（含前端 formRuleWalk/subtableDisplay 新模块）
- **Tasks done**: 28/28（`grep -cE '^\s*- \[x\]' tasks.md` → 28，无未完成项）
- **Active hours**: ~8（估算，跨多个会话）
- **Subagent dispatches**: n/a（用户明确要求「不要派发任务给子代理，全部任务你自己做」——主会话 momus 直做）
- **New external dependencies**: none
- **Bugs encountered post-merge**: 5（3 个 E2E 阶段前端缺陷 + 2 个实现期缺陷，均 TDD 闭环，见 §2 Misses）
- **OpenSpec validate state at archive**: pass（42 items 全 valid；control: change 2/2、spec 40/40）
- **Test coverage signal**: backend `mvn test` 365 用例全绿；frontend `vitest run src` 18 文件 / 251 用例全绿（含 formRuleWalk 12、ColumnConfigDialog 12、FormRenderer 21、subtableDisplay 4）

Commit chain（時序）：

```
ef216e9 (base) fix: SearchTable 编辑提交断言对齐 updateApi 第三参（row 乐观锁）
4da2488 change: business-form-subtable-column-mapping
5549933 feat(ddl): DdlBuilder 支持子表建表与差异变更 SQL
574f6ea feat(ddl): DynamicTableManager 支持子表 ensure（建表/差异变更）
358e5d0 feat(publish): 发布流程支持子表组件（修正校验名单 + 子表建表）
0f4ce68 feat(bizdata): BizDataService 子表写入/增量diff/内嵌读取/级联删除
873f035 feat(bizdata): 独立子表行 CRUD 接口（list/add/update/delete）
355a6f0 feat(designer): ColumnConfigDialog 支持子表子列配置与传输方式选择
7003ebf fix(ddl): 主表 DDL 构建跳过子表占位字段（含 ColumnConfig 子表结构序列化测试）
08c8919 fix(bizdata): JSON 列写入前序列化为字符串（修复 CHARACTER SET 'binary' 报错）
6401f81 docs(openspec): 勾选 tasks 全部完成，新增 verify 与 retrospective 报告
c0420b6 fix(form-designer): 子表列内 LookupPicker/dataPicker 可被收集与配置（walkRules 穿透 tableForm columns 结构）
6fa8c53 fix(form-designer): 发布列映射穿透子表内部字段（group props.rule / tableForm columns[].rule）
cbd6400 fix(form-designer): 配置弹窗按设计器当前选中字段定位（支持子表内 LookupPicker/dataPicker）
86512bc feat(bizdata): 子表列显示 [子表名称] 链接，点击弹窗以 form-create 组件化渲染子表内容
d96b9c3 docs(openspec): 同步 business-form-subtable delta specs 到主 specs（归档前置）
```

---

## 1. Wins

- [evidence: 0f4ce68 + 873f035 + E2E] **embedded 全链路一次打通**：主表 create 带子表行 → getById 内嵌返回（sort_no 升序）→ PUT 增量 diff（更新/删除/插入 + version 递增 + sort_no 保序）→ DELETE 级联清空，API+DB 双层证据齐全。
- [evidence: 873f035 + E2E] **dedicated 独立接口完整可用**：list/add/update 乐观锁 409/delete 全链路通过，且 409 以业务 code 正确返回（异常处理器统一 HTTP 200 + body code）。
- [evidence: 7003ebf + DdlBuilderTest 4 用例] **缺陷 1（子表占位字段误入主表 DDL）TDD 闭环**：RED（非法列类型: null）→ GREEN（validateColumns/buildCreateTable/buildAlterStatements 三处统一跳过占位 + 递归校验子列）→ 发布后 `SHOW CREATE TABLE` 无占位列，回归全绿。
- [evidence: 08c8919 + BizDataServiceTest 3 用例] **缺陷 2（JSON 列 binary 字符集报错）TDD 闭环**：serializeJsonColumns 在 create/update 前把 Map/List 序列化为 JSON 字符串，subForm 表单 create/get 往返验证通过。
- [evidence: 5549933/574f6ea/358e5d0 + FormDefinitionPublishBusinessTest] **发布链路 DDL 约束完整**：子表物理表固定列 + (tenant_id, biz_id) 索引 + 差异变更复用主表规则（仅增列/改宽/改必填/加索引）。
- [evidence: c0420b6 + formRuleWalk 12 用例 + E2E] **缺陷 3（子表列内 LookupPicker/dataPicker 无法配置）TDD 闭环**：设计器 schema 实际存 `props.columns[].rule`，原 walk 只递归 children → 收集不到子表内字段。抽出 formRuleWalk.ts 统一穿透 children / props.rule / props.columns[].rule 三种结构，FormDesigner 5 处内联 walk 全部替换；E2E 注入真实 tableForm schema 验证收集与写回。
- [evidence: 6fa8c53 + ColumnConfigDialog 12 用例 + E2E 发布] **缺陷 4（发布列映射子列为空阻止发布）TDD 闭环**：ColumnConfigDialog 提取子列只读 children，真实 group 子表（ref_test sub_form1）内部字段在 props.rule（fcRow/col 嵌套）→ 子列为空被标不可映射。subTableChildren 统一穿透三种结构；子表内 dataPicker 生成 id+_text 两列、LookupPicker 映射 VARCHAR(255)。E2E 发布成功，子表物理表 `wf_biz_ref_test_sub_form1` 列结构正确。
- [evidence: cbd6400 + formRuleWalk 5 新用例 + E2E] **缺陷 5（配置弹窗永远写入第一个字段）TDD 闭环**：openLookupConfig/openPickerConfig 固定取 `fields[0]`，用户选中子表内字段点配置写回的是顶层字段。新增 resolveActiveField 按设计器 activeRule（当前选中）定位；E2E 选中 sub_lookup → selectedLookupField=sub_lookup → 配置写回子表内 props → DB 持久化 → 渲染无报错。
- [evidence: 86512bc + subtableDisplay 4 用例 + E2E] **列表子表列组件化展示**：业务数据列表子表字段不再显示 JSON 文本，改为 `[子表名称]` 链接，点击弹窗复用 FormRenderer（form-create）渲染子表字段 rule——子表内 lookupPicker/dataPicker 等组件与表单渲染完全一致。附带修复 FormRenderer readonly deepDisable 不穿透子表内部字段（只读弹窗中子表字段可编辑的既有缺陷）。

## 2. Misses

- 🟡 [painful | evidence: 7003ebf] **子表占位字段在 DDL 构建层未跳过导致发布后主表构建报错**：子表字段在 column_config 中无自身 columnType，validateColumns 未识别占位语义抛「非法列类型: null」。修复后补 4 用例。根因：占位字段语义（subColumns 非空即占位）在 DdlBuilder 层缺一个统一判定入口。
- 🟡 [painful | evidence: 08c8919] **JSON 列写入未序列化**：subForm 组件值（Map/List）直接交给 JDBC 写 JSON 列报 `Cannot create a JSON value from a string with CHARACTER SET 'binary'`。发生在 TDD 单测未覆盖的集成路径（单测 mock 了 JDBC，真实 MySQL 才暴露）。修复后补 3 用例。
- 🟡 [painful | evidence: c0420b6] **设计器 schema 的 walk 只递归 children，未覆盖子表内部字段的实际存储位置**：form-create 的 group 子表内部字段在 `props.rule`、tableForm 在 `props.columns[].rule`，而原代码（FormDesigner 5 处 + ColumnConfigDialog）全部只走 `children`。导致子表内 LookupPicker/dataPicker「无法配置 + 发布列映射为空 + 无法回填」。三个缺陷（c0420b6/6fa8c53/cbd6400）同一根因的不同暴露面。
- 🟡 [painful | evidence: cbd6400] **配置弹窗无「当前选中字段」概念**：openLookupConfig/openPickerConfig 固定 `fields[0]`，设计器选中哪个字段都写回第一个。修复引入 resolveActiveField 按 activeRule 定位。这类「属性面板按钮触发配置」的模式应默认携带当前选中上下文。
- 📌 [nit | evidence: 环境日志] **后端进程多次被外部终止（exit -1）**：DevTools/mvn 进程偶发被杀，需重启后重验；期间还发现 8080 曾由残留 worktree 旧进程占用导致 API 验证对着错误代码。环境层面问题，非功能缺陷，但浪费了验证时间。
- 📌 [nit | evidence: 86512bc] **E2E 浏览器验证阶段登录态反复失效**：页面跳转后 token 过期被踢回 /login，需用 `fetch('/api/auth/login')` 注入 `access_token` 后重定向。验证脚本需预留登录 bootstrap 步骤。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 5.1-5.4 手工验证 | 增加了一轮「重启后端后重验」 | 后端进程被终止，需确认修复加载后再跑 E2E |
| 1.7 DynamicTableManagerTest | 与 1.6 一起实现 | 表 ensure 逻辑随 DdlBuilder 一起提交，测试同批次 |
| 调试期新增 ColumnConfigTest | +2 用例（Jackson 往返、legacy 兼容） | 子表嵌套结构首次引入，补齐序列化契约 |
| E2E 阶段新增前端修复（c0420b6/6fa8c53/cbd6400） | plan 中未规划 | 设计器 walk 不穿透子表内部字段导致子表内引用组件无法配置/发布列映射为空/弹窗写错字段，E2E 实测暴露 |
| E2E 阶段新增列表弹窗（86512bc） | plan 中未规划（用户 E2E 后追加需求） | 子表列应显示 [子表名称] 链接并组件化渲染弹窗内容 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（brainstorm.md 存在，早期会话） |
| superpowers:writing-plans                        | ✓（plan.md 存在） |
| superpowers:using-git-worktrees                  | ✓（全程在 .worktrees/ 工作） |
| superpowers:subagent-driven-development          | ✗ |
| (transitive) superpowers:test-driven-development | ✓（两个缺陷均为 RED→GREEN 闭环） |
| (transitive) superpowers:requesting-code-review  | ✗ |
| superpowers:finishing-a-development-branch       | 进行中（本 retro 后 /opsx-finish，已读 skill 展示选项） |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill（不使用子代理执行实现）
  - **Why this cycle**: 用户显式指令「不要派发任务给子代理，全部任务你自己做」——明确的 scope-judgment 覆盖，非默认路径。
  - **How to prevent recurrence**: `scope-judgment rule` — 当用户显式要求主代理直做时，跳过属预期行为；默认仍需按 skill 编排。
- **`superpowers:requesting-code-review`**
  - **What was skipped**: 正式 code review 阶段
  - **Why this cycle**: 与上同用户指令约束（不派子代理）+ 变更已通过全量测试与双链路 E2E 验证作为替代性质量门。
  - **How to prevent recurrence**: `one-off — schema boundary case`：用户显式禁止子代理时 review 退化为自证（测试+E2E+verify）。

## 5. Surprises

- **409 业务码在 HTTP 200 中返回**：独立子表行乐观锁冲突按全站异常处理器约定返回 HTTP 200 + `{"code":409,...}`，而非 HTTP 409 状态码。E2E 脚本一开始按 HTTP 状态码断言导致误判「冲突未触发」，改用 body code 断言后确认正确。属既有约定，非缺陷。
- **PowerShell 命令行 `-e` 与反引号陷阱**：mysql.exe 传 SQL 需 `--execute` + 单引号字符串；PowerShell 双引号内反引号会被解释为转义吞掉（如 `\`key\`` 变 `key`）。浪费了几轮查询调试。

## 6. Promote candidates → long-term learning

- [ ] 🔴 **子表占位字段判定应集中为一个语义（subColumns 非空）并贯穿所有遍历列的位置** → **Promote to memory** (type: heuristic)
  > **Why**: 占位字段无自身 columnType，任何「遍历 column_config 当作普通列」的代码点（validate/build DDL/alter）都会误炸；本次缺陷 1 正是第 3 处遗漏。
  > **How to apply**: 新增含占位字段的结构时，先 grep 所有 `columnDefinition(` / `getColumnType()` 的消费点，统一加跳过分支。
- [ ] 🟡 **TDD 单测 mock JDBC 会漏掉真实数据库类型的序列化语义** → **Promote to memory** (type: feedback)
  > **Why**: JSON 列 binary 字符集问题只在实际 INSERT 暴露，mock 下永远绿。
  > **How to apply**: 涉及新列类型/新 JDBC 交互时，单测之外至少保留一条指向真实 MySQL 的集成验证路径（本项目已有 wired 后端 + 测试表单可复用）。
- [ ] 🔴 **form-create schema 的遍历必须统一穿透三种嵌套（children / props.rule / props.columns[].rule）** → **Promote to memory** (type: heuristic)
  > **Why**: group 子表内部字段在 `props.rule`、tableForm 在 `props.columns[].rule`、布局容器在 `children`。任何只走 children 的 walk（收集/写回/禁用/列映射）都会漏掉子表内字段——本次 3 个前端缺陷同一根因。
  > **How to apply**: 涉及 rule 树遍历时复用 `formRuleWalk.walkRules`（已统一穿透）；新增遍历点先 grep 现有 walk 实现对齐。
- [ ] 🟡 **「属性面板按钮触发配置」类功能应携带当前选中上下文** → **Promote to memory** (type: heuristic)
  > **Why**: 设计器有多个同类字段时，按 `fields[0]` 定位必然写错字段；本次缺陷 5 正因 openXxxConfig 无视 activeRule。
  > **How to apply**: 配置弹窗打开时优先用设计器当前选中（activeRule）匹配目标字段，未匹配再回退默认。
- [ ] 📌 **mysql.exe + PowerShell 的引号/转义规范** → **Promote to docs/learnings/ 或记忆** (type: feedback)
  > **Why**: `-e` 解析有坑、双引号内反引号被 PowerShell 吃掉、CHCP/OutputEncoding 影响中文显示——每轮验证都踩。
  > **How to apply**: 查询一律 `mysql.exe --user=... --password=... --database=... --batch --execute="<单引号内SQL>"`，先 `[Console]::OutputEncoding=[Text.Encoding]::UTF8`。