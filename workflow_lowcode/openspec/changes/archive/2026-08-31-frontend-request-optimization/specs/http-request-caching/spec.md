# http-request-caching Specification

## Purpose

HTTP 传输层基础设施：对 GET 请求提供并发去重与显式声明的短 TTL 响应缓存，减少页面加载期的重复请求，兜底同 tick 重复触发。

## ADDED Requirements

### Requirement: GET 请求并发去重

系统 SHALL 对相同 URL 与序列化查询参数的并发 GET 请求执行 in-flight 去重：同一键的后续调用 SHALL 共享首个进行中请求的 Promise，首个请求完成后 SHALL 清理去重记录；请求失败 SHALL 同样清理，允许后续重试。去重 SHALL 仅覆盖 GET 方法，不改变请求的响应语义。

#### Scenario: 并发同键 GET 仅发一次

- **WHEN** 同一渲染周期内两处代码同时调用 GET /api/orgs/tree
- **THEN** 系统 SHALL 仅向服务器发起 1 次请求
- **AND** 两处调用 SHALL 收到同一响应结果

#### Scenario: 请求完成后清理去重记录

- **WHEN** 去重键对应的请求已完成后再次发起同键 GET
- **THEN** 系统 SHALL 重新发起真实请求（不返回已完成的过期 Promise）

#### Scenario: 失败请求允许重试

- **WHEN** 去重键对应的 GET 请求失败（网络错误或业务错误）
- **THEN** 系统 SHALL 清理该键的去重记录
- **AND** 后续同键调用 SHALL 允许重新发起请求

### Requirement: 显式声明接口短 TTL 缓存

系统 SHALL 对显式声明 `cache: true` 的 GET 请求提供短 TTL 响应缓存：缓存 SHALL 按 URL + 序列化查询参数为键，TTL 缺省 30 秒（`cacheTtl` 可覆盖）；缓存命中 SHALL 直接返回缓存数据而不发起网络请求；未声明 `cache: true` 的请求 SHALL 一律绕过缓存。缓存 SHALL 为内存级存储，页面刷新即失效。

#### Scenario: 声明缓存接口 TTL 内命中

- **WHEN** 首次调用声明 `cache: true` 的 GET /api/pages/page2/definition?preview=false
- **AND** 30 秒内再次调用同键
- **THEN** 第二次调用 SHALL 返回缓存数据
- **AND** 不发起网络请求

#### Scenario: 未声明缓存接口不受影响

- **WHEN** 调用未声明 `cache: true` 的 GET 接口
- **THEN** 系统 SHALL 每次发起真实网络请求
- **AND** 不读取或写入缓存

#### Scenario: 缓存过期后重新请求

- **WHEN** 缓存条目 TTL（30 秒）已过期后再次调用同键 GET
- **THEN** 系统 SHALL 重新发起网络请求
- **AND** 以新响应更新缓存

#### Scenario: 非 GET 方法不受缓存影响

- **WHEN** 调用 POST/PUT/DELETE 接口
- **THEN** 系统 SHALL 不执行去重与缓存逻辑

### Requirement: 缓存与去重键与序列化参数一致

系统 SHALL 使用与 axios `paramsSerializer` 输出一致的序列化结果（数组重复键、跳过 undefined/null、encodeURIComponent 编码）作为去重与缓存的键组成部分，保证同一请求在不同调用点的键稳定一致。

#### Scenario: 数组参数生成稳定键

- **WHEN** 两次调用 GET /api/users/batch 携带相同数组参数 ids=[1,2,3]
- **THEN** 两次调用的去重/缓存键 SHALL 相同

#### Scenario: 忽略 undefined/null 参数

- **WHEN** 两次调用携带包含 undefined/null 值的不同参数对象，且其余参数相同
- **THEN** 两次调用的去重/缓存键 SHALL 相同（undefined/null 不参与键计算）