# Tasks — PAGE 页面 page-table 自定义列高级配置修复

## 1. 回归测试（RED）

- [ ] 1.1 更新 `frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`：断言打开弹窗回填时，`bindingProps.columns` 中的高级字段（contentType/contentValue/className/styleExpr/onCellClick/custom/hidden）被保留到 `tableData.columns`
- [ ] 1.2 更新 `frontend/src/views/form/components/__tests__/DsBindingConfigDialog.table.test.ts`：断言确认保存后 `emit('confirm')` 的 `result.columns` 含全部高级字段（与 design.md 字段清单一致）
- [ ] 1.3 运行新增/更新测试，确认因当前实现（字段白名单重建）而失败（RED）

## 2. 修复实现（GREEN）

- [ ] 2.1 修复 `DsBindingConfigDialog.vue` `initTableData()`（L335-345）：加载列时用 `{ ...c }` 保留完整字段，仅归一化 `key`/`label`（`key: c.prop ?? c.key`）
- [ ] 2.2 修复 `DsBindingConfigDialog.vue` `handleConfirm()`（L407-411）：保存列时在基础字段外显式透传高级字段 `contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`
- [ ] 2.3 运行 1.1/1.2 测试，确认通过（GREEN）

## 3. 验证与回归

- [ ] 3.1 运行 `frontend/src/views/page/components/__tests__/PageDataTable.test.ts`（列级定制用例），确认渲染端模板/表达式/样式/onCellClick 不受影响
- [ ] 3.2 运行 `frontend/src/views/form/components/__tests__/DsBindingConfigDialog.*.test.ts` 全量，确认非表格模式行为不变
- [ ] 3.3 运行前端相关 lint/typecheck（vue-tsc / eslint），确认无类型与规范问题
