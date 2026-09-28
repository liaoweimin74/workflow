package com.workflow.engine.task;

import java.util.Map;

/**
 * 选人函数上下文（引擎注入；variables 为快照，修改无效）。
 *
 * <p>对齐 NodeJS 引擎 AssigneeResolveContext：
 * nodeId/nodeName 定位节点，initiator 为发起人（未注入时 null），
 * variables 为流程变量快照（含发起表单字段平铺写入的变量）。
 */
public record AssigneeResolveContext(
        String nodeId,
        String nodeName,
        String initiator,
        Map<String, Object> variables) {
}
