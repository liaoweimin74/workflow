# Retrospective: business-form-table

> Written: 2026-08-12（实施完成，verify 通过）
> Commit range: `3f1622f..d459ade`（14 个实施 commit）
> Worktree: `.worktrees/business-form-table/`（feature/business-form-table）

---

## 0. Evidence

- **Commit range**: `3f1622f..d459ade`（14 commits）
- **Diff size**: +3414 / -53 lines across 39 files
- **Tasks done**: 27/27（tasks.md 全部勾选）
- **Active hours**: ~4h（跨一个会话周期）
- **Subagent dispatches**: 0（用户明确要求全部主代理完成）
- **New external dependencies**: 无（沿用 form-create / Spring Boot / Vue / Element Plus 现有栈）
- **Bugs encountered post-merge**: 未合并（worktree 内发现并修复 6 个）：V19 迁移在真实库失败、乐观锁 version 不自增、filter 绑定失败、BizDataService 多构造器 Spring 无法实例化、textarea 列映射错误、mock 参数类型不匹配
- **OpenSpec validate state at archive**: pass

---

## 1. What Happened

按 `/opsx-ff` → `/opsx-apply` →（finish 前）流程实施。设计阶段确认 5 个关键决策：统一设计器、物理表+列映射、运行时受控 DDL、共享表+tenant_id、v1 纯底表 CRUD。实施分 8 个任务组，TDD 每任务 RED→GREEN→commit。

**偏离计划的点**：
- 前端 SearchTable 复用重构（超出原 plan）：用户要求管理数据页复用 SearchTable+formConfig，为此给 SearchTable 增加行对象透传（updateApi/deleteApi 第三参）、FormRenderer 增加 option 透传（修复弹窗表单与预览 label 位置不一致）
- BizDataHandler 钩子机制（超出原 plan）：用户提出复杂业务逻辑接入需求后追加，含 @Transactional 事务化
- V19 迁移幂等化：真实库启动暴露 Flyway 失败记录问题，改为 information_schema 判断的幂等脚本

**实际交付范围**：设计器类型扩展 + 列映射 + 受控 DDL + 业务数据 CRUD + 前端管理页 + SearchTable 复用 + BizDataHandler 钩子。

## 2. Wins

- **统一设计器 + 宿主分层落地**：workflow/business 两种表单共用 schema 体系，设计/渲染/组件 100% 复用，工作流表单零改动
- **受控 DDL 安全护栏**：列名/类型/长度白名单 + 参数化 + 禁删列/禁跨类变更，测试全覆盖（DdlBuilderTest 13 用例）
- **CRUD 全链路质量**：乐观锁、租户隔离强制、SQL 注入防护全部测试锁定；冒烟实测 stale version 409、跨租户 404
- **SearchTable 组件增强可复用**：行对象透传（向后兼容）与 FormRenderer option 透传惠及所有现有页面（流程发起/任务处理弹窗也修复了 label 布局）
- **BizDataHandler SPI**：按 formKey 注册定制逻辑，新增业务规则 = 新增一个类，不碰通用代码
- **测试纪律**：293 测试全过（新增 66 个），每任务独立 commit 边界清晰

## 3. Misses

- **迁移脚本幂等性缺失**：V19 首次在真实库执行后 Flyway 记录 success=0（MySQL DDL 隐式提交 + 事务标记不一致），导致应用启动失败。教训：动态 DDL 类迁移脚本应默认幂等，不应假设"首次执行必然干净"
- **构造器设计失误**：BizDataService 双构造器（5 参/6 参）无 @Autowired，Spring 找不到默认构造器报错。教训：Spring 注入的类保持单一构造器
- **冒烟脚本编码污染**：PowerShell Invoke-RestMethod 传中文参数产生乱码脏数据（biz_emp_791），前端 UI 链路本身无问题。教训：API 冒烟用 curl+文件方式传 UTF-8 JSON
- **自动化测试未覆盖 DDL 真实执行**：DdlBuilder/DynamicTableManager 均为 mock 单测，真实建表依赖手动冒烟（Testcontainers/H2 未引入）

## 4. Verification Gaps

| Deferred dogfood（verify.md §7） | 实际验证方式 | 覆盖评估 | 真正 gap? |
|---|---|---|---|
| DDL 真实执行（建表/变更） | curl 冒烟：发布业务表单 → information_schema 查表结构正确 | 后端单测覆盖 DDL 生成，真实执行仅冒烟 | ✅ 部分——无自动化（Testcontainers 未引入） |
| 前端管理数据页交互 | 浏览器实测：动态列/筛选/新增/编辑/删除/乐观锁 409 | build + 浏览器冒烟 | ❌ 已覆盖 |
| 工作流表单回归 | FormDefinitionServiceTest 全过 | 版本机制/发布逻辑回归 | ❌ 已覆盖 |

**Follow-up 候选**：引入 Testcontainers 或 H2 做动态 DDL 的集成测试（跨 cycle 评估）。

## 5. Candidate Practices

- [x] 🟡 **动态 DDL 的安全护栏模式**（列名/类型白名单 + 参数化 + 禁删列）→ **Promote to docs/learnings/**
  > **Why**: 运行时 DDL 是高风险能力，本 change 的护栏做法（正则白名单、类型枚举、差异 DDL、禁跨类）可复用于其他动态建表场景
  > **How to apply**: 写入 docs/learnings/dynamic-ddl-safety.md
- [x] 🟡 **Flyway 迁移脚本幂等性**（MySQL DDL 隐式提交 + information_schema 判断）→ **Promote to docs/learnings/**
  > **Why**: 真实库启动失败的直接教训，动态 DDL 迁移不能假设首次执行干净
  > **How to apply**: 写入 docs/learnings/flyway-idempotent-ddl.md
- [x] 📌 **API 冒烟用 curl+文件传 UTF-8 JSON**（避免 PowerShell 编码坑）→ **One-off**
  > **Why**: PowerShell 传中文给 Invoke-RestMethod/curl 会乱码，冒烟产生脏数据
  > **How to apply**: 冒烟脚本固定用 Set-Content -Encoding ascii + curl -d @file
- [ ] 📌 **v1 子表/嵌套表单在底表中不支持** → **Carry to v2 规划**
  > **Why**: 影响 data-picker 与字段类型扩展的设计
  > **How to apply**: v2 设计时作为输入

## 6. Carry-Forward

- [ ] **data-picker 引用业务表单数据（v2）**：工作流表单字段选择业务表单记录，依赖 formKey=数据源标识；**触发 JOOQ 引入**（关联查询）
- [ ] **流程沉淀（v2）**：流程完成后表单数据写回业务表（Flowable Listener）
- [ ] **行级权限/数据范围控制（v2）**：v1 仅"能管理该表单即能查全部"
- [ ] **子表/嵌套表单作为可查询列（v2）**：当前发布时阻止
- [ ] **清理冒烟脏数据**：biz_emp_791（乱码名称/columnConfig），删除重建
- [ ] **动态 DDL 集成测试（候选）**：Testcontainers 验证真实建表/变更
