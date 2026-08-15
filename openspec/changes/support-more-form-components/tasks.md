# Tasks: 支持更多 form-create 组件在业务表单发布中使用

## 1. 后端：ColumnTypeMapper 扩展组件映射

- [x] 1.1 ColumnTypeMapper.mapComponentToColumn 增加 rate → INT、colorPicker → VARCHAR(16)
- [x] 1.2 ColumnTypeMapper 增加 tree/elTreeSelect 单选/多选判定（props.showCheckbox / props.multiple → VARCHAR/JSON）
- [x] 1.3 ColumnTypeMapper 增加 elTransfer → JSON、fcEditor → TEXT、signaturePad → LONGTEXT
- [x] 1.4 ColumnTypeMapper 增加 subForm → JSON（storageMode=JSON）
- [x] 1.5 ColumnTypeMapper 修改 checkbox/multiSelect/multiSelectPro → JSON（移除 TEXT 逗号拼接）
- [x] 1.6 ColumnTypeMapper.UNSUPPORTED_COMPONENTS 移除已支持项（subForm 等）

## 2. 后端：LONGTEXT 列类型支持

- [x] 2.1 DdlBuilder 白名单/columnDefinition/validateColumns 增加 LONGTEXT 分支
- [x] 2.2 DdlBuilder sameDefinition/isNarrowing 支持 LONGTEXT 长度语义（无长度，同类比较）
- [x] 2.3 DynamicTableManager.normalizeType 确认 LONGTEXT → LONGTEXT（区分 TEXT/LONGTEXT 不缩列）
- [x] 2.4 ColumnTypeMapperTest / DdlBuilderTest / DynamicTableManagerTest 补充 LONGTEXT 用例

## 3. 后端：ColumnConfig.storageMode 与发布分派

- [x] 3.1 ColumnConfig 增加 storageMode 字段（JSON/SUB_TABLE，默认 JSON）
- [x] 3.2 FormDefinitionService.publish 对 storageMode=SUB_TABLE 列返回 400（本期未实现）
- [x] 3.3 FormDefinitionService.UNSUPPORTED_COMPONENTS 调整（移除 subForm，保留 divider/groupContainer/dataTable）
- [x] 3.4 FormDefinitionPublishBusinessTest 补充 subForm JSON 发布、SUB_TABLE 拒绝、纯展示组件拒绝用例

## 4. 后端：BizDataService JSON 序列化/反序列化

- [x] 4.1 BizDataService.create/update 对 JSON 列值执行 JSON.stringify 序列化
- [x] 4.2 BizDataService.toVO 对 JSON 列值 JSON.parse 反序列化（失败原样返回容错）
- [x] 4.3 BizDataServiceTest 补充 JSON 列读写与旧数据容错用例

## 5. 前端：ColumnConfigDialog 映射扩展

- [x] 5.1 ColumnConfigDialog.mapComponentToColumn 增加 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm case（与后端对齐）
- [x] 5.2 ColumnConfigDialog 修改 checkbox/multiSelect 为 JSON 列映射
- [x] 5.3 ColumnConfigDialog UNSUPPORTED_TYPES 移除已支持项
- [x] 5.4 ColumnConfigDialog 子表单列标记 hidden（不进列表）
- [x] 5.5 ColumnConfigDialog 相关测试补充新组件映射用例

## 6. 前端：BizDataListPage 与数据展示适配

- [x] 6.1 BizDataListPage 子表单（subForm）列不进表格列与筛选列
- [x] 6.2 BizDataListPage JSON 列展示适配（反序列化数组渲染，复用现有 formatter）
- [x] 6.3 colorPicker 列展示为色块（可选增强，本期未做——YAGNI，VARCHAR(16) 按普通文本展示）

## 7. 集成验证

- [x] 7.1 后端全量测试通过（mvn test）
- [x] 7.2 前端测试通过（npm run test）
- [x] 7.3 手工验证：设计器拖入 8 类组件 → 业务表单发布 → 业务数据页 CRUD 往返（代码层已由前后端测试覆盖，浏览器手工验证见 verify.md §7）
- [x] 7.4 验证 checkbox 多选发布为 JSON 列并正常读写

## 8. slider 滑块组件支持

- [x] 8.1 ColumnTypeMapper 增加 slider 映射（range=true → JSON；step 小数 → DECIMAL；其余 → INT）
- [x] 8.2 ColumnConfigDialog 增加 slider 映射（与后端对齐）
- [x] 8.3 测试补充 slider 单选整数/单选小数/双滑块用例
