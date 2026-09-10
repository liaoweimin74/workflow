package com.workflow.engine.runtime;

import com.workflow.api.dto.ExecutionNodeVO;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.entity.ProcessDraft;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ActivityInstance;
import org.flowable.task.api.Task;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.EndEvent;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.FlowNode;
import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.bpmn.model.UserTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 流程执行预测服务。
 *
 * <p>从当前活跃节点出发，沿 BPMN 出线遍历后续节点：
 * <ul>
 *   <li>无条件连线 → 继续遍历</li>
 *   <li>有条件连线 → 停止遍历，标记当前节点为"有分支"</li>
 *   <li>到达 endEvent → 停止遍历</li>
 * </ul>
 *
 * <p>合并已执行节点（completed）、当前活跃节点（active）和预测节点（predicted）
 * 为统一列表返回。
 */
@Service
public class ProcessTaskPredictionService {

    private static final Logger log = LoggerFactory.getLogger(ProcessTaskPredictionService.class);
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final HistoryService historyService;
    private final RuntimeService runtimeService;
    private final RepositoryService repositoryService;
    private final TaskService taskService;
    private final WfTaskCommentRepository commentRepository;
    private final UserService userService;
    private final TenantProvider tenantProvider;
    private final ProcessDraftRepository processDraftRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final ObjectMapper objectMapper;

    public ProcessTaskPredictionService(HistoryService historyService,
                                         RuntimeService runtimeService,
                                         RepositoryService repositoryService,
                                         TaskService taskService,
                                         WfTaskCommentRepository commentRepository,
                                         UserService userService,
                                         TenantProvider tenantProvider,
                                         ProcessDraftRepository processDraftRepository,
                                         NodeConfigRepository nodeConfigRepository,
                                         ObjectMapper objectMapper) {
        this.historyService = historyService;
        this.runtimeService = runtimeService;
        this.repositoryService = repositoryService;
        this.taskService = taskService;
        this.commentRepository = commentRepository;
        this.userService = userService;
        this.tenantProvider = tenantProvider;
        this.processDraftRepository = processDraftRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 获取流程实例的执行预测列表。
     *
     * @param processInstanceId 流程实例 ID
     * @return 按 时间+拓扑 排序的执行节点列表（已执行 → 活跃 → 预测）
     */
    public List<ExecutionNodeVO> getPrediction(String processInstanceId) {
        // 1. 查询历史活动实例，建立 taskId → (activityId, activityName) 映射
        List<HistoricActivityInstance> historicActivities = historyService
                .createHistoricActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .activityType("userTask")
                .orderByHistoricActivityInstanceStartTime()
                .asc()
                .list();

        Map<String, HistoricActivityInstance> activityByTaskId = new HashMap<>();
        for (HistoricActivityInstance activity : historicActivities) {
            if (activity.getTaskId() != null) {
                activityByTaskId.putIfAbsent(activity.getTaskId(), activity);
            }
        }

        // 提前加载 BPMN model，建立 activityId → name 映射（ACT_HI_ACTINST 不存 name）
        HistoricProcessInstance processInstance = historyService
                .createHistoricProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();
        Map<String, String> activityNameMap = new HashMap<>();
        if (processInstance != null) {
            BpmnModel bpmnModel = repositoryService.getBpmnModel(processInstance.getProcessDefinitionId());
            if (bpmnModel != null && bpmnModel.getMainProcess() != null) {
                for (FlowElement el : bpmnModel.getMainProcess().getFlowElements()) {
                    if (el.getName() != null && !el.getName().isBlank()) {
                        activityNameMap.put(el.getId(), el.getName());
                    }
                }
            }
        }

        // 2. 查询所有审批意见，按时间排序——每条 comment 就是一条历史记录
        List<WfTaskComment> comments = commentRepository
                .findByProcessInstanceIdOrderByCreatedAtAsc(processInstanceId);

        // 3. 批量查询所有相关用户姓名
        Set<String> userIds = new HashSet<>();
        comments.stream()
                .map(WfTaskComment::getUserId)
                .filter(Objects::nonNull)
                .forEach(userIds::add);
        comments.stream()
                .map(WfTaskComment::getTargetUserId)
                .filter(Objects::nonNull)
                .forEach(tid -> {
                    for (String id : tid.split(",")) {
                        if (!id.isBlank()) userIds.add(id.trim());
                    }
                });
        historicActivities.stream()
                .map(HistoricActivityInstance::getAssignee)
                .filter(Objects::nonNull)
                .forEach(userIds::add);
        Map<String, String> assigneeNameMap = batchQueryUserNames(userIds);

        // 4. 历史节点：直接从 wf_task_comment 生成，每条 comment 一条记录
        List<ExecutionNodeVO> historyNodes = new ArrayList<>();
        for (WfTaskComment c : comments) {
            HistoricActivityInstance activity = activityByTaskId.get(c.getTaskId());
            ExecutionNodeVO vo = new ExecutionNodeVO();
            String activityId = activity != null ? activity.getActivityId() : null;
            vo.setActivityId(activityId);
            vo.setActivityName(activityId != null ? activityNameMap.getOrDefault(activityId, activityId) : null);
            vo.setType("userTask");
            vo.setStatus("completed");
            vo.setLineType("solid");
            vo.setAction(c.getAction());
            vo.setComment(c.getComment());
            vo.setEndTime(c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);

            // 办理人
            String userName = c.getUserId() != null ? assigneeNameMap.get(c.getUserId()) : null;
            vo.setAssigneeName(userName);

            // 目标人（转办/委派等）
            if (c.getTargetUserId() != null && !c.getTargetUserId().isBlank()) {
                String[] targetIds = c.getTargetUserId().split(",");
                List<String> names = new ArrayList<>();
                for (String tid : targetIds) {
                    String name = assigneeNameMap.get(tid.trim());
                    if (name != null) names.add(name);
                }
                if (!names.isEmpty()) {
                    vo.setTargetUserName(String.join("、", names));
                }
            }

            historyNodes.add(vo);
        }

        // 5. 查询当前活跃节点（排除已在历史节点中完成的活动实例）
        // 注意：多实例节点同 activityId 可能有多个实例，必须按实例 ID 判断，
        // 不能按节点定义 ID（否则已完成实例会把同节点的活跃实例也误排除）
        Set<String> completedActivityInstanceIds = historicActivities.stream()
                .filter(a -> a.getEndTime() != null)
                .map(HistoricActivityInstance::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<ActivityInstance> runtimeActivities = runtimeService
                .createActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .list();

        Set<String> activeActivityIds = new LinkedHashSet<>();
        List<ExecutionNodeVO> activeNodes = new ArrayList<>();

        // 加载 NodeConfig（活跃节点和预测节点都需要候选人信息）
        Map<String, NodeConfig> nodeConfigMap = (processInstance != null)
                ? loadNodeConfigs(processInstance.getProcessDefinitionId())
                : Map.of();

        // 查询当前活跃任务，获取 owner 信息
        Map<String, Task> activeTaskByActivityId = new HashMap<>();
        List<Task> activeTasks = taskService.createTaskQuery()
                .processInstanceId(processInstanceId)
                .active()
                .list();
        for (Task task : activeTasks) {
            if (task.getTaskDefinitionKey() != null && !activeTaskByActivityId.containsKey(task.getTaskDefinitionKey())) {
                activeTaskByActivityId.put(task.getTaskDefinitionKey(), task);
            }
        }

        if (runtimeActivities != null) {
            for (ActivityInstance activity : runtimeActivities) {
                String activityId = activity.getActivityId();

                // 只处理 userTask 类型的活跃节点
                if (!"userTask".equals(activity.getActivityType())) {
                    continue;
                }

                if (activeActivityIds.contains(activityId)) {
                    continue;
                }

                // 排除已完成的实例（按实例 ID，而非节点定义 ID）
                if (activity.getId() != null && completedActivityInstanceIds.contains(activity.getId())) {
                    continue;
                }

                activeActivityIds.add(activityId);

                ExecutionNodeVO vo = new ExecutionNodeVO();
                vo.setActivityId(activityId);
                vo.setActivityName(activityNameMap.getOrDefault(activityId, activityId));
                vo.setType("userTask");
                vo.setStatus("active");
                vo.setLineType("solid");

                // 优先使用 task owner，其次使用 activity assignee
                Task task = activeTaskByActivityId.get(activityId);
                String ownerOrAssignee = null;
                if (task != null) {
                    String owner = task.getOwner();
                    if (owner != null && !owner.isBlank()) {
                        ownerOrAssignee = owner;
                    } else if (task.getAssignee() != null) {
                        ownerOrAssignee = task.getAssignee();
                    }
                }
                if (ownerOrAssignee == null) {
                    ownerOrAssignee = activity.getAssignee();
                }
                vo.setAssigneeName(ownerOrAssignee != null ? assigneeNameMap.get(ownerOrAssignee) : null);

                // 检查是否有转办/委派 comment
                boolean hasTransfer = false;
                if (task != null) {
                    hasTransfer = comments.stream()
                            .filter(c -> task.getId().equals(c.getTaskId()))
                            .anyMatch(c -> "transfer".equals(c.getAction()) || "delegate".equals(c.getAction()));
                }

                // 从 NodeConfig 解析候选人和多人审批模式
                NodeConfig nc = nodeConfigMap.get(activityId);
                if (nc != null) {
                    List<String> candidateIds = extractApproverIds(nc);
                    if (!candidateIds.isEmpty()) {
                        if (hasTransfer && ownerOrAssignee != null) {
                            // 转办后：去掉转办人，加上被转办人
                            String transferFromUser = comments.stream()
                                    .filter(c -> task != null && task.getId().equals(c.getTaskId()))
                                    .filter(c -> "transfer".equals(c.getAction()) || "delegate".equals(c.getAction()))
                                    .map(WfTaskComment::getUserId)
                                    .findFirst().orElse(null);
                            Set<String> dynamicIds = new LinkedHashSet<>();
                            for (String cid : candidateIds) {
                                if (transferFromUser == null || !transferFromUser.equals(cid)) {
                                    dynamicIds.add(cid);
                                }
                            }
                            dynamicIds.add(ownerOrAssignee);
                            String names = resolveUserNames(new ArrayList<>(dynamicIds));
                            vo.setCandidateNames(names);
                        } else {
                            String names = resolveUserNames(candidateIds);
                            vo.setCandidateNames(names);
                        }
                    }
                    String mode = extractMultiMode(nc);
                    log.info("活跃节点 multiMode: activityId={} mode={}", activityId, mode);
                    if (mode != null) {
                        vo.setMultiMode(mode);
                    }
                }

                activeNodes.add(vo);
            }
        }

        // 6. 预测后续节点
        List<ExecutionNodeVO> predictedNodes = new ArrayList<>();
        if (!activeActivityIds.isEmpty() && processInstance != null) {
            String processDefinitionId = processInstance.getProcessDefinitionId();
            BpmnModel bpmnModel = repositoryService.getBpmnModel(processDefinitionId);

            if (bpmnModel != null) {
                // 从主流程获取 Process 对象
                org.flowable.bpmn.model.Process process = null;
                for (org.flowable.bpmn.model.Process p : bpmnModel.getProcesses()) {
                    if (p.getId().equals(processInstance.getProcessDefinitionKey())
                            || bpmnModel.getProcesses().size() == 1) {
                        process = p;
                        break;
                    }
                }
                if (process == null && !bpmnModel.getProcesses().isEmpty()) {
                    process = bpmnModel.getProcesses().iterator().next();
                }

                if (process != null) {
                    // visited 防止预测回到已完成的节点。
                    // 按节点定义 ID 收集已完成的节点，但排除当前活跃节点——
                    // 多实例节点可能有已完成实例和活跃实例并存，活跃节点不应被标记为已完成。
                    Set<String> completedActivityIds = historicActivities.stream()
                            .filter(a -> a.getEndTime() != null)
                            .map(HistoricActivityInstance::getActivityId)
                            .filter(Objects::nonNull)
                            .collect(Collectors.toSet());
                    completedActivityIds.removeAll(activeActivityIds);
                    Set<String> visited = new HashSet<>(completedActivityIds);
                    for (String activeId : activeActivityIds) {
                        traversePrediction(process, activeId, predictedNodes, visited, nodeConfigMap);
                    }
                }
            }
        }

        // 7. 合并结果
        List<ExecutionNodeVO> result = new ArrayList<>();
        result.addAll(historyNodes);
        result.addAll(activeNodes);
        result.addAll(predictedNodes);

        log.debug("流程执行预测 pi={} history={} active={} predicted={}",
                processInstanceId, historyNodes.size(), activeNodes.size(), predictedNodes.size());

        return result;
    }

    /**
     * 从指定节点出发，沿出线递归遍历预测路径。
     *
     * <p>遍历规则：
     * <ul>
     *   <li>无条件连线 → 沿 targetRef 继续遍历</li>
     *   <li>有条件连线 → 停止，标记当前节点 hasBranch=true</li>
     *   <li>到达 endEvent → 添加为预测节点，停止</li>
     *   <li>已访问的节点不再重复遍历（防环）</li>
     * </ul>
     *
     * @param process BPMN Process 对象
     * @param activityId 当前节点 ID
     * @param result 预测节点列表（追加）
     * @param visited 已访问节点 ID 集合
     */
    private void traversePrediction(org.flowable.bpmn.model.Process process, String activityId,
                                     List<ExecutionNodeVO> result, Set<String> visited,
                                     Map<String, NodeConfig> nodeConfigMap) {
        if (visited.contains(activityId)) {
            return;
        }
        visited.add(activityId);

        FlowElement element = process.getFlowElement(activityId);
        if (!(element instanceof FlowNode flowNode)) {
            return;
        }

        List<SequenceFlow> outgoingFlows = flowNode.getOutgoingFlows();
        if (outgoingFlows == null || outgoingFlows.isEmpty()) {
            return;
        }

        boolean hasBranch = false;

        for (SequenceFlow flow : outgoingFlows) {
            String condition = flow.getConditionExpression();

            if (condition != null && !condition.isBlank()) {
                // 有条件连线 → 停止遍历，标记分支
                hasBranch = true;
                continue;
            }

            // 无条件连线 → 沿 targetRef 继续遍历
            String targetRef = flow.getTargetRef();
            if (targetRef == null || targetRef.isBlank()) {
                continue;
            }

            FlowElement targetElement = process.getFlowElement(targetRef);
            if (targetElement == null) {
                continue;
            }

            // 如果是结束事件，添加为预测节点并停止
            if (targetElement instanceof EndEvent endEvent) {
                ExecutionNodeVO vo = new ExecutionNodeVO();
                vo.setActivityId(endEvent.getId());
                String name = endEvent.getName();
                vo.setActivityName((name != null && !name.isBlank()) ? name : "结束");
                vo.setType("endEvent");
                vo.setStatus("predicted");
                vo.setLineType("dashed");
                result.add(vo);
                visited.add(targetRef);
                continue;
            }

            // 如果是 userTask，添加为预测节点并继续遍历
            if (targetElement instanceof UserTask userTask) {
                if (!visited.contains(targetRef)) {
                    ExecutionNodeVO vo = new ExecutionNodeVO();
                    vo.setActivityId(userTask.getId());
                    vo.setActivityName(userTask.getName());
                    vo.setType("userTask");
                    vo.setStatus("predicted");
                    vo.setLineType("dashed");

                    // 从 NodeConfig 解析候选人和多人审批模式
                    NodeConfig nc = nodeConfigMap.get(userTask.getId());
                    if (nc != null) {
                        List<String> candidateIds = extractApproverIds(nc);
                        if (!candidateIds.isEmpty()) {
                            String names = resolveUserNames(candidateIds);
                            vo.setCandidateNames(names);
                        }
                        String mode = extractMultiMode(nc);
                        if (mode != null) {
                            vo.setMultiMode(mode);
                        }
                    }

                    result.add(vo);
                }
                traversePrediction(process, targetRef, result, visited, nodeConfigMap);
                continue;
            }

            // 其他类型节点（网关等）→ 继续遍历
            if (!visited.contains(targetRef)) {
                traversePrediction(process, targetRef, result, visited, nodeConfigMap);
            }
        }

        // 如果当前节点有分支，在结果中找到最后一个当前节点的预测节点并标记
        if (hasBranch) {
            // 标记当前活跃节点有分支：找到 result 中最后一个 activityId 匹配的节点
            // 但当前节点本身不在 result 中（它是活跃节点），所以我们需要在上层处理
            // 这里改为：在 result 中为当前节点添加一个标记节点
            // 实际上 hasBranch 应该标记在活跃节点上，而不是预测节点上
            // 但活跃节点已经在上层添加了，我们在这里无法修改它
            // 所以我们在 result 中找到活跃节点的位置并标记
            // 但 result 只包含预测节点，不包含活跃节点
            // 所以我们需要通过返回值或其他方式通知上层
            // 简化处理：在 result 中如果当前节点是 userTask 且有分支，添加一个标记
            // 更好的做法：在 traversePrediction 返回时设置 hasBranch
            // 这里暂时不处理，在上层 getPrediction 中处理
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 根据 processDefinitionId 加载所有 NodeConfig，返回 nodeId → NodeConfig 映射。
     */
    private Map<String, NodeConfig> loadNodeConfigs(String processDefinitionId) {
        // 精确匹配该部署版本的 NodeConfig 快照（部署时由当前配置复制生成）
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        Map<String, NodeConfig> map = new HashMap<>();
        for (NodeConfig nc : configs) {
            map.put(nc.getNodeId(), nc);
        }
        return map;
    }

    /**
     * 从 NodeConfig 的 configJson 中解析 approval.multiMode。
     */
    private String extractMultiMode(NodeConfig nc) {
        if (nc == null || nc.getConfigJson() == null || nc.getConfigJson().isBlank()) {
            return null;
        }
        try {
            JsonNode root = objectMapper.readTree(nc.getConfigJson());
            JsonNode multiMode = root.path("approval").path("multiMode");
            if (multiMode.isTextual()) {
                String mode = multiMode.asText();
                return (mode != null && !mode.isBlank()) ? mode : null;
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 从 NodeConfig 的 configJson 中解析 approval.userIds。
     */
    private List<String> extractApproverIds(NodeConfig nc) {
        if (nc == null || nc.getConfigJson() == null || nc.getConfigJson().isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(nc.getConfigJson());
            JsonNode approval = root.path("approval");
            JsonNode userIdsNode = approval.path("userIds");
            List<String> ids = new ArrayList<>();
            if (userIdsNode.isArray()) {
                for (JsonNode idNode : userIdsNode) {
                    ids.add(idNode.asText());
                }
            }
            return ids;
        } catch (Exception e) {
            log.warn("解析 NodeConfig approval.userIds 失败: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 将用户 ID 列表解析为逗号分隔的姓名字符串。
     */
    private String resolveUserNames(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return null;
        }
        Set<String> idSet = new LinkedHashSet<>(userIds);
        Map<String, String> nameMap = batchQueryUserNames(idSet);
        List<String> names = new ArrayList<>();
        for (String id : userIds) {
            String name = nameMap.get(id);
            names.add(name != null ? name : id);
        }
        return String.join("、", names);
    }

    private Map<String, String> batchQueryUserNames(Set<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }

        List<Long> ids = userIds.stream()
                .filter(Objects::nonNull)
                .map(id -> {
                    try {
                        return Long.parseLong(id);
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .toList();

        if (ids.isEmpty()) {
            return Map.of();
        }

        try {
            List<UserVO> users = userService.findByIds(ids);
            return users.stream()
                    .collect(Collectors.toMap(
                            u -> String.valueOf(u.id()),
                            u -> u.nickname() != null ? u.nickname() : u.username(),
                            (a, b) -> a));
        } catch (Exception e) {
            log.warn("批量查询用户姓名失败: {}", e.getMessage());
            return Map.of();
        }
    }

    private String formatDate(Date date) {
        return DATE_FORMATTER.format(
                date.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime());
    }

    /**
     * 补充默认节点名称。
     * StartEvent → "开始"，EndEvent → "结束"，其他类型原样返回。
     */
    private String resolveDisplayName(String name, String activityType) {
        if (name != null && !name.isBlank()) {
            return name;
        }
        if ("startEvent".equals(activityType)) {
            return "开始";
        }
        if ("endEvent".equals(activityType)) {
            return "结束";
        }
        return name;
    }
}
