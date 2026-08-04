package com.workflow.engine.process.bpmn;

import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.UserTask;
import org.flowable.engine.RepositoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collection;

/**
 * 发起人节点解析器。
 *
 * <p>从流程定义的 BPMN 模型中找到第一个 userTask 作为发起人节点（驳回目标）。
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
     * @param processDefinitionId 流程定义 ID
     * @return 第一个 userTask 的 ID，无 userTask 时返回 null
     */
    public String resolve(String processDefinitionId) {
        BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
        if (model == null) {
            log.warn("无法获取流程定义 [{}] 的 BPMN 模型", processDefinitionId);
            return null;
        }

        Collection<Process> processes = model.getProcesses();
        for (Process process : processes) {
            for (var flowElement : process.getFlowElements()) {
                if (flowElement instanceof UserTask userTask) {
                    return userTask.getId();
                }
            }
        }

        log.warn("流程定义 [{}] 中未找到 userTask", processDefinitionId);
        return null;
    }
}
