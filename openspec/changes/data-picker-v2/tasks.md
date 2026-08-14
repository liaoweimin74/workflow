## 1. 后端：引用计数与过滤条件校验

- [ ] 1.1 `BizDataService` 新增 `countReferencedBy()`：遍历全部同租户 BUSINESS 表单 column_config，统计 `pickerConfig.sourceFormKey` 出现次数，返回 `{formKey: count}` 映射（含被引用列表供警告文案使用）
- [ ] 1.2 `BizDataController` 新增 `GET /api/v1/biz-data/referenced-count`，返回全量引用统计（租户隔离）
- [ ] 1.3 发布校验扩展：dataPicker 的 `filters[]` 每条 `column` 校验存在于目标表单 column_config（非 hidden 列），失败返回 400 提示缺失项
- [ ] 1.4 运行时归一化：`dependOn` → 单条 field 型 filter 的内部归一化逻辑（优先读 filters），供选项查询复用
- [ ] 1.5 `resolvePickerValues` 注释更新为"展示缓存尽力而为"语义（行为不变）
- [ ] 1.6 后端测试：引用计数统计、filters 发布校验、双形态归一化（dependOn 与 filters 等价的查询行为）

## 2. 前端：DataPicker.vue 运行时升级

- [ ] 2.1 filters 解析：static 值直接进查询 filter；field 值经 formCreateInject 读取当前表单字段值进 filter
- [ ] 2.2 级联行为修正：`clearOnCascadeChange`（默认 false）→ 依赖条件变化保留已选值与回填、仅刷新选项；true 时保持 v1 清空行为
- [ ] 2.3 悬空降级：resolve 返回缺失 id → 编辑态标红提示"引用数据已删除"；只读态显示原始 id；不阻断提交
- [ ] 2.4 跳转查看：有值且非编辑态时显示文本可点击（viewLink 控制），跳转目标记录详情
- [ ] 2.5 显示优先级：编辑态实时 resolve 优先（失败回退 displayText/_text）
- [ ] 2.6 新增 props 类型与默认值（filters/clearOnCascadeChange/allowCreate/viewLink），向后兼容 v1 props

## 3. 前端：DataPickerConfigDialog.vue 配置升级

- [ ] 3.1 过滤条件编辑器：动态行（目标列 select + 操作符（v2 仅=）+ 值类型 select（static/field）+ 值输入或当前表单字段 select）
- [ ] 3.2 目标表单选择器增强：关键字搜索 + 分类分组（复用表单分类）
- [ ] 3.3 新增配置项：级联清空开关（clearOnCascadeChange）、允许新增开关（allowCreate）、跳转开关（viewLink）
- [ ] 3.4 配置弹窗产出/回填 v2 props（filters 等），兼容读取 v1 dependOn 并展示

## 4. 前端：允许新增

- [ ] 4.1 `DataPickerCreateDialog.vue`（新）：内嵌渲染目标表单 schema 的快速创建表单（复用现有表单渲染能力）
- [ ] 4.2 DataPicker.vue 弹窗"新增"入口（allowCreate=true 时显示）：打开创建弹窗 → 提交成功 → 刷新选项 → 自动选中新记录 → returnFields 回填 → 更新组件值

## 5. 前端：引用感知 UI

- [ ] 5.1 表单管理列表（FormListPage/BizDataListPage）：调 referenced-count 为被引用表单显示"被 N 个表单引用"徽标
- [ ] 5.2 删除被引用表单：确认弹窗提示影响范围（"被 N 个表单引用，删除后引用将无法解析"），确认后才执行
- [ ] 5.3 列配置编辑删除被引用列：提示影响范围（复用 referenced-count 结果）
- [ ] 5.4 `api/bizData.ts` 新增 referencedCount 接口封装

## 6. 验证与收尾

- [ ] 6.1 前端测试：filters 查询参数、级联保留/清空两种行为、新增流程、悬空降级展示
- [ ] 6.2 全量测试通过（前端 vitest + 后端测试），`lsp_diagnostics` 干净
- [ ] 6.3 手动验收：设计器配置（过滤条件/开关）→ 运行时选择（过滤/新增/级联/悬空/跳转）→ 列表徽标与删除警告
