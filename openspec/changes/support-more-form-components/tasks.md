# Tasks: 支持更多 form-create 组件在业务表单发布中使用

## 1. 后端：ColumnTypeMapper 扩展组件映射

- [ ] 1.1 ColumnTypeMapper.mapComponentToColumn 增加 rate → INT、colorPicker → VARCHAR(16)
- [ ] 1.2 ColumnTypeMapper 增加 tree/elTreeSelect 单选/多选判定（props.showCheckbox / props.multiple → VARCHAR/JSON）
- [ ] 1.3 ColumnTypeMapper 增加 elTransfer → JSON、fcEditor → TEXT、signaturePad → LONGTEXT
- [ ] 1.4 ColumnTypeMapper 增加 subForm → JSON（storageMode=JSON）
- [ ] 1.5 ColumnTypeMapper 修改 checkbox/multiSelect/multiSelectPro → JSON（移除 TEXT 逗号拼接）
- [ ] 1.6 ColumnTypeMapper.UNSUPPORTED_COMPONENTS 移除已支持项（subForm 等）

## 2. 后端：LONGTEXT 列类型支持

- [ ] 2.1 DdlBuilder 白名单/columnDefinition/validateColumns 增加 LONGTEXT 分支
- [ ] 2.2 DdlBuilder sameDefinition/isNarrowing 支持 LONGTEXT 长度语义（无长度，同类比较）
- [ ] 2.3 DynamicTableManager.normalizeType 确认 LONGTEXT → LONGTEXT（区分 TEXT/LONGTEXT 不缩列）
- [ ] 2.4 ColumnTypeMapperTest / DdlBuilderTest / DynamicTableManagerTest 补充 LONGTEXT 用例

## 3. 后端：ColumnConfig.storageMode 与发布分派

- [ ] 3.1 ColumnConfig 增加 storageMode 字段（JSON/SUB_TABLE，默认 JSON）
- [ ] 3.2 FormDefinitionService.publish 对 storageMode=SUB_TABLE 列返回 400（本期未实现）
- [ ] 3.3 FormDefinitionService.UNSUPPORTED_COMPONENTS 调整（移除 subForm，保留 divider/groupContainer/dataTable）
- [ ] 3.4 FormDefinitionPublishBusinessTest 补充 subForm JSON 发布、SUB_TABLE 拒绝、纯展示组件拒绝用例

## 4. 后端：BizDataService JSON 序列化/反序列化

- [ ] 4.1 BizDataService.create/update 对 JSON 列值执行 JSON.stringify 序列化
- [ ] 4.2 BizDataService.toVO 对 JSON 列值 JSON.parse 反序列化（失败原样返回容错）
- [ ] 4.3 BizDataServiceTest 补充 JSON 列读写与旧数据容错用例

## 5. 前端：ColumnConfigDialog 映射扩展

- [ ] 5.1 ColumnConfigDialog.mapComponentToColumn 增加 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm case（与后端对齐）
- [ ] 5.2 ColumnConfigDialog 修改 checkbox/multiSelect 为 JSON 列映射
- [ ] 5.3 ColumnConfigDialog UNSUPPORTED_TYPES 移除已支持项
- [ ] 5.4 ColumnConfigDialog 子表单列标记 hidden（不进列表）
- [ ] 5.5 ColumnConfigDialog 相关测试补充新组件映射用例

## 6. 前端：BizDataListPage 与数据展示适配

- [ ] 6.1 BizDataListPage 子表单（subForm）列不进表格列与筛选列
- [ ] 6.2 BizDataListPage JSON 列展示适配（反序列化数组渲染，复用现有 formatter）
- [ ] 6.3 colorPicker 列展示为色块（可选增强）

## 7. 集成验证

- [ ] 7.1 后端全量测试通过（mvn test）
- [ ] 7.2 前端测试通过（npm run test）
- [ ] 7.3 手工验证：设计器拖入 8 类组件 → 业务表单发布 → 业务数据页 CRUD 往返
- [ ] 7.4 验证 checkbox 多选发布为 JSON 列并正常读写
