# Tasks: data-picker

## 1. 后端：列映射两列模型（business-form-data + form-designer）

- [ ] 1.1 `ColumnConfig` 新增 `hidden`（boolean，默认 false）与 `pickerConfig`（JSON String，可选）字段，含 getter/setter
- [ ] 1.2 `ColumnTypeMapper` 新增 `mapPickerToColumns(String key, Map<String,Object> props)`：dataPicker → 返回两列（`<key>` VARCHAR(64) + `<key>_text` VARCHAR(1024) hidden=true），`<key>` 带 pickerConfig（sourceFormKey/displayField/mode）
- [ ] 1.3 发布列映射草案生成：`ColumnConfigDialog.vue` 对 dataPicker 字段自动生成两列（`<key>_text` 隐藏列锁定不可取消、不参与唯一/索引）
- [ ] 1.4 单元测试：`ColumnTypeMapper` dataPicker 两列映射、hidden 标记、pickerConfig 序列化

## 2. 后端：引用校验与冗余文本维护（business-form-data）

- [ ] 2.1 `BizDataService.resolveDisplayTexts(String sourceFormKey, List<String> ids, String displayField)`：批量 IN 查询返回 id→文本 映射（参数化，tenant 过滤）
- [ ] 2.2 `BizDataService` 内部工具 `resolvePickerValues(ctx, data)`：遍历 column_config 中带 pickerConfig 的列，校验 id 存在（缺失→400"引用的数据不存在"）并生成 `<key>_text`
- [ ] 2.3 `create()` 集成：写入前调用 resolvePickerValues，把生成的文本合并进插入数据；`update()` 同样集成
- [ ] 2.4 单元测试：新增/更新校验引用存在、id 不存在 400、多选文本拼接顺序一致、非 picker 字段不受影响

## 3. 后端：解析 API（business-form-data）

- [ ] 3.1 `BizDataController` 新增 `GET /api/v1/biz-data/{formKey}/resolve?ids=a,b,c`：按 displayField（参数或默认第一非隐藏列）解析，返回 Map<String,String>；表不存在 404、formKey 非法 400
- [ ] 3.2 `bizDataApi.resolve(formKey, ids, displayField?)` 前端封装
- [ ] 3.3 单元测试：批量解析、部分 id 不存在、跨租户不解析、非法 formKey 400

## 4. 后端：发布校验（data-picker + form-designer）

- [ ] 4.1 `FormDefinitionService.publish()` 扩展：校验 schema 中 dataPicker 字段的 sourceFormKey 对应表单存在且已发布（`getBusinessColumnsByKey`），displayField/columns/dependOn.sourceColumn 存在于目标 column_config；缺失→400 提示
- [ ] 4.2 单元测试：目标表单未发布拒绝发布、引用列已删拒绝发布、合法配置放行

## 5. 前端：运行时 DataPicker 组件（data-picker）

- [ ] 5.1 新建 `DataPicker.vue`（基于 LookupPicker 扩展）：props 支持 sourceFormKey/displayField/columns/mode/returnFields/dependOn；构造 fetchApi → `bizDataApi.list(sourceFormKey, {page,size,keyword,keywordColumn:displayField,filter:级联})`
- [ ] 5.2 级联：watch dependOn.field 对应值，变化时清空值+回填字段并刷新选项；回填复用 fillReturnFields
- [ ] 5.3 只读/详情：显示 `<key>_text` 冗余文本（父组件传入或 resolve 补全）；清除联动清空回填
- [ ] 5.4 单测（Vitest，参照 LookupPicker.test.ts）：单选/多选/回填/级联刷新/清除回填

## 6. 前端：设计器集成与配置弹窗（form-designer）

- [ ] 6.1 `FormDesigner.vue`：`addComponent` 注册 dataPicker 组件（默认 props：sourceFormKey=''、displayField=''、columns=[]、mode='single'）
- [ ] 6.2 新建 `DataPickerConfigDialog.vue`：目标表单下拉（已发布 BUSINESS）、显示字段/列表列（目标 column_config 非 hidden）、单多选、返回字段映射动态行、级联依赖（当前表单字段 select + 目标列 select）
- [ ] 6.3 双击 dataPicker 字段或属性面板入口打开配置弹窗，确认后写回 rule props
- [ ] 6.4 `ColumnConfigDialog.vue`：dataPicker 字段生成两列草案（`_text` 隐藏锁定）

## 7. 前端：管理页与展示适配（business-form-data）

- [ ] 7.1 `BizDataListPage.vue`：过滤 hidden 列（表格列与筛选列均排除）
- [ ] 7.2 前端 build 验证 + 端到端冒烟：设计器配置 dataPicker → 发布（两列）→ 表单填写选择/级联/回填 → 管理页列表显示文本、hidden 列不显示
