## 1. 后端列映射：数组组件双列生成

- [ ] 1.1 ColumnTypeMapper.java：为数组值组件生成双列映射（主列 JSON + `<key>_text` VARCHAR(255) hidden）——select 多选 / tree / elTreeSelect / elTransfer / cascader / checkbox / multiSelect / multiSelectPro
- [ ] 1.2 ColumnTypeMapperTest.java：新增双列生成测试（select 多选、elTreeSelect 单选、cascader、checkbox 生成 text 列；select 单选不生成）
- [ ] 1.3 运行 `mvn test "-Dtest=ColumnTypeMapperTest"` 确认通过

## 2. 前端列映射：数组组件双列生成

- [ ] 2.1 ColumnConfigDialog.vue `collectFields`：数组组件生成主列 + `<key>_text` 显示冗余列（hidden，VARCHAR(255)）
- [ ] 2.2 cascader.js：默认 `props.emitPath = false`（新建级联只存叶子 value）
- [ ] 2.3 ColumnConfigDialog.test.ts：新增双列生成测试（select 多选、elTreeSelect 单选、cascader、checkbox；select 单选不生成）
- [ ] 2.4 运行 `npx vitest run src/views/form/components/__tests__/ColumnConfigDialog.test.ts`

## 3. 前端提交生成显示文本（`<key>_text`）

- [ ] 3.1 新增提交预处理工具：遍历 schema 数组组件，用渲染时 options 做 value→label 映射生成 `<key>_text`（组件 options 位置：`rule.options` / `props.data` / `props.options`；cascader 拼全路径 `/` 分隔、多选叶子 `, ` 连接）
- [ ] 3.2 表单提交链路接入（FormRenderer 提交钩子 / BizDataListPage createApi/updateApi 预处理）
- [ ] 3.3 新增工具单元测试：多选 label 拼接、级联全路径、options 缺失回退 value
- [ ] 3.4 运行对应测试套件确认通过

## 4. 列表显示走显示列

- [ ] 4.1 BizDataListPage.vue：数组组件列 render 优先读 `row.data[<key>_text]`，缺失回退主列 value
- [ ] 4.2 PageDataTable.vue：元数据列数组组件 formatter 读 `<key>_text`（缺失回退数组 join）
- [ ] 4.3 BizDataListPage.test.ts / PageDataTable.test.ts：新增显示 text 列测试
- [ ] 4.4 运行对应测试套件确认通过

## 5. 查询：模糊走显示列、精确走主列 JSON

- [ ] 5.1 BizDataListPage 搜索字段：数组组件用 `<key>_text` 列（VARCHAR 可进 filterableColumns）做 LIKE
- [ ] 5.2 BizDataQueryBuilder.appendStructuredFilters：JSON 数组列精确筛选分支——`eq` → `JSON_CONTAINS(col, ?)`（value 序列化为 JSON 片段）、单选 `col->>'$[0]' = ?`、`in` → `JSON_OVERLAPS`
- [ ] 5.3 后端查询构建测试：多选 eq、单选 eq、in 分支生成正确 SQL
- [ ] 5.4 运行对应测试套件确认通过

## 6. 存量迁移与发布重建

- [ ] 6.1 评估并实现已发布表单重新发布时生成 `<key>_text` 列（DDL 新增列）
- [ ] 6.2 存量主列数据回填：路径数组→叶子、单值→数组（迁移脚本或发布时处理）
- [ ] 6.3 验证迁移路径测试

## 7. 全量回归

- [ ] 7.1 前端：`npx vitest run src/views/form src/views/page src/vendor src/components/business` 全量通过
- [ ] 7.2 前端：`npx vue-tsc --noEmit` 无新增错误
- [ ] 7.3 后端：`mvn test` 通过（排除既有无关失败）
