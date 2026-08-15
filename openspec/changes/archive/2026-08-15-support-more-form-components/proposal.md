# Proposal: 支持更多 form-create 组件在业务表单发布中使用

## Why

form-create 设计器内置的 8 类组件（评分 rate、颜色选择器 colorPicker、树形控件 tree、树形选择 elTreeSelect、穿梭框 elTransfer、富文本框 fcEditor、手写签名 signaturePad、子表单 subForm）在设计器中可拖拽、在渲染层可正常显示，但业务表单（type=BUSINESS）发布时被前端列映射（ColumnConfigDialog）与后端列映射（ColumnTypeMapper）同时拦截，导致包含这些组件的业务表单**无法发布**。这限制了低代码表单的能力边界：用户设计了评分、富文本、签名等字段，却无法作为业务表单落地。

## What Changes

1. **组件 → 列类型映射扩展**（前后端逐 case 对齐）：
   - `rate` → INT；`colorPicker` → VARCHAR(16)
   - `tree`/`elTreeSelect`：单选 → VARCHAR(255)，多选 → JSON
   - `elTransfer` → JSON；`fcEditor` → TEXT；`signaturePad` → LONGTEXT
   - `subForm` → JSON（storageMode=JSON）
2. **多值组件统一 JSON 列存储**：既有 `checkbox`/`multiSelect` 从"逗号拼接 TEXT"迁移到 JSON 列（不处理老数据兼容）；写入序列化、读取反序列化在 BizDataService 完成。
3. **subForm 整体 JSON 列 + storageMode 开关**：ColumnConfig 新增 `storageMode: 'JSON' | 'SUB_TABLE'`（默认 JSON），发布时按模式分派；SUB_TABLE 本期仅预留不实现。
4. **发布校验调整**：FormDefinitionService / ColumnTypeMapper 的 UNSUPPORTED_COMPONENTS 移除已支持项；subForm 列不进业务数据列表列。

## Capabilities

### New Capabilities
- `biz-form-extra-components`：业务表单发布支持 rate/colorPicker/tree/elTreeSelect/elTransfer/fcEditor/signaturePad/subForm 组件的列映射、建表与数据读写。
- `biz-form-json-multi-values`：多值组件（checkbox/multiSelect/tree 多选/elTreeSelect 多选/elTransfer）以 JSON 列存储的序列化/反序列化约定。

### Modified Capabilities
- `form-definition`：发布校验逻辑（UNSUPPORTED_COMPONENTS 调整、subForm storageMode 分派）。

## Impact

- **后端**：`ColumnTypeMapper.java`（映射扩展）、`FormDefinitionService.java`（校验调整 + storageMode 分派）、`ColumnConfig.java`（storageMode 字段）、`DdlBuilder.java`（LONGTEXT 支持）、`BizDataService.java`（JSON 序列化/反序列化）、相关测试。
- **前端**：`ColumnConfigDialog.vue`（映射扩展）、`BizDataListPage.vue`（subForm 列 hidden、展示适配）、相关测试。
- **数据库**：新增 LONGTEXT 列类型支持（若采用）；既有业务表结构不变，新发布表单新增列。
- **渲染层**：无改动（已验证可渲染）。
- **依赖**：无新增。
