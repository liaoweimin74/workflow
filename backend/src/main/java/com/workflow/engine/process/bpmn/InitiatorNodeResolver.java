package com.workflow.engine.process.bpmn;

import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.ExtensionAttribute;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.UserTask;
import org.flowable.engine.RepositoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 发起人节点解析器。
 *
 * <p>从流程定义的 BPMN 模型中找到发起人节点（驳回目标）。
 * 优先匹配带有 wf:nodeRole=initiator 扩展属性的 UserTask，
 * 找不到则回退到第一个 UserTask。
 * 驳回时使用 changeActivityState 将当前节点移回发起人节点。
 */
@Component
public class InitiatorNodeResolver {

    private static final Logger log = LoggerFactory.getLogger(InitiatorNodeResolver.class);

    private final RepositoryService repositoryService;

    public InitiatorNodeResolver(RepositoryService repositoryService) {
        this.repositoryService = repositoryService;
    }

    /**
     * 解析流程定义中的发起人节点 ID。
     *
     * <p>优先返回带有 wf:nodeRole=initiator 扩展属性的 UserTask ID，
     * 找不到则返回第一个 UserTask ID，无 UserTask 时返回 null。
     *
     * @param processDefinitionId 流程定义 ID
     * @return 发起人节点 ID，无 userTask 时返回 null
     */
    public String resolve(String processDefinitionId) {
        BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
        if (model == null) {
            log.warn("无法获取流程定义 [{}] 的 BPMN 模型", processDefinitionId);
            return null;
        }

        Collection<Process> processes = model.getProcesses();
        UserTask firstUserTask = null;

        for (Process process : processes) {
            for (var flowElement : process.getFlowElements()) {
                if (flowElement instanceof UserTask userTask) {
                    // 记录第一个 UserTask 作为回退
                    if (firstUserTask == null) {
                        firstUserTask = userTask;
                    }
                    // 检查是否有 wf:nodeRole=initiator 扩展属性
                    if (hasInitiatorRole(userTask)) {
                        return userTask.getId();
                    }
                }
            }
        }

        if (firstUserTask != null) {
            return firstUserTask.getId();
        }

        log.warn("流程定义 [{}] 中未找到 userTask", processDefinitionId);
        return null;
    }

    /**
     * 检查 UserTask 是否带有 wf:nodeRole=initiator 扩展属性。
     *
     * <p>Flowable 将扩展属性存储在 attributes map 中，key 为属性名。
     * 由于命名空间处理方式不同，key 可能是 "nodeRole" 或 "wf:nodeRole"。
     */
    private boolean hasInitiatorRole(UserTask userTask) {
        Map<String, List<ExtensionAttribute>> attributes = userTask.getAttributes();
        if (attributes == null || attributes.isEmpty()) {
            return false;
        }

        // 检查两种可能的 key: "nodeRole"（标准）和 "wf:nodeRole"（带前缀）
        String[] possibleKeys = {"nodeRole", "wf:nodeRole"};
        for (String key : possibleKeys) {
            List<ExtensionAttribute> attrs = attributes.get(key);
            if (attrs != null) {
                for (ExtensionAttribute attr : attrs) {
                    if ("initiator".equals(attr.getValue())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
