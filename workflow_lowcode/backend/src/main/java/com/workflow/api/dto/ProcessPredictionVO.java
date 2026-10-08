package com.workflow.api.dto;

import java.util.List;

/**
 * 流程执行预测响应 VO。
 *
 * <p>包含完整的执行节点列表（已执行 + 活跃 + 预测），
 * 由 {@code ProcessTaskPredictionService} 组装。
 */
public class ProcessPredictionVO {

    private List<ExecutionNodeVO> nodes;

    public List<ExecutionNodeVO> getNodes() { return nodes; }
    public void setNodes(List<ExecutionNodeVO> nodes) { this.nodes = nodes; }
}
