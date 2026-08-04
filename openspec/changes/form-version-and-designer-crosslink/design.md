## Context

当前表单定义版本管理语义与流程定义不一致：

- **流程定义**：`ProcessDesignService.deploy()` 部署才递增 version，且 XML 未变化时拒绝部署（`:191-193`）。草稿阶段 `ProcessDraft` 原地更新，不产生版本记录。
- **表单定义**：`FormDefinitionService.update()` 保存即创建新版本记录并 version+1（`:99-118`），`publish()` 只改状态不动 version。导致版本爆炸。

此外，流程设计器的 `FormPropertyTab.vue` 允许节点关联已发布表单，但无法直接跳转到表单设计器编辑该表单，用户需手动去表单列表页查找。

## Goals / Non-Goals

**Goals:**
- 表单版本号语义对齐流程定义：保存不递增，发布才递增
- 发布时创建新版本快照，旧 PUBLISHED 降为 ARCHIVED
- 发布前校验 schema 变化，未变化拒绝发布
- 流程设计器属性面板可直接跳转到关联表单的设计器页面
- 表单设计器支持回跳到流程设计器

**Non-Goals:**
- 版本对比视图（PRD 3.2 低优先级，后续独立实现）
- 表单定义草稿与正式版本的物理分离存储（方案 B，过度设计）
- 修改 FormData 运行时表单数据逻辑（FormData 通过 formDefId + published_version 加载，不受影响）

## Decisions

### 1. 保存语义：原地更新 DRAFT

`update(id, schema)` 改为：
- 查找当前记录（按 id）
- 原地更新 `schema` 字段，不新建记录，`version` 不变
- `status` 保持 DRAFT（新建时为 DRAFT）或保持当前状态

**理由**：对齐 `ProcessDraft` 的草稿模式——草稿阶段原地更新，不产生版本记录。

### 2. 发布语义：创建新版本记录

`publish(id)` 改为：
- 查找当前 DRAFT 记录
- 校验：当前 schema 与该 formKey 的上次 PUBLISHED 记录的 schema 比较，一致则拒绝
- 创建新记录：version = maxVersion + 1, status = PUBLISHED, schema = 当前 schema
- 旧 PUBLISHED 记录 status 改为 ARCHIVED
- 新记录 published_version = 自身 version

**理由**：版本号代表已生效的快照数，与 `ProcessDesignService.deploy()` 语义一致。旧 PUBLISHED 降 ARCHIVED 符合 spec 现有要求（`form-definition/spec.md:55`）。

### 3. 发布校验：schema 比对

发布前比较当前 DRAFT 的 schema 与该 formKey 最近一次 PUBLISHED 记录的 schema（字符串比较或 JSON 规范化后比较）。一致则抛出 `BusinessException(400, "表单内容未变化，无需发布")`。

**理由**：对齐流程定义 `deploy()` 的 `:191-193` 校验逻辑，避免无意义的版本记录。

### 4. 数据迁移：清空 wf_form_def

Flyway 迁移脚本：`DELETE FROM wf_form_def` + `ALTER TABLE wf_form_def AUTO_INCREMENT = 1`（如适用）。开发阶段无需保留旧数据。

### 5. 跳转：FormPropertyTab 加按钮

`FormPropertyTab.vue` 的"关联表单" `el-select` 旁加 `el-button`（icon: Edit），`formConfig.formDefId` 非空时显示。点击：
```ts
router.push({
  name: 'FormDesigner',
  query: {
    id: formConfig.formDefId,
    returnTo: `/designer?id=${route.query.id}`
  }
})
```

### 6. 回跳：表单设计器返回按钮

`FormDesigner.vue` 的 `handleBack()` 逻辑：
```ts
const returnTo = route.query.returnTo as string
if (returnTo) {
  router.push(returnTo)
} else {
  router.back()
}
```

## Risks / Trade-offs

- **[风险] 已发布表单编辑流程变化** → 修改已发布表单时，需创建新 DRAFT（当前 spec `:57` 已要求，但 `update()` 实现需检查 status=PUBLISHED 时自动创建 DRAFT 副本）。设计明确：update 遇到 PUBLISHED 记录时，复制一条 DRAFT 记录（同 formKey, version=当前 version, schema 相同），后续保存更新这条 DRAFT。
- **[风险] FormData 引用一致性** → FormData 通过 formDefId + formVersion 加载已发布版本。发布创建新记录后，旧 formDefId 仍指向旧版本记录（ARCHIVED），需确保 `getPublishedVersion()` 按 formKey + published_version 查找而非按 id。当前实现已按 formKey 查找（`:193`），安全。
- **[取舍] 清空数据** → 开发阶段可接受。生产环境需改为迁移脚本，但当前无需考虑。

## Migration Plan

1. Flyway 脚本清空 `wf_form_def` 表
2. 后端改 `FormDefinitionService.update()` 和 `publish()` 实现
3. 后端改 `FormDefinitionServiceTest` 测试用例
4. 前端改 `FormPropertyTab.vue` 加跳转按钮
5. 前端改 `FormDesigner.vue` 返回按钮支持 `returnTo`
6. 更新 `form-definition` spec 的 Requirements 和 Scenarios

## Open Questions

无。
