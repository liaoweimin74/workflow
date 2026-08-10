## Verification

> 此文件在 `/opsx-apply` 实施完成后由 `/opsx-verify` 生成。

### 预检查

实施完成后执行以下验证：

1. **Commit 证据**：
   ```bash
   git log --oneline $(git merge-base HEAD origin/main)..HEAD | wc -l
   ```
   预期返回 > 0

2. **任务进度**：
   ```bash
   grep -c '^- \[x\]' openspec/changes/form-and-button-rendering/tasks.md
   ```
   预期返回 > 0

### 验证清单

实施完成后逐项验证：

- [ ] `extractFormConfig` 三场景测试通过（节点配置/流程默认/都未配）
- [ ] `extractOperations` 三场景测试通过（完整/部分/未配置）
- [ ] TaskDetailVO 含 fieldPermissions 和 operations 字段
- [ ] 发起页接口返回 fieldPermissions
- [ ] FormRenderer 按 EDIT/VIEW/HIDDEN 正确渲染字段
- [ ] TaskDetailPage 按钮按 operations 动态显示/隐藏
- [ ] 所有更多操作关闭时不显示下拉
- [ ] 旧配置（缺 allowDelegate/allowForwardSign）不报错
- [ ] 设计器操作 Tab 可配置 5 个操作开关
- [ ] 后端 `mvn test` 通过
- [ ] 前端 `npm run build` 通过
- [ ] 端到端：设计器配置 → 部署 → 发起 → 审批，表单和按钮按配置工作
