package com.workflow.engine.task;

import com.workflow.api.dto.CompleteTaskResponse;
import com.workflow.api.dto.FormConfigResult;
import com.workflow.api.dto.OperationsConfig;
import com.workflow.api.dto.TaskDetailVO;
import com.workflow.api.dto.TaskDoneFilter;
import com.workflow.api.dto.TaskDoneVO;
import com.workflow.api.dto.TaskTodoFilter;
import com.workflow.api.dto.TaskTodoVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.mapping.FormDataMerger;
import com.workflow.engine.form.mapping.VariableMappingWriter;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.config.NodeOptions;
import com.workflow.engine.process.config.NodeOptionsService;
import com.workflow.engine.process.config.ProcessPolicy;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.task.entity.WfTaskRemind;
import com.workflow.engine.task.repository.WfTaskRemindRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class WorkflowTaskService {

    private static final Logger log = LoggerFactory.getLogger(WorkflowTaskService.class);

    /** 退回免审变量：reject 时收集已通过节点（对齐 NodeJS {@code __retakeApprovedNodes}）。 */
    public static final String VAR_RETAKE_APPROVED_NODES = "__retakeApprovedNodes";
    /**
     * 召回重走免重去重的一次性标记（对齐 NodeJS EngineProcessPolicy.skipDedupForRecall）：
     * recallApproval 写入，TaskCreateBehaviorListener 创建任务时消费并清除。
     */
    public static final String RETAKE_SKIP_DEDUP_VAR = "__recallRetakeSkipDedup";

    private final org.flowable.engine.TaskService flowableTaskService;
    private final HistoryService historyService;
    private final TenantProvider tenantProvider;
    private final RuntimeService runtimeService;
    private final RepositoryService repositoryService;
    private final UserService userService;
    private final WfTaskCommentRepository commentRepository;
    private final WfTaskRemindRepository remindRepository;
    private final NodeConfigRepository nodeConfigRepository;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final FormDataMerger formDataMerger;
    private final VariableMappingWriter variableMappingWriter;
    private final ObjectMapper objectMapper;
    private final NodeOptionsService nodeOptionsService;
    private final EngineNotifyService engineNotifyService;
    private final ProcessInstanceService processInstanceService;

    public WorkflowTaskService(org.flowable.engine.TaskService flowableTaskService,
                               HistoryService historyService,
                               TenantProvider tenantProvider,
                               RuntimeService runtimeService,
                               RepositoryService repositoryService,
                               UserService userService,
                               WfTaskCommentRepository commentRepository,
                               WfTaskRemindRepository remindRepository,
                               NodeConfigRepository nodeConfigRepository,
                               InitiatorNodeResolver initiatorNodeResolver,
                               ObjectMapper objectMapper,
                               FormDataMerger formDataMerger,
                               VariableMappingWriter variableMappingWriter,
                               NodeOptionsService nodeOptionsService,
                               EngineNotifyService engineNotifyService,
                               ProcessInstanceService processInstanceService) {
        this.flowableTaskService = flowableTaskService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
        this.runtimeService = runtimeService;
        this.repositoryService = repositoryService;
        this.userService = userService;
        this.commentRepository = commentRepository;
        this.remindRepository = remindRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.objectMapper = objectMapper;
        this.formDataMerger = formDataMerger;
        this.variableMappingWriter = variableMappingWriter;
        this.nodeOptionsService = nodeOptionsService;
        this.engineNotifyService = engineNotifyService;
        this.processInstanceService = processInstanceService;
    }

    public Page<Task> listTodoTasks(String assignee, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskAssignee(assignee)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<Task> listCandidateTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskCandidateUser(userId)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<HistoricTaskInstance> listHistoricTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = historyService.createHistoricTaskInstanceQuery()
                .taskTenantId(tenantId)
                .taskAssignee(userId)
                .finished()
                .orderByHistoricTaskInstanceEndTime()
                .desc();

        long total = query.count();
        List<HistoricTaskInstance> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    // ==================== VO 方法 ====================

    /**
     * 查询待办任务列表，返回 TaskTodoVO 分页（含关联字段）。
     *
     * <p>批量查询 ProcessInstance + UserService 避免 N+1。
     *
     * @param assignee 办理人
     * @param pageable 分页
     * @param filter   过滤参数（processName, initiator, createTimeStart/End）
     * @return TaskTodoVO 分页
     */
    public Page<TaskTodoVO> listTodoTasksVO(String assignee, Pageable pageable, TaskTodoFilter filter) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskAssignee(assignee)
                .orderByTaskCreateTime()
                .desc();

        // createTime 范围过滤（Flowable 原生支持 taskCreatedAfter/Before）
        if (filter != null) {
            if (filter.createTimeStart() != null) {
                query.taskCreatedAfter(parseDate(filter.createTimeStart()));
            }
            if (filter.createTimeEnd() != null) {
                query.taskCreatedBefore(parseDate(filter.createTimeEnd()));
            }
        }

        long total = query.count();
        List<Task> tasks = query.listPage((int) pageable.getOffset(), pageable.getPageSize());

        List<TaskTodoVO> vos = assembleTodoVOs(tasks);

        // 内存过滤 processName / initiator（Flowable TaskQuery 不直接支持）
        if (filter != null) {
            vos = vos.stream()
                    .filter(vo -> matchesProcessName(vo, filter.processName()))
                    .filter(vo -> matchesInitiator(vo, filter.initiator()))
                    .toList();
        }

        return new PageImpl<>(vos, pageable, total);
    }

    /**
     * 查询已办任务列表，返回 TaskDoneVO 分页（含关联字段）。
     *
     * @param userId   办理人
     * @param pageable 分页
     * @param filter   过滤参数（processName, initiator, endTimeStart/End, approveResult）
     * @return TaskDoneVO 分页
     */
    public Page<TaskDoneVO> listHistoricTasksVO(String userId, Pageable pageable, TaskDoneFilter filter) {
        String tenantId = tenantProvider.getTenantId();
        var query = historyService.createHistoricTaskInstanceQuery()
                .taskTenantId(tenantId)
                .taskAssignee(userId)
                .finished()
                .orderByHistoricTaskInstanceEndTime()
                .desc();

        // endTime 范围过滤
        if (filter != null) {
            if (filter.endTimeStart() != null) {
                query.taskCompletedAfter(parseDate(filter.endTimeStart()));
            }
            if (filter.endTimeEnd() != null) {
                query.taskCompletedBefore(parseDate(filter.endTimeEnd()));
            }
        }

        long total = query.count();
        List<HistoricTaskInstance> tasks = new ArrayList<>(query.listPage((int) pageable.getOffset(), pageable.getPageSize()));

        // 补充：用户操作过但未完成的任务（转办/委派/加签/转签后任务已换人），
        // 从 wf_task_comment 按 user_id 反查 taskId，也应出现在已办中
        Set<String> commentTaskIds = commentRepository.findByUserId(userId).stream()
                .map(WfTaskComment::getTaskId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Set<String> existingTaskIds = tasks.stream()
                .map(HistoricTaskInstance::getId)
                .collect(Collectors.toSet());

        // 只查不在已办列表中的任务（去重）
        Set<String> missingTaskIds = commentTaskIds.stream()
                .filter(id -> !existingTaskIds.contains(id))
                .collect(Collectors.toSet());

        if (!missingTaskIds.isEmpty()) {
            List<HistoricTaskInstance> commentTasks = historyService
                    .createHistoricTaskInstanceQuery()
                    .taskTenantId(tenantId)
                    .taskIds(missingTaskIds)
                    .orderByHistoricTaskInstanceEndTime()
                    .desc()
                    .list();
            tasks.addAll(commentTasks);
        }

        List<TaskDoneVO> vos = assembleDoneVOs(tasks);

        // 内存过滤 processName / initiator / approveResult
        if (filter != null) {
            vos = vos.stream()
                    .filter(vo -> matchesProcessName(vo, filter.processName()))
                    .filter(vo -> matchesInitiator(vo, filter.initiator()))
                    .filter(vo -> filter.approveResult() == null || filter.approveResult().equals(vo.getApproveResult()))
                    .toList();
        }

        // 排序：按 endTime 或 createTime 倒序
        vos = vos.stream()
                .sorted(Comparator.comparing(TaskDoneVO::getEndTime,
                        Comparator.nullsFirst(Comparator.naturalOrder())).reversed())
                .toList();

        return new PageImpl<>(vos, pageable, Math.max(total, vos.size()));
    }

    // ==================== VO 组装（批量查询，避免 N+1）====================

    private List<TaskTodoVO> assembleTodoVOs(List<Task> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }

        // 1. 批量收集 processInstanceIds
        Set<String> processInstanceIds = tasks.stream()
                .map(Task::getProcessInstanceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 2. 批量查询 ProcessInstance
        Map<String, ProcessInstance> piMap = batchQueryProcessInstances(processInstanceIds);

        // 3. 批量收集 processDefinitionIds → 查 ProcessDefinition 名称
        Set<String> processDefinitionIds = tasks.stream()
                .map(Task::getProcessDefinitionId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(processDefinitionIds);

        // 4. 批量查询 initiator 变量 + 解析用户名
        Map<String, String> initiatorMap = batchQueryInitiators(processInstanceIds, piMap);
        Map<String, String> initiatorNameMap = batchQueryInitiatorNames(initiatorMap.values());

        // 5. 批量查询催办标记（哪些 task 已有催办记录）
        Set<String> taskIds = tasks.stream().map(Task::getId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<String> remindedTaskIds = batchQueryRemindedTaskIds(taskIds);

        // 6. 组装 VO
        return tasks.stream().map(task -> {
            TaskTodoVO vo = new TaskTodoVO();
            vo.setTaskId(task.getId());
            vo.setProcessInstanceId(task.getProcessInstanceId());
            vo.setProcessDefinitionId(task.getProcessDefinitionId());
            vo.setCurrentNodeName(task.getName());
            vo.setAssignee(task.getAssignee());
            if (task.getCreateTime() != null) {
                vo.setCreateTime(formatDate(task.getCreateTime()));
            }

            ProcessInstance pi = piMap.get(task.getProcessInstanceId());
            if (pi != null) {
                vo.setBusinessKey(pi.getBusinessKey());
            }

            ProcessDefinition pd = pdMap.get(task.getProcessDefinitionId());
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
            }

            String initiator = initiatorMap.get(task.getProcessInstanceId());
            vo.setInitiator(initiator);
            vo.setInitiatorName(initiatorNameMap.get(initiator));

            vo.setReminded(remindedTaskIds.contains(task.getId()));

            return vo;
        }).toList();
    }

    private List<TaskDoneVO> assembleDoneVOs(List<HistoricTaskInstance> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }

        // 1. 批量收集 processInstanceIds
        Set<String> processInstanceIds = tasks.stream()
                .map(HistoricTaskInstance::getProcessInstanceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 2. 批量查询 HistoricProcessInstance
        Map<String, HistoricProcessInstance> piMap = batchQueryHistoricProcessInstances(processInstanceIds);

        // 3. 批量收集 processDefinitionIds → 查 ProcessDefinition 名称
        Set<String> processDefinitionIds = tasks.stream()
                .map(HistoricTaskInstance::getProcessDefinitionId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(processDefinitionIds);

        // 4. 批量查询 initiator 变量 + 解析用户名
        Map<String, String> initiatorMap = batchQueryHistoricInitiators(processInstanceIds);
        Map<String, String> initiatorNameMap = batchQueryInitiatorNames(initiatorMap.values());

        // 4b. 批量查询审批意见（approveResult）
        Map<String, String> approveResultMap = new HashMap<>();
        for (HistoricTaskInstance task : tasks) {
            if (task.getId() == null) continue;
            List<WfTaskComment> comments = commentRepository.findByTaskId(task.getId());
            if (!comments.isEmpty()) {
                // 取最后一条操作
                approveResultMap.put(task.getId(), comments.get(comments.size() - 1).getAction());
            }
        }

        // 4c. 批量查询流程当前待办节点（currentNode，区别于办理节点 currentNodeName）
        Map<String, String> currentNodeMap = new HashMap<>();
        for (String pid : processInstanceIds) {
            List<Task> activeTasks = flowableTaskService.createTaskQuery()
                    .processInstanceId(pid)
                    .active()
                    .list();
            if (activeTasks != null && !activeTasks.isEmpty()) {
                String names = activeTasks.stream()
                        .map(Task::getName)
                        .filter(n -> n != null && !n.isBlank())
                        .distinct()
                        .collect(Collectors.joining("、"));
                if (!names.isBlank()) {
                    currentNodeMap.put(pid, names);
                }
            }
        }

        // 5. 组装 VO
        return tasks.stream().map(task -> {
            TaskDoneVO vo = new TaskDoneVO();
            vo.setTaskId(task.getId());
            vo.setProcessInstanceId(task.getProcessInstanceId());
            vo.setProcessDefinitionId(task.getProcessDefinitionId());
            vo.setCurrentNodeName(task.getName());
            vo.setAssignee(task.getAssignee());
            if (task.getStartTime() != null) {
                vo.setCreateTime(formatDate(task.getStartTime()));
            }
            if (task.getEndTime() != null) {
                vo.setEndTime(formatDate(task.getEndTime()));
            }

            HistoricProcessInstance pi = piMap.get(task.getProcessInstanceId());
            if (pi != null) {
                vo.setBusinessKey(pi.getBusinessKey());
            }

            ProcessDefinition pd = pdMap.get(task.getProcessDefinitionId());
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
            }

            String initiator = initiatorMap.get(task.getProcessInstanceId());
            vo.setInitiator(initiator);
            vo.setInitiatorName(initiatorNameMap.get(initiator));

            // approveResult: 从 wf_task_comment 取该任务的最新操作
            vo.setApproveResult(approveResultMap.get(task.getId()));

            // currentNode: 流程当前待办节点（非办理节点）
            vo.setCurrentNode(currentNodeMap.get(task.getProcessInstanceId()));

            return vo;
        }).toList();
    }

    // ==================== 批量查询辅助方法 ====================

    private Map<String, ProcessInstance> batchQueryProcessInstances(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        List<ProcessInstance> instances = runtimeService.createProcessInstanceQuery()
                .processInstanceIds(processInstanceIds)
                .list();
        return instances.stream()
                .collect(Collectors.toMap(ProcessInstance::getId, Function.identity(), (a, b) -> a));
    }

    private Map<String, HistoricProcessInstance> batchQueryHistoricProcessInstances(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        List<HistoricProcessInstance> instances = historyService.createHistoricProcessInstanceQuery()
                .processInstanceIds(processInstanceIds)
                .list();
        return instances.stream()
                .collect(Collectors.toMap(HistoricProcessInstance::getId, Function.identity(), (a, b) -> a));
    }

    private Map<String, ProcessDefinition> batchQueryProcessDefinitions(Set<String> processDefinitionIds) {
        if (processDefinitionIds.isEmpty()) {
            return Map.of();
        }
        List<ProcessDefinition> defs = repositoryService.createProcessDefinitionQuery()
                .processDefinitionIds(processDefinitionIds)
                .list();
        return defs.stream()
                .collect(Collectors.toMap(ProcessDefinition::getId, Function.identity(), (a, b) -> a));
    }

    /**
     * 批量查询运行中流程实例的 initiator 变量。
     */
    private Map<String, String> batchQueryInitiators(Set<String> processInstanceIds,
                                                     Map<String, ProcessInstance> piMap) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> result = new HashMap<>();
        for (String piId : processInstanceIds) {
            try {
                Object initiator = runtimeService.getVariable(piId, "initiator");
                if (initiator != null) {
                    result.put(piId, String.valueOf(initiator));
                }
            } catch (Exception e) {
                // 流程实例可能已结束，变量不可查
            }
        }
        return result;
    }

    /**
     * 批量查询历史流程实例的 initiator 变量。
     */
    private Map<String, String> batchQueryHistoricInitiators(Set<String> processInstanceIds) {
        if (processInstanceIds.isEmpty()) {
            return Map.of();
        }
        Map<String, String> result = new HashMap<>();
        for (String piId : processInstanceIds) {
            try {
                HistoricVariableInstance hv = historyService.createHistoricVariableInstanceQuery()
                        .processInstanceId(piId)
                        .variableName("initiator")
                        .singleResult();
                if (hv != null && hv.getValue() != null) {
                    result.put(piId, String.valueOf(hv.getValue()));
                }
            } catch (Exception e) {
                // ignore
            }
        }
        return result;
    }

    /**
     * 批量查询用户姓名。
     */
    private Map<String, String> batchQueryInitiatorNames(Collection<String> initiatorIds) {
        if (initiatorIds == null || initiatorIds.isEmpty()) {
            return Map.of();
        }
        List<Long> userIds = initiatorIds.stream()
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

        if (userIds.isEmpty()) {
            return Map.of();
        }

        List<UserVO> users = userService.findByIds(userIds);
        return users.stream()
                .collect(Collectors.toMap(
                        u -> String.valueOf(u.id()),
                        u -> u.nickname() != null ? u.nickname() : u.username(),
                        (a, b) -> a));
    }

    // ==================== 过滤辅助 ====================

    /**
     * 批量查询哪些 taskId 已有催办记录。
     *
     * @param taskIds 任务 ID 集合
     * @return 有催办记录的 taskId 集合
     */
    private Set<String> batchQueryRemindedTaskIds(Set<String> taskIds) {
        if (taskIds == null || taskIds.isEmpty()) {
            return Set.of();
        }
        try {
            return remindRepository.findByTaskIdIn(taskIds).stream()
                    .map(WfTaskRemind::getTaskId)
                    .collect(Collectors.toSet());
        } catch (Exception e) {
            // 查询失败，忽略（默认未催办）
            return Set.of();
        }
    }

    private boolean matchesProcessName(TaskTodoVO vo, String processName) {
        return processName == null ||
                (vo.getProcessName() != null && vo.getProcessName().contains(processName));
    }

    private boolean matchesInitiator(TaskTodoVO vo, String initiator) {
        return initiator == null || initiator.equals(vo.getInitiator());
    }

    // ==================== 日期辅助 ====================

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private Date parseDate(String dateStr) {
        return Date.from(
                java.time.LocalDateTime.parse(dateStr, DATE_FORMATTER)
                        .atZone(ZoneId.systemDefault())
                        .toInstant());
    }

    private String formatDate(Date date) {
        return DATE_FORMATTER.format(
                date.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime());
    }

    public Optional<Task> getTask(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .taskTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(task);
    }

    /**
     * 查询任务详情，返回 TaskDetailVO（含 processName/initiator/initiatorName/businessKey/formKey/variables）。
     *
     * <p>复用批量查询辅助方法，单任务场景直接调用。
     *
     * @param taskId 任务 ID
     * @return TaskDetailVO，任务不存在时返回 Optional.empty()
     */
    public Optional<TaskDetailVO> getTaskDetail(String taskId) {
        Optional<Task> taskOpt = getTask(taskId);
        if (taskOpt.isPresent()) {
            return Optional.of(buildTaskDetailFromRuntime(taskOpt.get()));
        }

        // 运行时表没找到 → 查历史表（已办任务已完成，已从 ACT_RU_TASK 移到 ACT_HI_TASKINST）
        return getHistoricTaskDetail(taskId);
    }

    /**
     * 从运行时 Task 构建 TaskDetailVO。
     */
    private TaskDetailVO buildTaskDetailFromRuntime(Task task) {
        TaskDetailVO vo = new TaskDetailVO();
        vo.setTaskId(task.getId());
        vo.setName(task.getName());
        vo.setDescription(task.getDescription());
        vo.setAssignee(task.getAssignee());
        // assignee userId → nickname
        if (task.getAssignee() != null) {
            Map<String, String> assigneeNameMap = batchQueryInitiatorNames(List.of(task.getAssignee()));
            vo.setAssigneeName(assigneeNameMap.get(task.getAssignee()));
        }
        vo.setProcessInstanceId(task.getProcessInstanceId());
        vo.setProcessDefinitionId(task.getProcessDefinitionId());
        if (task.getCreateTime() != null) {
            vo.setCreateTime(formatDate(task.getCreateTime()));
        }

        // ProcessInstance → businessKey + initiator（复用 batch 查询模式）
        String processInstanceId = task.getProcessInstanceId();
        if (processInstanceId != null) {
            Set<String> piIdSet = Set.of(processInstanceId);

            // 1. 复用 batchQueryProcessInstances 获取运行中 ProcessInstance
            Map<String, ProcessInstance> piMap = batchQueryProcessInstances(piIdSet);
            ProcessInstance pi = piMap.get(processInstanceId);

            if (pi != null) {
                // 流程运行中：直接取 businessKey + initiator 变量
                vo.setBusinessKey(pi.getBusinessKey());

                Map<String, String> initiatorMap = batchQueryInitiators(piIdSet, piMap);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            } else {
                // 2. 流程已结束：fallback 查 HistoricProcessInstance 获取 businessKey
                try {
                    HistoricProcessInstance hpi = historyService.createHistoricProcessInstanceQuery()
                            .processInstanceId(processInstanceId)
                            .singleResult();
                    if (hpi != null) {
                        vo.setBusinessKey(hpi.getBusinessKey());
                    }
                } catch (Exception e) {
                    // 历史查询失败，忽略
                }

                // initiator 变量也从历史变量中获取
                Map<String, String> initiatorMap = batchQueryHistoricInitiators(piIdSet);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            }
        }

        // ProcessDefinition → processName
        String processDefinitionId = task.getProcessDefinitionId();
        if (processDefinitionId != null) {
            Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(Set.of(processDefinitionId));
            ProcessDefinition pd = pdMap.get(processDefinitionId);
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
                vo.setProcessVersion(pd.getVersion());
            }

            // formKey 从 BpmnModel 中当前任务的 UserTask 节点提取
            String formKey = extractFormKey(processDefinitionId, task.getTaskDefinitionKey());
            vo.setFormKey(formKey);

// 判断是否为发起节点
            try {
                String initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
                vo.setIsInitiatorTask(initiatorNodeId != null
                        && initiatorNodeId.equals(task.getTaskDefinitionKey()));
            } catch (Exception e) {
                vo.setIsInitiatorTask(false);
            }
            // 表单字段权限 + 操作权限配置
            FormConfigResult formConfig = extractFormConfig(processDefinitionId, task.getTaskDefinitionKey());
            vo.setFieldPermissions(formConfig != null ? formConfig.getFieldPermissions() : null);
            vo.setOperations(extractOperations(processDefinitionId, task.getTaskDefinitionKey()));

            // Task 61/65：taskRole + 节点行为开关 + 上次签名回填（对齐 NodeJS getTaskDetail）
            fillNodeFlags(vo, processDefinitionId, task.getTaskDefinitionKey(),
                    Boolean.TRUE.equals(vo.getIsInitiatorTask()), task.getAssignee());
        }

        // variables
        try {
            Map<String, Object> variables = flowableTaskService.getVariables(task.getId());
            vo.setVariables(variables);
        } catch (Exception e) {
            vo.setVariables(Map.of());
        }

        // mappedData：跨表单映射聚合（未配置映射时 merge 返回空 → 置 null）
        if (task.getProcessDefinitionId() != null && task.getProcessInstanceId() != null) {
            try {
                Map<String, Object> mappedData = formDataMerger.merge(
                        task.getProcessDefinitionId(), task.getTaskDefinitionKey(), task.getProcessInstanceId());
                vo.setMappedData(mappedData.isEmpty() ? null : mappedData);
            } catch (Exception e) {
                log.warn("Failed to merge mappedData for task [{}]: {}", task.getId(), e.getMessage());
                vo.setMappedData(null);
            }
        }

        return vo;
    }

    /**
     * 从历史表查询已完成的任务详情。
     * 用于已办详情页面——任务完成后已从 ACT_RU_TASK 移到 ACT_HI_TASKINST。
     */
    private Optional<TaskDetailVO> getHistoricTaskDetail(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        HistoricTaskInstance histTask = historyService.createHistoricTaskInstanceQuery()
                .taskId(taskId)
                .taskTenantId(tenantId)
                .singleResult();

        if (histTask == null) {
            return Optional.empty();
        }

        TaskDetailVO vo = new TaskDetailVO();
        vo.setTaskId(histTask.getId());
        vo.setName(histTask.getName());
        vo.setDescription(histTask.getDescription());
        vo.setAssignee(histTask.getAssignee());
        // assignee userId → nickname
        if (histTask.getAssignee() != null) {
            Map<String, String> assigneeNameMap = batchQueryInitiatorNames(List.of(histTask.getAssignee()));
            vo.setAssigneeName(assigneeNameMap.get(histTask.getAssignee()));
        }
        vo.setProcessInstanceId(histTask.getProcessInstanceId());
        vo.setProcessDefinitionId(histTask.getProcessDefinitionId());
        if (histTask.getCreateTime() != null) {
            vo.setCreateTime(formatDate(histTask.getCreateTime()));
        }

        // ProcessInstance → businessKey + initiator
        String processInstanceId = histTask.getProcessInstanceId();
        if (processInstanceId != null) {
            Set<String> piIdSet = Set.of(processInstanceId);

            // 先查运行中实例
            Map<String, ProcessInstance> piMap = batchQueryProcessInstances(piIdSet);
            ProcessInstance pi = piMap.get(processInstanceId);

            if (pi != null) {
                vo.setBusinessKey(pi.getBusinessKey());
                Map<String, String> initiatorMap = batchQueryInitiators(piIdSet, piMap);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            } else {
                // 流程已结束：查历史实例
                try {
                    HistoricProcessInstance hpi = historyService.createHistoricProcessInstanceQuery()
                            .processInstanceId(processInstanceId)
                            .singleResult();
                    if (hpi != null) {
                        vo.setBusinessKey(hpi.getBusinessKey());
                    }
                } catch (Exception e) {
                    // ignore
                }

                Map<String, String> initiatorMap = batchQueryHistoricInitiators(piIdSet);
                String initiator = initiatorMap.get(processInstanceId);
                if (initiator != null) {
                    vo.setInitiator(initiator);
                    Map<String, String> nameMap = batchQueryInitiatorNames(List.of(initiator));
                    vo.setInitiatorName(nameMap.get(initiator));
                }
            }
        }

        // ProcessDefinition → processName + formKey
        String processDefinitionId = histTask.getProcessDefinitionId();
        if (processDefinitionId != null) {
            Map<String, ProcessDefinition> pdMap = batchQueryProcessDefinitions(Set.of(processDefinitionId));
            ProcessDefinition pd = pdMap.get(processDefinitionId);
            if (pd != null) {
                vo.setProcessName(pd.getName() != null ? pd.getName() : pd.getKey());
                vo.setProcessVersion(pd.getVersion());
            }

            String formKey = extractFormKey(processDefinitionId, histTask.getTaskDefinitionKey());
            vo.setFormKey(formKey);

// 判断是否为发起节点
            try {
                String initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
                vo.setIsInitiatorTask(initiatorNodeId != null
                        && initiatorNodeId.equals(histTask.getTaskDefinitionKey()));
            } catch (Exception e) {
                vo.setIsInitiatorTask(false);
            }
            // 表单字段权限 + 操作权限配置（历史任务详情同样填充）
            FormConfigResult formConfig = extractFormConfig(processDefinitionId, histTask.getTaskDefinitionKey());
            vo.setFieldPermissions(formConfig != null ? formConfig.getFieldPermissions() : null);
            vo.setOperations(extractOperations(processDefinitionId, histTask.getTaskDefinitionKey()));

            // Task 61/65：taskRole + 节点行为开关 + 上次签名回填
            fillNodeFlags(vo, processDefinitionId, histTask.getTaskDefinitionKey(),
                    Boolean.TRUE.equals(vo.getIsInitiatorTask()), histTask.getAssignee());
        }

        // variables — 历史变量
        try {
            List<org.flowable.variable.api.history.HistoricVariableInstance> histVars =
                    historyService.createHistoricVariableInstanceQuery()
                            .processInstanceId(processInstanceId)
                            .list();
            Map<String, Object> variables = new java.util.HashMap<>();
            for (var hv : histVars) {
                variables.put(hv.getVariableName(), hv.getValue());
            }
            vo.setVariables(variables);
        } catch (Exception e) {
            vo.setVariables(Map.of());
        }

        // mappedData：历史任务详情同样聚合（未配置映射时置 null）
        if (processDefinitionId != null && processInstanceId != null) {
            try {
                Map<String, Object> mappedData = formDataMerger.merge(
                        processDefinitionId, histTask.getTaskDefinitionKey(), processInstanceId);
                vo.setMappedData(mappedData.isEmpty() ? null : mappedData);
            } catch (Exception e) {
                log.warn("Failed to merge mappedData for historic task [{}]: {}", taskId, e.getMessage());
                vo.setMappedData(null);
            }
        }

        return Optional.of(vo);
    }

    /**
     * 从 BpmnModel 中提取指定 UserTask 节点的 formKey。
     *
     * @param processDefinitionId 流程定义 ID
     * @param taskDefinitionKey   任务定义键（BPMN 节点 ID）
     * @return formKey，未找到时返回 null
     */
    /**
     * 获取任务节点的表单配置。
     * <p>优先级：节点表单 > 流程默认表单。
     * 从 NodeConfig 表中查询，不再依赖 BPMN XML 中的 formKey。
     */
    private String extractFormKey(String processDefinitionId, String taskDefinitionKey) {
        FormConfigResult cfg = extractFormConfig(processDefinitionId, taskDefinitionKey);
        return cfg != null ? cfg.getFormDefId() : null;
    }

    /**
     * 解析任务节点的表单配置（formDefId + fieldPermissions）。
     *
     * <p>解析逻辑：
     * <ol>
     *   <li>优先从节点配置（NodeConfig, nodeId=taskDefKey）读取 form.formDefId 和 form.fieldPermissions</li>
     *   <li>节点未配置 formDefId 时，从流程级配置（NodeConfig, nodeId=__PROCESS__）读取 form.formDefId 和 form.fieldPermissions</li>
     *   <li>均未配置时返回 null</li>
     * </ol>
     * 表单和字段权限作为整体从同一配置层取，不跨层合并。
     *
     * @param processDefinitionId 流程定义 ID
     * @param taskDefinitionKey   任务定义键（BPMN 节点 ID）
     * @return 表单配置，未找到时返回 null
     */
    public FormConfigResult extractFormConfig(String processDefinitionId, String taskDefinitionKey) {
        if (processDefinitionId == null || taskDefinitionKey == null) {
            return null;
        }
        try {
            // 精确匹配该部署版本的 NodeConfig 快照（部署时由当前配置复制生成）
            List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
            FormConfigResult taskCfg = null;
            FormConfigResult processCfg = null;

            for (NodeConfig nc : configs) {
                FormConfigResult cfg = parseFormConfigFromJson(nc.getConfigJson());
                if (cfg == null || cfg.getFormDefId() == null) continue;

                if (taskDefinitionKey.equals(nc.getNodeId())) {
                    taskCfg = cfg;
                } else if ("__PROCESS__".equals(nc.getNodeId())) {
                    processCfg = cfg;
                }
            }

            // 节点表单优先，没有则用流程默认表单
            FormConfigResult selected = taskCfg != null ? taskCfg : processCfg;
            if (selected != null && selected.getFieldPermissions() == null) {
                selected.setFieldPermissions(new HashMap<>());
            }
            return selected;
        } catch (Exception e) {
            log.warn("从 NodeConfig 解析表单配置失败", e);
            return null;
        }
    }

    /**
     * 解析任务节点的操作权限配置。
     *
     * <p>叠加流程级与节点级配置（AND 规则）：从该部署版本的 {@code __PROCESS__} 节点配置读取
     * 流程级总控（JSON 路径 {@code approvalPolicy.operations}，未配置视为全开），从节点配置
     * （NodeConfig, nodeId=taskDefKey）读取节点级 operations，每个开关取两者的 AND。
     * 节点未配置 operations 时按节点级默认值处理。默认值：
     * <ul>
     *   <li>节点级：allowReject: true、allowTransfer: true、allowAddSign: false、allowDelegate: false</li>
     *   <li>流程级：allowReject/allowAddSign/allowTransfer/allowDelegate 均为 true</li>
     * </ul>
     *
     * @param processDefinitionId 流程定义 ID
     * @param taskDefinitionKey   任务定义键（BPMN 节点 ID）
     * @return 操作权限配置（永不为 null）
     */
    public OperationsConfig extractOperations(String processDefinitionId, String taskDefinitionKey) {
        if (processDefinitionId == null || taskDefinitionKey == null) {
            return new OperationsConfig();
        }
        try {
            // 精确匹配该部署版本的 NodeConfig 快照（与 extractFormConfig 保持一致）
            List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
            // 流程级总控（__PROCESS__），未配置视为全开
            OperationsConfig processLevel = new OperationsConfig();
            boolean hasProcessLevel = false;
            for (NodeConfig nc : configs) {
                if ("__PROCESS__".equals(nc.getNodeId())) {
                    processLevel = parseProcessOperations(nc.getConfigJson());
                    hasProcessLevel = true;
                    break;
                }
            }
            // 节点级
            OperationsConfig nodeLevel = new OperationsConfig();
            for (NodeConfig nc : configs) {
                if (taskDefinitionKey.equals(nc.getNodeId())) {
                    nodeLevel = parseOperationsFromConfig(nc.getConfigJson());
                    break;
                }
            }
            if (!hasProcessLevel) {
                // 流程级全开时等价于节点级
                return nodeLevel;
            }
            // 流程级 && 节点级（AND 合并）
            OperationsConfig result = new OperationsConfig();
            result.setAllowReject(processLevel.isAllowReject() && nodeLevel.isAllowReject());
            result.setAllowAddSign(processLevel.isAllowAddSign() && nodeLevel.isAllowAddSign());
            result.setAllowTransfer(processLevel.isAllowTransfer() && nodeLevel.isAllowTransfer());
            result.setAllowDelegate(processLevel.isAllowDelegate() && nodeLevel.isAllowDelegate());
            result.setAllowPass(processLevel.isAllowPass() && nodeLevel.isAllowPass());
            result.setAllowRefuse(processLevel.isAllowRefuse() && nodeLevel.isAllowRefuse());
            result.setAllowReturn(processLevel.isAllowReturn() && nodeLevel.isAllowReturn());
            return result;
        } catch (Exception e) {
            log.warn("从 NodeConfig 解析操作配置失败", e);
            return new OperationsConfig();
        }
    }

    /**
     * 从 NodeConfig JSON 中解析 operations，缺失字段用默认值补全。
     */
    private OperationsConfig parseOperationsFromConfig(String configJson) {
        OperationsConfig result = new OperationsConfig();
        try {
            JsonNode json = objectMapper.readTree(configJson);
            JsonNode ops = json.get("operations");
            if (ops == null || !ops.isObject()) {
                return result;
            }
            if (ops.has("allowReject")) result.setAllowReject(ops.get("allowReject").asBoolean());
            if (ops.has("allowAddSign")) result.setAllowAddSign(ops.get("allowAddSign").asBoolean());
            if (ops.has("allowTransfer")) result.setAllowTransfer(ops.get("allowTransfer").asBoolean());
            if (ops.has("allowDelegate")) result.setAllowDelegate(ops.get("allowDelegate").asBoolean());
            if (ops.has("allowPass")) result.setAllowPass(ops.get("allowPass").asBoolean());
            if (ops.has("allowRefuse")) result.setAllowRefuse(ops.get("allowRefuse").asBoolean());
            if (ops.has("allowReturn")) result.setAllowReturn(ops.get("allowReturn").asBoolean());
        } catch (Exception e) {
            log.warn("从 NodeConfig 解析 operations JSON 失败: {}", e.getMessage());
        }
        return result;
    }

    /**
     * 从 {@code __PROCESS__} 配置解析流程级操作权限（JSON 路径 {@code approvalPolicy.operations}）。
     * 未配置 operations 时返回全开默认值。
     */
    private OperationsConfig parseProcessOperations(String configJson) {
        OperationsConfig result = new OperationsConfig();
        result.setAllowReject(true);
        result.setAllowAddSign(true);
        result.setAllowTransfer(true);
        result.setAllowDelegate(true);
        try {
            JsonNode json = objectMapper.readTree(configJson);
            JsonNode ops = json.path("approvalPolicy").path("operations");
            if (ops.isObject()) {
                if (ops.has("allowReject")) result.setAllowReject(ops.get("allowReject").asBoolean());
                if (ops.has("allowAddSign")) result.setAllowAddSign(ops.get("allowAddSign").asBoolean());
                if (ops.has("allowTransfer")) result.setAllowTransfer(ops.get("allowTransfer").asBoolean());
                if (ops.has("allowDelegate")) result.setAllowDelegate(ops.get("allowDelegate").asBoolean());
                if (ops.has("allowPass")) result.setAllowPass(ops.get("allowPass").asBoolean());
                if (ops.has("allowRefuse")) result.setAllowRefuse(ops.get("allowRefuse").asBoolean());
                if (ops.has("allowReturn")) result.setAllowReturn(ops.get("allowReturn").asBoolean());
            }
        } catch (Exception e) {
            log.warn("从 __PROCESS__ 解析 operations JSON 失败: {}", e.getMessage());
        }
        return result;
    }

    /**
     * 从 NodeConfig JSON 中解析完整表单配置（formDefId + fieldPermissions）。
     *
     * @param configJson NodeConfig 的 config_json
     * @return 表单配置；JSON 无 form 节点或无 formDefId 时返回 null
     */
    private FormConfigResult parseFormConfigFromJson(String configJson) {
        try {
            JsonNode json = objectMapper.readTree(configJson);
            JsonNode form = json.get("form");
            if (form == null || !form.has("formDefId")) {
                return null;
            }
            String val = form.get("formDefId").asText();
            if (val == null || val.isEmpty()) {
                return null;
            }
            FormConfigResult result = new FormConfigResult();
            result.setFormDefId(val);
            Map<String, String> permissions = new HashMap<>();
            JsonNode permNode = form.get("fieldPermissions");
            if (permNode != null && permNode.isObject()) {
                permNode.fields().forEachRemaining(e -> permissions.put(e.getKey(), e.getValue().asText()));
            }
            result.setFieldPermissions(permissions);
            return result;
        } catch (Exception e) {
            log.warn("从 NodeConfig 解析表单配置 JSON 失败: {}", e.getMessage());
            return null;
        }
    }

    @Transactional
    public void claimTask(String taskId, String userId) {
        flowableTaskService.claim(taskId, userId);
    }

    @Transactional
    public void completeTask(String taskId, Map<String, Object> variables) {
        Task task = flowableTaskService.createTaskQuery().taskId(taskId).singleResult();
        if (task != null && task.getDelegationState() != null) {
            flowableTaskService.resolveTask(taskId);
        }
        flowableTaskService.complete(taskId, variables);
    }

    /**
     * 完成任务并返回下一个任务信息。
     *
     * @param taskId    任务 ID
     * @param variables 流程变量
     * @return 包含下一个任务信息和流程结束标志的响应
     */
    @Transactional
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables) {
        return completeTaskWithResponse(taskId, variables, null, null);
    }

    /**
     * 完成任务并返回下一个任务信息，同时写入审批意见（无签名重载）。
     */
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables,
                                                          String userId, String comment) {
        return completeTaskWithResponse(taskId, variables, userId, comment, null);
    }

    /**
     * 完成任务并返回下一个任务信息，同时写入审批意见（支持手写签名）。
     *
     * <p>Task 61/65 门禁（引擎推进前拦截，对齐 NodeJS completeTask）：
     * <ul>
     *   <li>commentRequired=true → 审批/处理意见必填（handler 节点提示语为「处理」）</li>
     *   <li>signature.required=true → 手写签名必填</li>
     *   <li>returnOptions.mustAddSign=true → 必须已有加签意见</li>
     *   <li>operations.allowPass=false → 不允许通过/提交</li>
     * </ul>
     * 意见落库携带 signature（V41 列）；实例结束且发起节点 smsOnEnd=true → 写 SMS_END。
     *
     * @param taskId    任务 ID
     * @param variables 流程变量
     * @param userId    操作人 ID（用于审批意见记录）
     * @param comment   审批意见（可为 null）
     * @param signature 手写签名 dataURL（可为 null）
     * @return 包含下一个任务信息和流程结束标志的响应
     */
    @Transactional
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables,
                                                          String userId, String comment, String signature) {
        // 1. 查当前任务获取 processInstanceId
        Task currentTask = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (currentTask == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processInstanceId = currentTask.getProcessInstanceId();

        // 1b. 节点级门禁（意见必填/必签名/必须加签/allowPass）——引擎推进前拦截
        validateCompleteGate(currentTask, comment, signature);

        // 2. 委派状态的任务需要先 resolve
        org.flowable.task.api.DelegationState state = currentTask.getDelegationState();
        if (state != null) {
            flowableTaskService.resolveTask(taskId);
        }

        // 3. 完成任务
        flowableTaskService.complete(taskId, variables);

        // 3b. 流程变量映射写入（form:* 源需在任务数据流转后读取）
        try {
            if (currentTask.getProcessDefinitionId() != null) {
                variableMappingWriter.write(currentTask.getProcessDefinitionId(), processInstanceId);
            }
        } catch (Exception e) {
            log.warn("Failed to write variable mappings after complete task [{}]: {}", taskId, e.getMessage());
        }

        // 4. 写入审批意见（signature.enabled 节点携带手写签名 dataURL，V41 落库）
        if (userId != null) {
            saveTaskComment(taskId, processInstanceId, userId, "approve", comment, null, signature);
        }

        // 4. 查流程是否仍在运行
        ProcessInstance runningInstance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        boolean processFinished = (runningInstance == null);

        // 4b. 实例结束 + 发起节点 smsOnEnd=true → 给发起人的短信通知（对齐 NodeJS writeInstanceEndSms）
        if (processFinished) {
            writeSmsEndIfConfigured(currentTask.getProcessDefinitionId(), processInstanceId);
        }

        // 5. 如果流程未结束，查下一个任务
        String nextTaskId = null;
        String nextTaskName = null;
        String nextTaskAssignee = null;
        String nextTaskDefinitionKey = null;

        if (!processFinished) {
            Task nextTask = flowableTaskService.createTaskQuery()
                    .processInstanceId(processInstanceId)
                    .singleResult();

            if (nextTask != null) {
                nextTaskId = nextTask.getId();
                nextTaskName = nextTask.getName();
                nextTaskAssignee = nextTask.getAssignee();
                nextTaskDefinitionKey = nextTask.getTaskDefinitionKey();
            }
        }

        return CompleteTaskResponse.builder()
                .processInstanceId(processInstanceId)
                .processFinished(processFinished)
                .nextTaskId(nextTaskId)
                .nextTaskName(nextTaskName)
                .nextTaskAssignee(nextTaskAssignee)
                .nextTaskDefinitionKey(nextTaskDefinitionKey)
                .build();
    }

    @Transactional
    public void delegateTask(String taskId, String userId) {
        flowableTaskService.delegateTask(taskId, userId);
    }

    /**
     * 委派任务并写入审批意见。
     *
     * @param taskId    任务 ID
     * @param delegateTo 被委派人
     * @param fromUser  委派人（操作人）
     * @param comment   委派说明
     */
    @Transactional
    public void delegateTaskWithComment(String taskId, String delegateTo, String fromUser, String comment) {
        // 1. 查询任务获取 processInstanceId
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        // 2. 执行委派
        flowableTaskService.delegateTask(taskId, delegateTo);

        // 3. 写入审批意见
        if (fromUser != null) {
            saveTaskComment(taskId, task.getProcessInstanceId(), fromUser, "delegate", comment, delegateTo);
        }
    }

    // ==================== 审批意见写入辅助 ====================

    /**
     * 保存审批意见到 wf_task_comment 表。
     */
    public void saveTaskComment(String taskId, String processInstanceId, String userId,
                         String action, String comment) {
        saveTaskComment(taskId, processInstanceId, userId, action, comment, null);
    }

    /**
     * 保存审批意见到 wf_task_comment 表（带目标人）。
     */
    public void saveTaskComment(String taskId, String processInstanceId, String userId,
                         String action, String comment, String targetUserId) {
        saveTaskComment(taskId, processInstanceId, userId, action, comment, targetUserId, null);
    }

    /**
     * 保存审批意见到 wf_task_comment 表（带目标人与手写签名；V41 signature 列）。
     */
    public void saveTaskComment(String taskId, String processInstanceId, String userId,
                         String action, String comment, String targetUserId, String signature) {
        WfTaskComment record = new WfTaskComment();
        record.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
        record.setTenantId(tenantProvider.getTenantId());
        record.setTaskId(taskId);
        record.setProcessInstanceId(processInstanceId);
        record.setUserId(userId);
        record.setAction(action);
        record.setComment(comment);
        record.setTargetUserId(targetUserId);
        record.setSignature(signature);
        commentRepository.save(record);
    }

    // ==================== Task 61/65/69 门禁与增量能力 ====================

    /**
     * 流程级策略（{@code __PROCESS__} config_json 归一化；Task 69 对齐 NodeJS loadProcessPolicy）。
     *
     * <p>每次读库无缓存（配置表量小）；读取失败/未配置返回全关默认策略（不改变既有行为）。
     */
    public ProcessPolicy loadProcessPolicy(String processDefinitionId) {
        try {
            for (NodeConfig nc : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
                if (ProcessPolicy.PROCESS_LEVEL_NODE_ID.equals(nc.getNodeId())) {
                    return ProcessPolicy.parseProcessPolicy(nc.getConfigJson());
                }
            }
            return ProcessPolicy.parseProcessPolicy(null);
        } catch (Exception e) {
            log.warn("读取流程级策略失败 defId={}: {}", processDefinitionId, e.getMessage());
            return ProcessPolicy.parseProcessPolicy(null);
        }
    }

    /**
     * 填充节点级增量字段：taskRole / nodeFlags / processFlags / lastSignature。
     *
     * <p>taskRole：isInitiatorTask → initiator；config.taskRole → 显式值；BPMN wf:nodeRole 兑底；
     * 缺省 approver。nodeFlags 与流程级策略合并（Task 69 口径）：
     * <ul>
     *   <li>意见必填 = 节点级 commentRequired OR 流程级 commentPolicy(enabled && scope=ALL)</li>
     *   <li>签名 = 节点显式配置优先，节点未配置时用流程级默认（⚠️ 流程级是「默认值提供者」
     *       而不是总闸：sigEnabled = node.signature.enabled != null ? ... : policy.enabled）</li>
     * </ul>
     * processFlags 透出流程级评论管理三开关与审批召回开关。
     */
    private void fillNodeFlags(TaskDetailVO vo, String processDefinitionId, String nodeKey,
                               boolean isInitiatorTask, String assignee) {
        try {
            vo.setTaskRole(nodeOptionsService.resolveTaskRole(processDefinitionId, nodeKey, isInitiatorTask));
            ProcessPolicy policy = loadProcessPolicy(processDefinitionId);
            TaskDetailVO.NodeFlags flags = new TaskDetailVO.NodeFlags();
            NodeOptions opts = nodeOptionsService.find(processDefinitionId, nodeKey).orElse(null);
            // 意见必填：节点级 OR 流程级 commentPolicy(enabled && scope=ALL)
            boolean commentRequired = (opts != null && Boolean.TRUE.equals(opts.getCommentRequired()))
                    || (policy.isCommentPolicyEnabled() && "ALL".equals(policy.getCommentPolicyScope()));
            flags.setCommentRequired(commentRequired);
            // 签名：节点显式配置优先；节点未配置时用流程级默认（流程级只是默认值提供者）
            Boolean nodeSigEnabled = opts != null ? opts.getSignatureEnabled() : null;
            boolean sigEnabled = nodeSigEnabled != null ? nodeSigEnabled : policy.isSignatureEnabled();
            flags.setSignatureEnabled(sigEnabled);
            Boolean nodeSigRequired = opts != null ? opts.getSignatureRequired() : null;
            flags.setSignatureRequired(sigEnabled ? pick(nodeSigRequired, policy.isSignatureRequired()) : false);
            Boolean nodeSigUseLast = opts != null ? opts.getSignatureUseLast() : null;
            boolean useLast = sigEnabled ? pick(nodeSigUseLast, policy.isSignatureUseLast()) : false;
            flags.setSignatureUseLast(useLast);
            Boolean nodeSigAllowUpload = opts != null ? opts.getSignatureAllowUpload() : null;
            flags.setSignatureAllowUpload(sigEnabled
                    ? pick(nodeSigAllowUpload, policy.isSignatureAllowUpload()) : false);
            // 上次签名回填：仅生效 useLast=true 时查该办理人最近一条带签名的 approve 意见
            if (useLast && assignee != null && !assignee.isBlank()) {
                commentRepository
                        .findFirstByTenantIdAndUserIdAndActionAndSignatureIsNotNullOrderByCreatedAtDesc(
                                tenantProvider.getTenantId(), assignee, "approve")
                        .map(WfTaskComment::getSignature)
                        .ifPresent(vo::setLastSignature);
            }
            vo.setNodeFlags(flags);
            // 流程级策略透出（评论管理 + 审批召回）
            TaskDetailVO.ProcessFlags processFlags = new TaskDetailVO.ProcessFlags();
            processFlags.setCommentDisabled(policy.isCommentDisabled());
            processFlags.setCommentDisallowDelete(policy.isCommentDisallowDelete());
            processFlags.setCommentDisallowAttachment(policy.isCommentDisallowAttachment());
            processFlags.setApproveRecall(policy.isApproveRecall());
            vo.setProcessFlags(processFlags);
        } catch (Exception e) {
            log.warn("填充节点行为标记失败 defId={} node={}: {}", processDefinitionId, nodeKey, e.getMessage());
        }
    }

    /** 三态合并：节点显式值（可能 null）优先，否则落流程级默认。 */
    private static boolean pick(Boolean nodeValue, boolean policyValue) {
        return nodeValue != null ? nodeValue : policyValue;
    }

    /**
     * complete 门禁（对齐 NodeJS completeTask ①-④）。
     *
     * <p>Task 69 流程级合并：意见必填 = 节点级 OR 流程级 commentPolicy(enabled && scope=ALL)；
     * 签名 = 节点显式配置优先，节点未配置时用流程级默认（「默认值提供者」语义）。
     */
    private void validateCompleteGate(Task task, String comment, String signature) {
        String processDefinitionId = task.getProcessDefinitionId();
        String nodeKey = task.getTaskDefinitionKey();
        NodeOptions opts = nodeOptionsService.find(processDefinitionId, nodeKey).orElse(null);
        ProcessPolicy policy = loadProcessPolicy(processDefinitionId);
        String label = task.getName() == null || task.getName().isBlank() ? nodeKey : task.getName();
        // 意见必填 = 节点级 OR 流程级 commentPolicy(enabled && scope=ALL)
        boolean commentRequired = (opts != null && Boolean.TRUE.equals(opts.getCommentRequired()))
                || (policy.isCommentPolicyEnabled() && "ALL".equals(policy.getCommentPolicyScope()));
        if (commentRequired && (comment == null || comment.isBlank())) {
            String taskRole = opts != null ? opts.getTaskRole() : null;
            throw new BusinessException(400,
                    ("handler".equals(taskRole) ? "处理" : "审批")
                            + "意见必填（节点「" + label + "」）");
        }
        // 签名：节点显式配置优先；节点未配置时用流程级默认（流程级只是默认值提供者，不覆盖节点显式配置）
        Boolean nodeSigEnabled = opts != null ? opts.getSignatureEnabled() : null;
        boolean sigEnabled = nodeSigEnabled != null ? nodeSigEnabled : policy.isSignatureEnabled();
        Boolean nodeSigRequired = opts != null ? opts.getSignatureRequired() : null;
        boolean sigRequired = sigEnabled
                ? (nodeSigRequired != null ? nodeSigRequired : policy.isSignatureRequired())
                : false;
        if (sigRequired && (signature == null || signature.isBlank())) {
            throw new BusinessException(400, "此节点要求手写签名（节点「" + label + "」）");
        }
        if (opts != null && Boolean.TRUE.equals(opts.getMustAddSign())
                && !hasAddSignComment(task.getProcessInstanceId(), nodeKey)) {
            throw new BusinessException(400, "此节点必须加签后才能通过（节点「" + label + "」）");
        }
        OperationsConfig operations = extractOperations(processDefinitionId, nodeKey);
        if (!operations.isAllowPass()) {
            throw new BusinessException(400, "该节点不允许通过/提交（节点「" + label + "」）");
        }
    }

    /**
     * refuse 门禁（对齐 NodeJS refuseTask）：allowRefuse/allowReject 权限 →
     * 办理节点无「拒绝」语义（后端兑底拦截）→ 拒绝理由必填。
     *
     * <p>Task 69：理由必填 = 节点级 commentRequired OR 流程级 commentPolicy.enabled
     * （REJECT_RETURN 与 ALL 都覆盖拒绝）。
     */
    public void validateRefuseGate(String taskId, String reason) {
        Task task = flowableTaskService.createTaskQuery().taskId(taskId).singleResult();
        if (task == null) {
            throw new BusinessException(400, "Task not found: " + taskId);
        }
        String processDefinitionId = task.getProcessDefinitionId();
        String nodeKey = task.getTaskDefinitionKey();
        OperationsConfig operations = extractOperations(processDefinitionId, nodeKey);
        if (!operations.isAllowRefuse() && !operations.isAllowReject()) {
            throw new BusinessException(400, "该节点不允许拒绝");
        }
        NodeOptions opts = nodeOptionsService.find(processDefinitionId, nodeKey).orElse(null);
        if (opts != null && "handler".equals(opts.getTaskRole())) {
            throw new BusinessException(400, "办理节点不支持拒绝操作");
        }
        // 拒绝理由必填 = 节点级 OR 流程级 commentPolicy(enabled)（REJECT_RETURN 与 ALL 都覆盖拒绝）
        ProcessPolicy policy = loadProcessPolicy(processDefinitionId);
        boolean refuseCommentRequired = (opts != null && Boolean.TRUE.equals(opts.getCommentRequired()))
                || policy.isCommentPolicyEnabled();
        if (refuseCommentRequired && (reason == null || reason.isBlank())) {
            String label = task.getName() == null || task.getName().isBlank() ? nodeKey : task.getName();
            throw new BusinessException(400, "审批意见必填（节点「" + label + "」）");
        }
    }

    /** 此实例+节点下是否存在加签意见（mustAddSign 门禁用；对齐 NodeJS hasAddSignComment）。 */
    private boolean hasAddSignComment(String processInstanceId, String nodeKey) {
        try {
            Set<String> taskIds = new HashSet<>();
            List<Task> openTasks = flowableTaskService.createTaskQuery()
                    .processInstanceId(processInstanceId)
                    .taskDefinitionKey(nodeKey)
                    .list();
            for (Task t : openTasks) {
                taskIds.add(t.getId());
            }
            List<HistoricTaskInstance> histTasks = historyService.createHistoricTaskInstanceQuery()
                    .processInstanceId(processInstanceId)
                    .taskDefinitionKey(nodeKey)
                    .list();
            for (HistoricTaskInstance t : histTasks) {
                taskIds.add(t.getId());
            }
            if (taskIds.isEmpty()) {
                return false;
            }
            for (WfTaskComment c : commentRepository.findByProcessInstanceId(processInstanceId)) {
                if ("add_sign".equals(c.getAction()) && c.getTaskId() != null
                        && taskIds.contains(c.getTaskId())) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            log.warn("查询加签意见失败 instance={} node={}: {}", processInstanceId, nodeKey, e.getMessage());
            return false;
        }
    }

    /** 实例结束 + 发起节点 smsOnEnd=true → 给发起人的短信通知记录（initiator 从历史变量读取）。 */
    private void writeSmsEndIfConfigured(String processDefinitionId, String processInstanceId) {
        try {
            if (processDefinitionId == null) {
                return;
            }
            String initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
            if (initiatorNodeId == null) {
                return;
            }
            NodeOptions opts = nodeOptionsService.find(processDefinitionId, initiatorNodeId).orElse(null);
            if (opts == null || !Boolean.TRUE.equals(opts.getSmsOnEnd())) {
                return;
            }
            String initiator = null;
            try {
                Object var = runtimeService.getVariable(processInstanceId, "initiator");
                initiator = var == null ? null : String.valueOf(var);
            } catch (Exception ignored) {
                // 实例已结束，运行时变量已清理 → 历史变量兑底
            }
            if (initiator == null || initiator.isBlank()) {
                HistoricVariableInstance histVar = historyService.createHistoricVariableInstanceQuery()
                        .processInstanceId(processInstanceId)
                        .variableName("initiator")
                        .singleResult();
                initiator = histVar == null || histVar.getValue() == null
                        ? null : String.valueOf(histVar.getValue());
            }
            if (initiator != null && !initiator.isBlank()) {
                engineNotifyService.writeSmsEnd(tenantProvider.getTenantId(), processInstanceId, initiator);
            }
        } catch (Exception e) {
            log.warn("写入实例结束通知失败 instance={}: {}", processInstanceId, e.getMessage());
        }
    }

    /**
     * 发起人撤回流程（回退到发起节点等待重新提交；对齐 NodeJS recallInstance）。
     *
     * <p>门禁：实例运行中 + 调用者为发起人 + 发起节点未配置 disallowRecall
     * + 活跃节点未配置 blockRecall。撤回后设变量 recalled=true，意见 action='recall'。
     */
    @Transactional
    public void recallInstance(String instanceId, String userId, String reason) {
        // 1. 实例必须仍在运行
        ProcessInstance instance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(instanceId)
                .singleResult();
        if (instance == null) {
            throw new BusinessException(400, "流程已结束，无法撤回");
        }

        // 2. 只有发起人可以撤回（initiator 变量口径，与详情页/已办列表一致）
        String initiator = null;
        try {
            Object var = runtimeService.getVariable(instanceId, "initiator");
            initiator = var == null ? null : String.valueOf(var);
        } catch (Exception ignored) {
            // 变量缺失按非发起人处理
        }
        if (initiator == null || initiator.isBlank() || userId == null || !initiator.equals(userId)) {
            throw new BusinessException(400, "只有发起人可以撤回流程");
        }

        // 3. 发起节点定位
        String processDefinitionId = instance.getProcessDefinitionId();
        String initiatorNodeId;
        try {
            initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
        } catch (Exception e) {
            initiatorNodeId = null;
        }
        if (initiatorNodeId == null) {
            throw new BusinessException(400, "流程缺少发起节点，无法撤回");
        }

        // 4. 发起节点配置：不允许撤销/撤回
        NodeOptions initiatorOpts = nodeOptionsService.find(processDefinitionId, initiatorNodeId).orElse(null);
        if (initiatorOpts != null && Boolean.TRUE.equals(initiatorOpts.getDisallowRecall())) {
            throw new BusinessException(400, "发起人已配置不允许撤销/撤回");
        }

        // 5. 活跃节点配置：到达此节点后禁止撤销/撤回
        List<Task> openTasks = flowableTaskService.createTaskQuery()
                .processInstanceId(instanceId)
                .list();
        if (openTasks.isEmpty()) {
            throw new BusinessException(400, "流程无待办任务，无法撤回");
        }
        for (Task openTask : openTasks) {
            NodeOptions opts = nodeOptionsService
                    .find(processDefinitionId, openTask.getTaskDefinitionKey()).orElse(null);
            if (opts != null && Boolean.TRUE.equals(opts.getBlockRecall())) {
                String label = openTask.getName() == null || openTask.getName().isBlank()
                        ? openTask.getTaskDefinitionKey() : openTask.getName();
                throw new BusinessException(400, "流程已到达「" + label + "」，该节点禁止撤销/撤回");
            }
        }

        // 6. 设撤回标记（触发 MI completionCondition 终止多实例活动）并整体回退到发起节点
        runtimeService.setVariable(instanceId, "recalled", true);
        List<String> activityIds = openTasks.stream()
                .map(Task::getTaskDefinitionKey)
                .distinct()
                .toList();
        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(instanceId)
                .moveActivityIdsToSingleActivityId(activityIds, initiatorNodeId)
                .changeState();

        // 7. 变量映射写入（撤回后发起人重新填报）
        try {
            variableMappingWriter.write(processDefinitionId, instanceId);
        } catch (Exception e) {
            log.warn("Failed to write variable mappings after recall instance [{}]: {}",
                    instanceId, e.getMessage());
        }

        // 8. 意见 action='recall'
        saveTaskComment(openTasks.get(0).getId(), instanceId, userId, "recall", reason);
    }

    // ==================== Task 69 审批召回 ====================

    /**
     * 审批召回：审批人撤回自己<strong>已办理</strong>的审批，流程回到该节点等待重新处理
     * （对齐 NodeJS recallApproval；与「发起人撤回」{@link #recallInstance} 不是一回事）。
     *
     * <p>门禁链（对齐钉钉「审批召回」，错误消息与 NodeJS 逐字一致）：
     * <ol>
     *   <li>流程级 approveRecall 开启；</li>
     *   <li>任务已完成且调用者 = 办理人（403）；</li>
     *   <li>实例 RUNNING；</li>
     *   <li>召回之后没有其他审批人再办结（比较 end_time，「下个节点审批前」）；</li>
     *   <li>发起节点任务不支持（走 recallInstance）；</li>
     *   <li>多实例（会签/依次）节点 v1 整体不支持（引擎重走会重置 MI 计数）。</li>
     * </ol>
     *
     * <p>动作：设变量 approveRecalled=true + 当前活跃节点整体移回目标任务节点
     * （changeActivityState，与 recallInstance 同款用法）+ 意见 action='approve_recall'。
     * 另设一次性变量 {@code __recallRetakeSkipDedup}：召回重走会命中「已办过去重」
     * （Node 端 EngineProcessPolicy.skipDedupForRecall 的 Java 等价），由
     * TaskCreateBehaviorListener 创建任务时消费并清除，否则召回者会被去重 auto-pass 掉。
     */
    @Transactional
    public void recallApproval(String taskId, String userId) {
        // 1. 任务已完成（运行时表查得到 = 未办结；已办任务在 ACT_HI_TASKINST）
        Task runtimeTask = flowableTaskService.createTaskQuery().taskId(taskId).singleResult();
        if (runtimeTask != null) {
            throw new BusinessException(400, "仅已办理的审批任务可以召回");
        }
        HistoricTaskInstance task = historyService.createHistoricTaskInstanceQuery()
                .taskId(taskId)
                .singleResult();
        if (task == null) {
            throw new BusinessException(400, "任务不存在: " + taskId);
        }
        if (task.getEndTime() == null || task.getDeleteReason() != null) {
            // deleteReason 非空 = 被驳回/撤回撤销的任务，不属于「已办理的审批」
            throw new BusinessException(400, "仅已办理的审批任务可以召回");
        }
        if (userId == null || userId.isBlank() || !userId.equals(task.getAssignee())) {
            throw new BusinessException(403, "仅任务办理人本人可以召回");
        }

        String instanceId = task.getProcessInstanceId();
        String processDefinitionId = task.getProcessDefinitionId();
        String nodeKey = task.getTaskDefinitionKey();

        // 2. 实例运行中
        ProcessInstance instance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(instanceId)
                .singleResult();
        if (instance == null) {
            throw new BusinessException(400, "流程已结束，无法召回");
        }

        // 3. 发起节点任务不支持召回
        String initiatorNodeId;
        try {
            initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);
        } catch (Exception e) {
            initiatorNodeId = null;
        }
        if (initiatorNodeId != null && initiatorNodeId.equals(nodeKey)) {
            throw new BusinessException(400, "发起节点任务不支持召回");
        }

        // 4. 多实例（会签/依次）节点 v1 拒绝（approval.multiMode 非 single）
        NodeOptions opts = nodeOptionsService.find(processDefinitionId, nodeKey).orElse(null);
        if (opts != null && opts.getMultiMode() != null && !"single".equals(opts.getMultiMode())) {
            throw new BusinessException(400, "会签/依次审批节点暂不支持召回");
        }

        // 5. 流程级 approveRecall 开关
        ProcessPolicy policy = loadProcessPolicy(processDefinitionId);
        if (!policy.isApproveRecall()) {
            throw new BusinessException(400, "该流程未开启审批召回");
        }

        // 6. 召回之后没有其他审批人再办结：比较完成时间（end_time 之后同实例的已完成任务）
        //    ⚠️ 排除 deleteReason 非空的记录（被撤销的任务不算「已办理」）
        List<HistoricTaskInstance> laterTasks = historyService.createHistoricTaskInstanceQuery()
                .processInstanceId(instanceId)
                .finished()
                .taskCompletedAfter(task.getEndTime())
                .list();
        boolean laterHandled = laterTasks.stream()
                .anyMatch(t -> t.getEndTime() != null && t.getDeleteReason() == null);
        if (laterHandled) {
            throw new BusinessException(400, "后续节点已有人办理，无法召回");
        }

        // 7. 动作：approveRecalled=true + 召回重走免重去重标记 + 当前活跃节点整体移回目标任务节点
        runtimeService.setVariable(instanceId, "approveRecalled", true);
        runtimeService.setVariable(instanceId, RETAKE_SKIP_DEDUP_VAR, true);
        List<Task> openTasks = flowableTaskService.createTaskQuery()
                .processInstanceId(instanceId)
                .list();
        if (openTasks.isEmpty()) {
            throw new BusinessException(400, "流程无待办任务，无法召回");
        }
        List<String> activityIds = openTasks.stream()
                .map(Task::getTaskDefinitionKey)
                .distinct()
                .toList();
        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(instanceId)
                .moveActivityIdsToSingleActivityId(activityIds, nodeKey)
                .changeState();

        // 8. 意见 action='approve_recall'
        saveTaskComment(taskId, instanceId, userId, "approve_recall", "审批召回，重新处理");
    }

    /**
     * 再次发起（对齐 NodeJS reInitiate，语义对齐钉钉「再次发起」）：
     * <ul>
     *   <li>仅<strong>已结束</strong>实例可再次发起（运行中/挂起 → 400）</li>
     *   <li>仅原发起人可再次发起 → 403 语义（BusinessException 403）</li>
     *   <li>发起节点 reInitiate=false → 400「该流程不支持再次发起」</li>
     *   <li>复制原实例全部流程变量作为新实例发起变量，按 processKey+businessKey 开新实例</li>
     * </ul>
     * ⚠️ reInitiate 校验读<strong>最新部署版本</strong>的发起节点配置（操作发生在当下，
     * 配置取当下）；实例运行态仍按各自的冻结版本，互不影响。
     *
     * @return 新实例信息（processInstanceId / processDefinitionId）
     */
    @Transactional
    public Map<String, Object> reInitiate(String instanceId, String userId) {
        // 1. 已结束校验：运行时表仍可查到（含挂起）→ 未结束
        ProcessInstance running = runtimeService.createProcessInstanceQuery()
                .processInstanceId(instanceId)
                .singleResult();
        if (running != null) {
            throw new BusinessException(400, "流程仍在进行中，无法再次发起");
        }

        // 2. 历史实例
        HistoricProcessInstance hpi = historyService.createHistoricProcessInstanceQuery()
                .processInstanceId(instanceId)
                .singleResult();
        if (hpi == null) {
            throw new BusinessException(400, "流程实例不存在: " + instanceId);
        }

        // 3. 发起人校验（initiator 变量口径，与列表/详情一致）
        String initiator = null;
        try {
            HistoricVariableInstance initiatorVar = historyService.createHistoricVariableInstanceQuery()
                    .processInstanceId(instanceId)
                    .variableName("initiator")
                    .singleResult();
            initiator = initiatorVar == null || initiatorVar.getValue() == null
                    ? null : String.valueOf(initiatorVar.getValue());
        } catch (Exception ignored) {
            // 变量缺失按未知发起人处理
        }
        if (initiator != null && !initiator.isBlank()
                && (userId == null || !initiator.equals(userId))) {
            throw new BusinessException(403, "只有发起人可以再次发起");
        }

        // 4. 最新部署版本的发起节点 reInitiate 门禁
        String processKey = hpi.getProcessDefinitionKey();
        if (processKey != null && !processKey.isBlank()) {
            ProcessDefinition latest = repositoryService.createProcessDefinitionQuery()
                    .processDefinitionKey(processKey)
                    .latestVersion()
                    .singleResult();
            if (latest != null) {
                String initiatorNodeId;
                try {
                    initiatorNodeId = initiatorNodeResolver.resolve(latest.getId());
                } catch (Exception e) {
                    initiatorNodeId = null;
                }
                if (initiatorNodeId != null) {
                    NodeOptions initiatorOpts = nodeOptionsService
                            .find(latest.getId(), initiatorNodeId).orElse(null);
                    if (initiatorOpts != null && Boolean.FALSE.equals(initiatorOpts.getReInitiate())) {
                        throw new BusinessException(400, "该流程不支持再次发起");
                    }
                }
            }
        }

        // 5. 复制原实例全部流程变量（结束实例的变量走历史表）
        Map<String, Object> startVariables = new HashMap<>();
        List<HistoricVariableInstance> historicVars = historyService.createHistoricVariableInstanceQuery()
                .processInstanceId(instanceId)
                .list();
        for (HistoricVariableInstance var : historicVars) {
            if (var.getValue() != null) {
                startVariables.put(var.getVariableName(), var.getValue());
            }
        }
        if (initiator != null && !initiator.isBlank()) {
            startVariables.put("initiator", initiator);
        }

        // 6. 按 key + 原 businessKey 开新实例
        ProcessInstance newInstance = processInstanceService.startProcess(
                processKey, hpi.getBusinessKey(), startVariables);

        // 7. 变量映射写入（与 start 端点行为一致）
        try {
            variableMappingWriter.write(newInstance.getProcessDefinitionId(), newInstance.getId());
        } catch (Exception e) {
            log.warn("Failed to write variable mappings after re-initiate [{}]: {}",
                    newInstance.getId(), e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("processInstanceId", newInstance.getId());
        result.put("processDefinitionId", newInstance.getProcessDefinitionId());
        result.put("sourceInstanceId", instanceId);
        return result;
    }
}