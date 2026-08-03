# Verification — form-designer

> 状态：待 apply 阶段完成后执行验证

## 1. Structural Validation

- [ ] 运行 `openspec validate --all --json`，确认所有 artifact 返回 `valid: true`

## 2. Task Completion

- [ ] 确认 `tasks.md` 中所有 checkbox 为 `- [x]`
- [ ] 未完成项记录原因（manual / out-of-scope / blocked）

## 3. Delta Spec Sync State

- [ ] `specs/form-designer/spec.md` → 同步到 `openspec/specs/form-designer/spec.md`
- [ ] `specs/form-definition/spec.md` → 同步到 `openspec/specs/form-definition/spec.md`
- [ ] `specs/form-runtime/spec.md` → 同步到 `openspec/specs/form-runtime/spec.md`
- [ ] `specs/form-data/spec.md` → 同步到 `openspec/specs/form-data/spec.md`
- [ ] `specs/bpmn-designer/spec.md` → 合并到 `openspec/specs/bpmn-designer/spec.md`

## 4. Design/Specs Coherence

- [ ] design.md 中的数据模型（wf_form_def, wf_form_data）与 specs/form-definition、specs/form-data 中的 requirement 一致
- [ ] design.md 中的字段权限优先级（节点级 > 表单默认 > EDIT）与 specs/form-runtime 中的 Scenario 一致
- [ ] design.md 中的 API 路径与 specs 中的 Scenario 引用路径一致

## 5. Implementation Signal

- [ ] 后端 `com.workflow.engine.form` 包创建完成
- [ ] 后端 `FormDefinitionController` 和 `FormDataController` 端点全部实现
- [ ] 前端 `@form-create/element-ui` 和 `@form-create/designer` 依赖安装
- [ ] 前端 `FormDesigner.vue`、`FormRenderer.vue`、`DataSourcePanel.vue` 组件创建
- [ ] 数据库 V12 迁移脚本执行成功

## 6. Build & Test

- [ ] 后端 `mvn compile` 通过
- [ ] 后端 `mvn test` 全部测试通过
- [ ] 前端 `npm run build` 构建通过
- [ ] 前端 `npm run dev` 启动无报错

## 7. End-to-End Verification

- [ ] 创建表单 → 拖拽组件 → 保存 → 发布
- [ ] BPMN 设计器关联表单 → 配置字段权限 → 部署流程
- [ ] 发起流程 → FormRenderer 渲染表单 → 填写提交
- [ ] 审批节点 → FormRenderer 权限控制生效 → 填写审批意见
- [ ] 表单版本变更后旧流程实例使用旧版本 schema
