package com.workflow.engine.task;

import com.workflow.api.dto.CompleteTaskResponse;
import com.workflow.api.dto.FormConfigResult;
import com.workflow.api.dto.OperationsConfig;
import com.workflow.api.dto.TaskDetailVO;
import com.workflow.api.dto.TaskDoneFilter;
import com.workflow.api.dto.TaskDoneVO;
import com.workflow.api.dto.TaskTodoFilter;
import com.workflow.api.dto.TaskTodoVO;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
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
    private final ObjectMapper objectMapper;

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
                               ObjectMapper objectMapper) {
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
        }

        // variables
        try {
            Map<String, Object> variables = flowableTaskService.getVariables(task.getId());
            vo.setVariables(variables);
        } catch (Exception e) {
            vo.setVariables(Map.of());
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
     * 完成任务并返回下一个任务信息，同时写入审批意见。
     *
     * @param taskId    任务 ID
     * @param variables 流程变量
     * @param userId    操作人 ID（用于审批意见记录）
     * @param comment   审批意见（可为 null）
     * @return 包含下一个任务信息和流程结束标志的响应
     */
    @Transactional
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables,
                                                          String userId, String comment) {
        // 1. 查当前任务获取 processInstanceId
        Task currentTask = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (currentTask == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processInstanceId = currentTask.getProcessInstanceId();

        // 2. 委派状态的任务需要先 resolve
        org.flowable.task.api.DelegationState state = currentTask.getDelegationState();
        if (state != null) {
            flowableTaskService.resolveTask(taskId);
        }

        // 3. 完成任务
        flowableTaskService.complete(taskId, variables);

        // 4. 写入审批意见
        if (userId != null) {
            saveTaskComment(taskId, processInstanceId, userId, "approve", comment);
        }

        // 4. 查流程是否仍在运行
        ProcessInstance runningInstance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        boolean processFinished = (runningInstance == null);

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
        WfTaskComment record = new WfTaskComment();
        record.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
        record.setTenantId(tenantProvider.getTenantId());
        record.setTaskId(taskId);
        record.setProcessInstanceId(processInstanceId);
        record.setUserId(userId);
        record.setAction(action);
        record.setComment(comment);
        record.setTargetUserId(targetUserId);
        commentRepository.save(record);
    }
}