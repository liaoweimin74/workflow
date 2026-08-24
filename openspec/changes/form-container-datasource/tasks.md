# Tasks: form-container-datasource

## 1. FORM 容器组件注册（vendor）

- [x] 1.1 新增 `frontend/src/vendor/config/rule/formContainer.js`：仿照 subForm.js 实现容器规则（name=formContainer、subForm:'object'、loadRule/parseRule 的 children↔props.rule 互转、rule() 返回容器骨架含 dataSourceId/recordLocator props、props() 属性面板）
- [x] 1.2 在 `frontend/src/vendor/config/index.js` 注册 formContainer 规则（照 group/subForm 注册方式）
- [x] 1.3 组件测试：formContainer 规则 loadRule/parseRule 往返序列化（children↔props.rule 一致，字段保留）
- [x] 1.4 组件测试：容器 rule 生成（默认 props 含 dataSourceId=''、recordLocator={type:'current-record'}，field 全局唯一）

## 2. 渲染层数据源绑定引擎

- [x] 2.1 新增 `frontend/src/views/form/components/DsBindingEngine.ts`：扫描 ruleTree 收集 formContainer 节点（dataSourceId + recordLocator + children 字段映射），无容器返回 no-op
- [x] 2.2 引擎读路径：`record-change` 事件 → 解析 recordId → `dataSourceApi.getData(dsId, recordId)` → 按子字段名映射 setValue（含嵌套 group 的 items 数组赋值），容器级 loading
- [x] 2.3 引擎写路径：formApi change 事件 → 防抖 300ms → 收集容器绑定字段 → `dataSourceApi.updateData(dsId, recordId, patch, version)`；writable=false（只读数据源）跳过写
- [x] 2.4 引擎 flush：暴露 flush() 强制完成未决防抖写入；乐观锁冲突（400）→ 提示 + reload-record
- [x] 2.5 组件测试：引擎读路径（record-change → getData → 填充）、写路径（防抖合并、只读跳过、flush）、乐观锁冲突处理
- [x] 2.6 组件测试：多容器同名字段互不干扰（fc_a.name 与 fc_b.name 独立读写）

## 3. 统一联动模型（事件总线）

- [x] 3.1 新增 `frontend/src/views/form/components/DsActionBus.ts`：触发器（field-change/record-change/data-source-change）+ 动作步骤（set-filter/refresh/reload-record/set-value/save-record）
- [x] 3.2 模板变量解析器：`{node.id}` `{row.xxx}` `{field.xxx}` `{record.xxx}` `{param.xxx}`，未知变量替换为空串
- [x] 3.3 组件测试：动作链执行顺序、模板变量解析、未知变量兜底

## 4. FormRenderer 挂载引擎与联动

- [x] 4.1 `FormRenderer.vue`：渲染前扫描 rule 含 formContainer 时挂载 DsBindingEngine + DsActionBus（无容器 no-op，不影响现有渲染）
- [x] 4.2 FormRenderer 接收联动配置（schema.links 或容器 props），组件值变化接入事件总线触发动作链
- [x] 4.3 组件测试：含容器表单挂载引擎并回显、无容器表单按现有行为渲染、联动动作执行
- [x] 4.4 回归：现有 FormRenderer 测试（字段权限、mappedData、深禁用）全部通过

## 5. FormDesigner 容器属性面板

- [x] 5.1 `FormDesigner.vue`：容器属性面板支持 dataSourceId 下拉（复用 `getEnabledDataSources`）+ recordLocator 配置（默认当前表单记录），参照 PageDesigner 的 setComponentRuleConfig 注入模式
- [ ] 5.2 容器绑定数据源后按 metadata 校验子字段存在性（不在列中标记非法）
- [ ] 5.3 组件测试：容器属性配置写入 rule、字段存在性校验

## 6. 页面端容器注册与动作泛化

- [x] 6.1 `PageDesigner.vue`：注册 formContainer 组件到页面组件库，容器可配置数据源
- [x] 6.2 页面动作总线触发器泛化：支持 field-change、record-change；动作步骤支持 reload-record、save-record
- [ ] 6.3 `PageRendererPage.vue`：挂载绑定引擎，记录上下文（路由参数/动作总线）驱动容器读回显
- [ ] 6.4 组件测试：field-change 触发容器刷新、record-change 触发容器回显

## 7. 验证与回归

- [ ] 7.1 前端构建通过（vite build / tsc 无类型错误）
- [x] 7.2 全量前端组件测试通过（含既有 DataPicker/LookupPicker/FormRenderer 回归）
- [ ] 7.3 E2E 验证：业务表单编辑回显 + 值修改写回、页面左树右表联动、多容器同名字段独立
