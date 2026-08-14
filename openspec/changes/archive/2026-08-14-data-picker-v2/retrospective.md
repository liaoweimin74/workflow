# Retrospective

**Change**: `data-picker-v2`
**Generated at**: `2026-08-14`（apply 完成后）

## Misses

- **§7 gap 1 — 新增自动选中链路未端到端断言**：`DataPickerCreateDialog` 提交成功 → `handleCreateSuccess` 自动选中并回填的链路，测试仅覆盖了按钮显隐与创建弹窗自身行为，未断言"创建成功 → selectValue 自动选中 → returnFields 回填"的端到端联动。
  - Follow-up：补 `DataPicker.test.ts` 中 stub 子组件 emit success 后断言 `update:modelValue` 与回填调用的用例；或由 6.3 手动验收补充。
- **§7 gap 2 — 跳转查看（router.push）未测**：`goView` 依赖 `useRouter`，测试未 mock router；`BizDataListPage` 的 `?detail=` 自动打开详情链路也未单测。
  - Follow-up：补 router mock 测试（`goView` 推 `/biz-data/:formKey?detail=id`）；BizDataListPage 的 `?detail` 消费建议手动验收确认。
- **plan/tasks 5.3 未实现（列配置编辑删除被引用列提示）**：服务端发布校验已拦截"引用列被删"（400），操作侧弹窗提示未做。spec 需求「引用感知」未包含该场景，实现与 spec 一致，tasks 为超额项。
  - Follow-up：如业务需要操作侧提示，可在后续变更中基于 referenced-count 在 ColumnConfigDialog 删除列时提示。
- **plan/tasks 3.2 分组未实现**：表单定义无分类字段（分类管理仅流程定义侧），无分组数据源；关键字搜索已具备。
  - Follow-up：若后续表单引入分类，再实现分组展示；design 中分组表述可移除。
- **6.3 手动验收 deferred**：未启动前后端应用做浏览器验收（worktree 环境成本高）。等价自动化覆盖见 verify §7，两项部分 gap 已记录上文。

## Lessons

- **后台 subagent 模型配置不可用**：本次会话 explore/librarian 后台任务因 `ProviderModelNotFoundError: Model not found: fast/` 全部失败——直接改用 web search 完成调研，未阻塞。启示：后台任务失败时应立即降级为主代理直接调研，勿重复派发。
- **worktree 环境前置**：新 worktree 无 `node_modules`，必须 `npm ci`（15s）后才能跑前端测试；`.gitignore` 已排除产物，无提交风险。
- **element-plus 弹窗测试**：`append-to-body` 的 el-dialog 内容渲染在 `document.body`，`wrapper.find` 找不到弹窗内按钮——须用 `document.body.querySelectorAll` 定位（DataPicker 与 DataPickerCreateDialog 测试均踩中）。
- **script setup 变量不暴露到 vm**：测试断言内部状态需 `defineExpose`（DataPickerConfigDialog 为此暴露 form）；watch 回填需 `immediate: true`（mount 时初始值不触发普通 watch）。
- **pre-existing 测试失败的判别法**：怀疑改动引入回归时，备份改动文件 → checkout HEAD 版本 → 复跑测试 → 对比，可快速区分 pre-existing 与本次回归（SearchTable 编辑提交测试即通过此法确认无关）。

## Surprises

- **SearchTable.test.ts 存在 pre-existing 失败**（编辑提交时调用 updateApi）——HEAD 版本即可稳定复现，与本次改动无关；建议独立 issue 修复（怀疑 FormRenderer/表单数据时序）。
- **`vue-tsc` 全量错误列表在 HEAD 与改动后完全一致**——本次 6 个提交未引入任何新类型错误，改动面控制良好。
- **后端 318 个测试全量一次通过**——Task 1/2 的后端改动（统计接口、发布校验扩展）零回归。
