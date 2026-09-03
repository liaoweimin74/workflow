## 1. 共享数据源配置能力

- [x] 1.1 梳理 DataPicker、LookupPicker、DsBindingEngine 和 dataSourceApi 的共用契约，确定可抽取的配置模型和查询结果类型
- [x] 1.2 抽取或新增共享数据源配置组件，支持 FORM/SYSTEM/API/WORKFLOW、标识、过滤条件和预览
- [x] 1.3 增加普通选项与树形选项的 label/value/children 或父节点字段映射，并完成配置校验

## 2. form-create 设计器扩展

- [x] 2.1 扩展选项规则工厂，增加 datasource 类型并保留现有四种选项类型
- [x] 2.2 将数据源配置组件注册到 vendor，并接入选择器、级联选择器、穿梭框及共用选项规则
- [x] 2.3 增加数据源配置的 schema 序列化、回显和类型切换清理逻辑

## 3. 运行时选项解析

- [x] 3.1 实现统一 datasource resolver，调用现有数据源查询 API 并按字段映射生成普通选项
- [x] 3.2 为级联、树选择和穿梭框生成所需的层级 options 结构，并处理空结果和请求错误
- [x] 3.3 将 resolver 接入设计器预览和正式 FormRenderer，确保 datasource 优先、未绑定时走旧路径

## 4. 验证与回归

- [x] 4.1 为配置模型、字段映射、schema 回显和类型切换增加前端测试
- [x] 4.2 为普通列表、树形列表、空结果、失败请求和四类数据源增加运行时测试
- [x] 4.3 运行前端类型检查、单元测试和构建，确认 form-create 依赖源码未被修改
