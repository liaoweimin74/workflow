## Design Summary

本变更包含两个需求：

### 需求 1：表单版本号语义——发布才递增，保存不递增

**现状问题**：当前 `FormDefinitionService.update()`（保存）每次创建新版本记录并 version+1，而 `publish()`（发布）只改状态不动 version。导致版本爆炸——用户在设计器里每点一次保存就 +1，版本历史被无意义草稿淹没。与流程定义「部署才递增」的语义不一致。

**目标**：对齐流程定义的版本语义：
- **保存** = 覆盖更新当前 DRAFT 记录的 schema，不动 version
- **发布** = 创建新版本记录（version+1），status=PUBLISHED，published_version 指向新版本；旧 PUBLISHED 降为 ARCHIVED
- **未变化拒绝发布**（对齐流程定义的 `ProcessDesignService.deploy()` 校验逻辑）

**数据迁移**：清空 `wf_form_def` 表重新开始（开发阶段，无需保留旧数据）。

### 需求 2：流程设计器 → 表单设计器跳转

**现状问题**：流程设计器的属性面板里通过 `FormPropertyTab.vue` 下拉选择已发布表单（存 `formConfig.formDefId`），但选完后想编辑该表单必须手动去表单列表页找，无法直接跳转。

**目标**：在 `FormPropertyTab.vue` 的"关联表单"下拉旁加"编辑表单"按钮，`formDefId` 非空时显示，点击跳转到表单设计器并携带回跳参数。

**跳转 URL**：`/form/designer?id={formDefId}&returnTo=/designer?id={draftId}`
**回跳**：表单设计器返回按钮优先使用 `returnTo` query 参数，无则 `router.back()`

## Alternatives Considered

### 方案 A：保存覆盖草稿 + 发布创建版本（采用）

- **做法**：`update()` 改为原地更新当前记录 schema；`publish()` 改为创建新版本记录
- **优点**：
  - 与流程定义版本语义完全一致
  - 版本历史只有有意义的快照（发布点），干净可用
  - 支持版本对比视图（PRD 3.2 低优先级功能）
- **缺点**：
  - 需要改 `update()` 和 `publish()` 实现逻辑
  - 需要改 spec 和测试
  - 需要清空旧数据
- **为何采用**：语义一致性是长期收益，版本历史可用性高

### 方案 B：保存创建草稿副本 + 发布提升草稿为版本

- **做法**：引入 DRAFT 表/字段，保存写草稿，发布把草稿提升为正式版本
- **优点**：草稿与正式版本物理分离，更清晰
- **缺点**：
  - 数据模型改动大（新增草稿表或字段）
  - 当前项目阶段过度设计
  - 与流程定义的"草稿即 ProcessDraft"模式不对称
- **为何未采用**：过度设计，当前方案 A 已满足需求

### 方案 C：保持现状，仅加跳转

- **做法**：不动版本号逻辑，只做需求 2 的跳转
- **优点**：改动最小
- **缺点**：版本爆炸问题不解决，与流程定义语义不一致
- **为何未采用**：用户明确要求改版本号语义

## Agreed Approach

方案 A。保存覆盖当前 DRAFT 记录的 schema（不新建记录、不递增 version）；发布时创建新版本记录（version+1, status=PUBLISHED），旧 PUBLISHED 记录降为 ARCHIVED；发布前校验 schema 是否变化，未变化则拒绝。数据清空重来。

跳转：FormPropertyTab 加"编辑表单"按钮，跳转携带 `returnTo` 参数，表单设计器返回按钮支持回跳。

## Key Decisions

1. **保存语义**：`update()` 原地更新当前记录 schema，不新建记录，version 不变
2. **发布语义**：`publish()` 创建新记录（version=maxVersion+1, status=PUBLISHED），旧 PUBLISHED 记录 status 改 ARCHIVED，published_version 更新为新 version
3. **发布校验**：发布前比较当前 schema 与上次发布 schema，一致则拒绝（对齐流程定义 `deploy()` 的校验逻辑）
4. **数据迁移**：清空 `wf_form_def` 表，Flyway 脚本 DELETE + RESET AUTO_INCREMENT
5. **跳转入口**：`FormPropertyTab.vue` 关联表单下拉旁加"编辑表单"按钮
6. **回跳机制**：URL query 参数 `returnTo`，表单设计器返回按钮优先使用

## Open Questions

无。所有关键决策已确认。
