package com.workflow.engine.task;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 多实例审批人列表设置 Listener。
 *
 * <p>在多实例 userTask 开始时执行，从 NodeConfig 的 approval.userIds 读取审批人 ID 列表，
 * 设置到流程变量 {@code approverList}，供 multiInstanceLoopCharacteristics.collection 使用。
 *
 * <p>需在 BPMN XML 中通过 flowable:executionListener 配置到多实例节点的 start 事件。
 */
@Component("multiInstanceApproverListener")
public class MultiInstanceApproverListener implements JavaDelegate {

    private static final Logger log = LoggerFactory.getLogger(MultiInstanceApproverListener.class);

    private final NodeConfigRepository nodeConfigRepository;
    private final ObjectMapper objectMapper;

    public MultiInstanceApproverListener(NodeConfigRepository nodeConfigRepository,
                                         ObjectMapper objectMapper) {
        this.nodeConfigRepository = nodeConfigRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void execute(DelegateExecution execution) {
        String processDefinitionId = execution.getProcessDefinitionId();
        String activityId = execution.getCurrentActivityId();

        // 精确匹配该部署版本的 NodeConfig 快照（部署时由当前配置复制生成）
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        NodeConfig targetConfig = null;
        for (NodeConfig nc : configs) {
            if (activityId.equals(nc.getNodeId())) {
                targetConfig = nc;
                break;
            }
        }

        if (targetConfig == null) {
            log.warn("MultiInstanceApproverListener: 未找到 NodeConfig nodeId={} processDefinitionId={}",
                    activityId, processDefinitionId);
            return;
        }

        // 解析 approval.userIds
        try {
            JsonNode root = objectMapper.readTree(targetConfig.getConfigJson());
            JsonNode approval = root.path("approval");
            JsonNode userIdsNode = approval.path("userIds");

            List<String> approverList = new ArrayList<>();
            if (userIdsNode.isArray()) {
                for (JsonNode idNode : userIdsNode) {
                    approverList.add(idNode.asText());
                }
            }

            if (approverList.isEmpty()) {
                log.warn("MultiInstanceApproverListener: approval.userIds 为空 nodeId={}", activityId);
                return;
            }

            execution.setVariable("approverList", approverList);
            // 初始化 rejected=false，确保 completionCondition 表达式 ${rejected || ...} 不会因变量不存在而报错
            if (!execution.hasVariable("rejected")) {
                execution.setVariable("rejected", false);
            }
            log.info("MultiInstanceApproverListener: 设置 approverList={} nodeId={}", approverList, activityId);

        } catch (Exception e) {
            log.error("MultiInstanceApproverListener: 解析 NodeConfig 失败 nodeId={}", activityId, e);
        }
    }
}
