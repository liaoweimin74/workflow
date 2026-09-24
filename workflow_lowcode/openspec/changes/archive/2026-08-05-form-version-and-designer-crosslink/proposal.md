## Why

当前表单定义保存即创建新版本并递增 version，导致版本爆炸——用户在设计器每点一次保存就 +1，版本历史被无意义草稿淹没。流程定义已是「部署才递增」语义，表单定义应与之对齐。此外，流程设计器关联表单后无法直接跳转编辑，需手动去表单列表查找，体验割裂。

## What Changes

**表单版本号语义**
- From: 保存（`update()`）创建新版本记录，version+1；发布（`publish()`）只改状态
- To: 保存原地更新当前 DRAFT 记录 schema，version 不变；发布创建新版本记录（version+1, PUBLISHED），旧 PUBLISHED 降 ARCHIVED
- Reason: 版本号应代表已生效快照数，与流程定义语义一致
- Impact: breaking（旧数据清空，API 行为变化）

**发布校验**
- From: 无校验，DRAFT 状态即可发布
- To: 发布前比较当前 schema 与上次 PUBLISHED 的 schema，一致则拒绝
- Reason: 对齐流程定义部署校验，避免无意义版本
- Impact: non-breaking（新增校验）

**流程设计器跳转表单设计器**
- From: FormPropertyTab 只能下拉选择表单，无跳转入口
- To: 关联表单下拉旁加"编辑表单"按钮，跳转携带 returnTo 参数，表单设计器返回按钮支持回跳
- Reason: 消除流程设计与表单设计之间的导航割裂
- Impact: non-breaking（纯增量）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `form-definition`: 版本号语义从「保存递增」改为「发布递增」，新增发布校验要求
- `bpmn-designer`: 流程设计器属性面板新增跳转到表单设计器的能力

## Impact

- **后端**：`FormDefinitionService.update()` / `publish()` 实现重写，`FormDefinitionServiceTest` 测试用例改写
- **前端**：`FormPropertyTab.vue` 加跳转按钮，`FormDesigner.vue` 返回按钮支持 `returnTo` query 参数
- **数据库**：Flyway 迁移脚本清空 `wf_form_def` 表
- **Spec**：`form-definition/spec.md` 和 `bpmn-designer/spec.md` 的 Requirements 更新
- **API 契约**：DTO 字段不变，但 `PUT /form-definitions/{id}` 行为变化（不再返回新 version），`POST /form-definitions/{id}/publish` 行为变化（返回新版本记录）
