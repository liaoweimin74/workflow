# Retrospective: table-column-customization

## Summary
实现了数据表格列级定制能力：自定义列、列样式、单元格点击事件、动态列内容（expression/template）。

## What Went Well
- 后端 ViewCompiler/PageValidator 全链路测试覆盖（672/672 通过）
- 前端 QueryColumnsConfig/tableColumnRenderer 测试覆盖（40/40 通过）
- contentType/contentValue 存储模型简洁，天然互斥
- 模板语法统一支持 `${name}` 和 `${$row.name}` 两种写法
- 自动展开 `row.data` 嵌套结构，用户无需关心数据是扁平还是嵌套

## Issues Found & Fixed
1. **发布时报"展示列引用列不存在"**：PageValidator.validateForPublish 未判断 custom:true → 已修复
2. **自定义列在预览/运行时不可见**：ViewCompiler 未透传 expression/template/formatter → 已修复
3. **Radio 无法选择**：@change 在 computed model-value 下不触发 → 改用 @update:model-value
4. **高级配置回显失败**：pickAdvanced 未取 contentType/contentValue → 已修复
5. **单元格点击无反应**：ViewCompiler 未透传 onCellClick → 已修复
6. **模板语法不统一**：interpolateTemplate 不支持 ${$row.name} → 已统一

## Remaining Work
- 前端基线 35 个 FormRenderer 测试失败（预存问题，与本次改动无关）
- 生产环境需实际验证 expression/template 渲染效果

## OpenSpec Validate State at Archive
pass

## Test Coverage
- Backend: 672/672 passed (ViewCompiler 26, PageValidator 27)
- Frontend: 40/40 passed (QueryColumnsConfig 22, tableColumnRenderer 18)
- Build: EXIT 0
