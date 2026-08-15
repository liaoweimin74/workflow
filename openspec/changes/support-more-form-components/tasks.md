
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
