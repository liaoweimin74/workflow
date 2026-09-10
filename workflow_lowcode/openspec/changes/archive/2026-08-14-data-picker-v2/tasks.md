## 1. 后端：引用计数与过滤条件校验

- [x] 1.1 `BizDataService` 新增 `countReferencedBy()`：遍历全部同租户 BUSINESS 表单 column_config，统计 `pickerConfig.sourceFormKey` 出现次数，返回 `{formKey: count}` 映射（含被引用列表供警告文案使用）
- [x] 1.2 `BizDataController` 新增 `GET /api/v1/biz-data/referenced-count`，返回全量引用统计（租户隔离）
- [x] 1.3 发布校验扩展：dataPicker 的 `filters[]` 每条 `column` 校验存在于目标表单 column_config（非 hidden 列），失败返回 400 提示缺失项
- [x] 1.4 运行时归一化：`dependOn` → 单条 field 型 filter 的内部归一化逻辑（优先读 filters），供选项查询复用
- [x] 1.5 `resolvePickerValues` 注释更新为"展示缓存尽力而为"语义（行为不变）
- [x] 1.6 后端测试：引用计数统计、filters 发布校验、双形态归一化（dependOn 与 filters 等价的查询行为）

## 2. 前端：DataPicker.vue 运行时升级

- [x] 2.1 filters 解析：static 值直接进查询 filter；field 值经 formCreateInject 读取当前表单字段值进 filter
- [x] 2.2 级联行为修正：`clearOnCascadeChange`（默认 false）→ 依赖条件变化保留已选值与回填、仅刷新选项；true 时保持 v1 清空行为
- [x] 2.3 悬空降级：resolve 返回缺失 id → 编辑态标红提示"引用数据已删除"；只读态显示原始 id；不阻断提交
- [x] 2.4 跳转查看：有值且非编辑态时显示文本可点击（viewLink 控制），跳转目标记录详情
- [x] 2.5 显示优先级：编辑态实时 resolve 优先（失败回退 displayText/_text）
- [x] 2.6 新增 props 类型与默认值（filters/clearOnCascadeChange/allowCreate/viewLink），向后兼容 v1 props

## 3. 前端：DataPickerConfigDialog.vue 配置升级

- [x] 3.1 过滤条件编辑器：动态行（目标列 select + 操作符（v2 仅=）+ 值类型 select（static/field）+ 值输入或当前表单字段 select）
- [ ] 3.2 目标表单选择器增强：关键字搜索 + 分类分组 —— 搜索已具备（filterable 原有）；**分类分组未实现**：表单定义无分类字段（分类管理仅流程定义侧），无分组数据源，见 verify §4 漂移记录。不阻塞。
- [x] 3.3 新增配置项：级联清空开关（clearOnCascadeChange）、允许新增开关（allowCreate）、跳转开关（viewLink）
- [x] 3.4 配置弹窗产出/回填 v2 props（filters 等），兼容读取 v1 dependOn 并展示

## 4. 前端：允许新增

- [x] 4.1 `DataPickerCreateDialog.vue`（新）：内嵌渲染目标表单 schema 的快速创建表单（复用现有表单渲染能力）
- [x] 4.2 DataPicker.vue 弹窗"新增"入口（allowCreate=true 时显示）：打开创建弹窗 → 提交成功 → 刷新选项 → 自动选中新记录 → returnFields 回填 → 更新组件值

## 5. 前端：引用感知 UI

- [x] 5.1 表单管理列表（FormListPage/BizDataListPage）：调 referenced-count 为被引用表单显示"被 N 个表单引用"徽标
- [x] 5.2 删除被引用表单：确认弹窗提示影响范围（"被 N 个表单引用，删除后引用将无法解析"），确认后才执行
- [ ] 5.3 列配置编辑删除被引用列：提示影响范围 —— **未实现**（增强项）：服务端发布校验已拦截"引用列被删"（400），操作侧弹窗提示为 UI 增强，见 verify §4 漂移记录。不阻塞。
- [x] 5.4 `api/bizData.ts` 新增 referencedCount 接口封装

## 6. 验证与收尾

- [x] 6.1 前端测试：filters 查询参数、级联保留/清空两种行为、新增流程、悬空降级展示
- [x] 6.2 全量测试通过：后端 318/318；前端 195/196（1 个失败为 pre-existing SearchTable 编辑提交测试，与本次改动无关）；vue-tsc 无新增错误（pre-existing 错误与 HEAD 一致）；LSP 对 worktree 路径不可用
- [ ] 6.3 手动验收：设计器配置（过滤条件/开关）→ 运行时选择（过滤/新增/级联/悬空/跳转）→ 列表徽标与删除警告 —— deferred（未启动应用），等价自动化测试覆盖见 verify §7。不阻塞。
