# deploy-change-detection Specification

## Purpose

修复部署变化检测缺陷：当前 `deploy()` 仅比较"改写后 BPMN XML"（只含会签/或签改写），导致审批人、操作权限、超时、表单绑定、`__PROCESS__` 等配置变化不触发部署。本能力将变化检测改为"改写后 XML + 节点配置整体 SHA-256 hash"比较，配置任一变化即可部署，真正无变化才拦截。

## ADDED Requirements

### Requirement: 部署配置 hash 计算

系统 SHALL 在部署时计算配置 hash：`SHA-256(effectiveBpmnXml + "|" + canonicalJson(nodeConfigMap))`。

其中：
- `effectiveBpmnXml`：`MultiInstanceBpmnRewriter.rewrite()` 改写并注入事件名称后的 XML
- `canonicalJson`：nodeConfigMap（含 `__PROCESS__` 键）按 nodeId 排序后的规范化 JSON 序列化（同一配置内容序列化结果必须一致）
- hash 结果 SHALL 为 64 位十六进制字符串，存储于 `wf_process_draft.deployed_config_hash`

#### Scenario: 相同配置内容产生相同 hash

WHEN 对同一份 effectiveBpmnXml 与 nodeConfigMap 计算两次 hash
THEN 两次结果 SHALL 完全一致

#### Scenario: 配置变化导致 hash 变化

WHEN nodeConfigMap 中任一节点配置内容变化（如修改审批人、操作权限、`__PROCESS__` 配置）
THEN 重新计算的 hash SHALL 与变化前不同

### Requirement: 部署变化判定

`deploy(draftId)` SHALL 按以下逻辑判定是否允许部署：

1. 计算当前 hash
2. 若 `deployed_config_hash` 非空：
   - hash 相同 → SHALL 抛出 `BusinessException(400, "流程数据未变化，无需部署")`，不创建部署
   - hash 不同 → 允许部署
3. 若 `deployed_config_hash` 为空（历史数据，降级路径）：
   - 比较 `deployedXml` 与 `effectiveBpmnXml`，相同则拒绝（保持旧行为），不同则允许部署

部署成功后 SHALL 更新 `deployed_config_hash` 为当前 hash，并继续保存 `deployedXml`（供降级路径使用）。

#### Scenario: 仅修改节点操作权限可部署

WHEN 用户修改节点级 `operations.allowTransfer = false`（不影响 BPMN XML）
THEN 点击部署 SHALL 成功创建新版本
AND `deployed_config_hash` SHALL 更新为新的 hash

#### Scenario: 仅修改流程级配置可部署

WHEN 用户修改流程级 `__PROCESS__` 配置（如关闭"允许转办"）
THEN 点击部署 SHALL 成功创建新版本
AND 新版本部署后运行时按新配置解析操作权限

#### Scenario: 内容无变化时拦截

WHEN 用户未修改任何内容（XML 与配置均与上次部署一致）再次点击部署
THEN 接口 SHALL 返回 400 "流程数据未变化，无需部署"
AND SHALL NOT 创建新的 Flowable deployment

#### Scenario: 历史数据首次部署（降级路径）

WHEN 一条已部署过的历史记录（`deployed_config_hash` 为 null）仅修改了节点配置
AND 修改后的 `effectiveBpmnXml` 与 `deployedXml` 不同
THEN 部署 SHALL 成功
AND 部署后 `deployed_config_hash` 被写入
