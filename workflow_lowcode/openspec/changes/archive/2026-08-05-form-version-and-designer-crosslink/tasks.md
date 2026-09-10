## 1. 数据库迁移

- [ ] 1.1 创建 Flyway 迁移脚本：清空 `wf_form_def` 表（DELETE + RESET AUTO_INCREMENT）

## 2. 后端：表单版本号语义改造

- [ ] 2.1 重写 `FormDefinitionService.update()`：原地更新 DRAFT 记录 schema，不新建版本；遇 PUBLISHED 记录时创建 DRAFT 副本
- [ ] 2.2 重写 `FormDefinitionService.publish()`：创建新版本记录（version+1, PUBLISHED），旧 PUBLISHED 降 ARCHIVED，发布前校验 schema 变化
- [ ] 2.3 新增 `FormDefinitionRepository` 方法：`findMaxVersionByTenantIdAndKey`（如不存在）、查找最近 PUBLISHED 记录的方法
- [ ] 2.4 改写 `FormDefinitionServiceTest`：更新测试用例匹配新语义（保存不递增 version、发布递增、发布校验拒绝、PUBLISHED 改 DRAFT 副本）

## 3. 前端：流程设计器跳转表单设计器

- [ ] 3.1 `FormPropertyTab.vue`：关联表单下拉旁加"编辑表单"按钮，formDefId 非空时显示，点击跳转携带 returnTo 参数
- [ ] 3.2 `FormDesigner.vue`：handleBack() 支持 returnTo query 参数，有则 router.push(returnTo)，无则 router.back()

## 4. 验证

- [ ] 4.1 后端测试全部通过
- [ ] 4.2 前端跳转功能手动验证：流程设计器 → 表单设计器 → 返回流程设计器
- [ ] 4.3 LSP 诊断无新增错误
