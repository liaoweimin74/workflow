
## 9. 签名 TEXT 化与级联选择器 JSON 化

- [x] 9.1 signaturePad 映射 LONGTEXT → TEXT（前后端对齐，避免引入 LONGTEXT 列类型）
- [x] 9.2 cascader 映射 VARCHAR → JSON（值必为数组，VARCHAR 触发 Java 序列化乱码）
- [x] 9.3 DynamicTableManager.getNullableInt 溢出防御（LONGTEXT CHARACTER_MAXIMUM_LENGTH 超 int）
- [x] 9.4 测试补充 cascader JSON、signaturePad TEXT 用例

## 9. 签名 TEXT 化与级联选择器 JSON 化

- [x] 9.1 signaturePad 映射 LONGTEXT → TEXT（前后端对齐，避免引入 LONGTEXT 列类型）
- [x] 9.2 cascader 映射 VARCHAR → JSON（值必为数组，VARCHAR 触发 Java 序列化乱码）
- [x] 9.3 DynamicTableManager.getNullableInt 溢出防御（LONGTEXT CHARACTER_MAXIMUM_LENGTH 超 int）
- [x] 9.4 测试补充 cascader JSON、signaturePad TEXT 用例

## 10. 列渲染支持新增组件类型

- [x] 10.1 ColumnConfig 增加 componentType 字段，ColumnTypeMapper/mapPickerToColumns 设置 componentType
- [x] 10.2 ColumnConfigDialog ColumnConfigItem 增加 componentType，collectFields 写入
- [x] 10.3 TableColumn 增加 render 函数，SearchTable 列渲染优先 render
- [x] 10.4 BizDataListPage 按 componentType 渲染（colorPicker 色块/signaturePad 缩略图/fcEditor 剥 HTML/JSON 逗号拼接/slider 区间）
- [x] 10.5 测试补充：componentType 写入、SearchTable render、BizDataListPage 各组件渲染
