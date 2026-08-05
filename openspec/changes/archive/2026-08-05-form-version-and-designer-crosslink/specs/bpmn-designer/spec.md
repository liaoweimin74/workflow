## ADDED Requirements

### Requirement: 流程设计器跳转表单设计器

流程设计器的节点属性面板 SHALL 提供从表单关联区域直接跳转到表单设计器的能力。

当节点已关联表单（formDefId 非空）时，表单关联区域 SHALL 显示"编辑表单"按钮。点击该按钮 SHALL 跳转到表单设计器页面，并携带当前流程设计器的路由信息作为回跳参数。

表单设计器 SHALL 支持通过 returnTo query 参数回跳到来源页面。当 returnTo 参数存在时，返回按钮 SHALL 优先跳转到 returnTo 指定的路由；否则 SHALL 执行默认的返回行为（router.back()）。

#### Scenario: 从流程设计器跳转到表单设计器
- **WHEN** 用户在流程设计器的节点属性面板中关联了表单
- **AND** 点击"编辑表单"按钮
- **THEN** 系统跳转到 /form/designer?id={formDefId}&returnTo=/designer?id={draftId}
- **AND** 表单设计器加载该表单的定义

#### Scenario: 从表单设计器返回流程设计器
- **WHEN** 用户在表单设计器中点击返回按钮
- **AND** URL 中存在 returnTo query 参数
- **THEN** 系统跳转到 returnTo 指定的路由
- **AND** 用户回到流程设计器页面

#### Scenario: 表单设计器无回跳参数时的返回
- **WHEN** 用户在表单设计器中点击返回按钮
- **AND** URL 中不存在 returnTo query 参数
- **THEN** 系统执行 router.back() 返回上一页

#### Scenario: 未关联表单时不显示跳转按钮
- **WHEN** 节点未关联表单（formDefId 为空）
- **THEN** 表单关联区域不显示"编辑表单"按钮
