# form-runtime Specification

## ADDED Requirements

### Requirement: FORM 容器数据源绑定引擎挂载

FormRenderer SHALL 在渲染 rule 前扫描容器节点（type=formContainer），存在容器时 SHALL 挂载数据源绑定引擎；无容器时 SHALL 跳过引擎挂载（no-op），不影响现有表单渲染。

绑定引擎 SHALL 处理：记录读取回显（记录上下文变化 → getData → 按字段填充容器内组件）、值变化防抖写入（300ms → updateData 乐观锁）、只读数据源（writable=false）跳过写。

FormRenderer SHALL 接收联动配置（schema.links 或容器 props），通过事件总线执行动作链（set-filter/refresh/reload-record/set-value/save-record），模板变量（{node.id}/{row.xxx}/{field.xxx}/{record.xxx}/{param.xxx}）在动作执行时解析。

#### Scenario: 含容器表单挂载引擎
- **WHEN** FormRenderer 渲染含 formContainer 节点的 rule
- **THEN** 绑定引擎挂载
- **AND** 按容器配置从数据源加载记录回显

#### Scenario: 无容器表单不挂载引擎
- **WHEN** FormRenderer 渲染不含 formContainer 节点的 rule
- **THEN** 绑定引擎不挂载
- **AND** 表单按现有行为渲染

#### Scenario: 联动动作执行
- **WHEN** 表单内组件值变化触发联动配置中的动作链
- **THEN** 事件总线按顺序执行动作
- **AND** 动作值中的模板变量替换为实际上下文值
