# backend-bean-registry Specification

## Purpose
TBD - created by archiving change backend-logic-config. Update Purpose after archive.
## Requirements
### Requirement: Bean 白名单注册

系统 SHALL 提供本系统服务调用（bean 类型逻辑）的白名单注册机制。开发者 SHALL 通过注解或显式注册方式，将可被流程调用的 Spring Bean 及其方法注册到 `BackendBeanRegistry`。只有注册过的方法才能被设计器选择并在运行时被反射调用。注册信息 SHALL 包含：bean 名称、方法名称、方法参数与返回值元信息，用于运行时校验与调用。

#### Scenario: 注册可调用方法

- **WHEN** 开发者注册了一个 Bean 方法到 `BackendBeanRegistry`
- **THEN** 该方法出现在设计器的「本系统服务」可选项列表中
- **AND** 运行时允许被节点后端逻辑调用

#### Scenario: 未注册方法不可调用

- **WHEN** 一个 Bean 方法未被注册到白名单
- **THEN** 该方法不可在设计器中选择
- **AND** 运行时若尝试调用该方法，系统拒绝执行并记录错误

### Requirement: 方法清单查询接口

系统 SHALL 提供后端接口返回已注册的本系统服务方法清单，供前端设计器下拉选择。接口 SHALL 返回每个可调用项的名称、Bean 名称、方法名等展示信息。

#### Scenario: 加载可调用方法列表

- **WHEN** 用户在设计器配置「调用本系统服务」逻辑并展开方法选择器
- **THEN** 前端调用该方法清单接口
- **AND** 下拉列表展示所有已注册的可调用方法

### Requirement: 流程变量与方法参数映射

本条（bean 类型逻辑）SHALL 支持将流程变量映射为方法参数。设计器 SHALL 提供参数映射配置，将流程变量按顺序传入方法入参。支持数量 SHALL 与注册时声明的方法参数个数一致，不足或多余时运行时给出校验错误。

#### Scenario: 映射流程变量到参数

- **WHEN** 用户配置了一个 Bean 方法，方法接受两个参数 `userId` 与 `amount`
- **AND** 用户将流程变量 `applyUserId` 与 `salary` 映射为对应参数
- **THEN** 运行时调用该方法时以映射后的流程变量值作为参数传入

#### Scenario: 参数个数不匹配

- **WHEN** 用户配置的参数映射数量与注册的方法参数数量不一致
- **THEN** 保存或部署时给出校验错误提示

