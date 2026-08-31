# page-data-table Specification

## Purpose

TBD - created by archiving change table-form-container-linkage. Update Purpose after archive.

## ADDED Requirements

### Requirement: PageDataTable 首次数据请求 SHALL 单次触发

PageDataTable SHALL 保证页面首次数据请求最多发起一次：挂载时数据源绑定（refId）已就绪，SHALL 由内部 SearchTable 的挂载请求承担首次加载，不再补发；挂载时绑定未就绪（SearchTable 挂载期 refId 为空因而未发请求），SHALL 在绑定就绪后补发且仅补发一次。任何挂载路径下，同参数首次数据请求 SHALL 不超过一次。

#### Scenario: 绑定就绪时挂载仅发一次

- **WHEN** PageDataTable 挂载时数据源绑定已就绪（refId 有值）
- **THEN** 系统 SHALL 仅发起 1 次首次数据请求（由 SearchTable 挂载请求承担）
- **AND** 不因绑定就绪触发补发

#### Scenario: 绑定延迟就绪时补发一次

- **WHEN** PageDataTable 挂载时绑定未就绪（refId 为空，SearchTable 未发请求）
- **AND** 随后数据源绑定就绪
- **THEN** 系统 SHALL 补发 1 次数据请求
- **AND** 后续绑定变化 SHALL 不再自动补发

#### Scenario: 绑定未就绪不发起请求

- **WHEN** refId 为空（数据源绑定未就绪）
- **THEN** SearchTable SHALL 不发起数据请求（保持现有 fetchApi 空返回语义）