package com.workflow.engine.datasource;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.ProcessDefinitionSummary;
import com.workflow.api.dto.TaskTodoVO;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.process.ProcessService;
import com.workflow.engine.task.WorkflowTaskService;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.DictTypeQueryRequest;
import com.workflow.system.domain.dto.RoleQueryRequest;
import com.workflow.system.domain.vo.DictTypeVO;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.domain.vo.RoleVO;
import com.workflow.system.service.DictTypeService;
import com.workflow.system.service.MenuService;
import com.workflow.system.service.RoleService;
import org.flowable.engine.runtime.ProcessInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 内建系统数据源取数服务 —— 6 个新增 sourceKey 的统一取数实现（对齐 NodeJS
 * {@code backend-node/src/engine/datasource/service/system-source-query.service.ts}）。
 *
 * <p>两个消费方共享同一份逻辑，避免漂移：
 * <ul>
 *   <li>{@link UnifiedDataSourceAdapter#query}：数据源 SPI 主路径（{@code /:id/data}）；</li>
 *   <li>{@code com.workflow.api.controller.SystemInternalController}：REST 化端点
 *       （{@code /api/v1/internal/system/...}，{@code params.list.action} 指向它们）。</li>
 * </ul>
 *
 * <p>历史既有 sourceKey（{@code dept-tree} / {@code user-tree}）的取数<b>保留在 adapter
 * 原位</b>（golden 契约钉住分页外壳与空值语义，不做无谓搬家）。
 *
 * <p>【空值约定】与 dept-tree/user-tree 一致：字段值一律空串而不是 null
 * （null 列在 FORM 数据路径不进 data，系统数据源历史上全是空串，保持同构）。
 */
@Service
public class BuiltInSystemSourceQueryService {

    /** 本服务负责取数的 6 个新增 sourceKey（历史 2 个 dept-tree/user-tree 归 adapter）。 */
    private static final Set<String> HANDLED_KEYS = Set.of(
            "sys-menus", "sys-roles", "sys-dicts",
            "process-definitions", "process-instances", "todo-tasks");

    private final MenuService menuService;
    private final RoleService roleService;
    private final DictTypeService dictTypeService;
    private final ProcessService processService;
    private final ProcessInstanceService processInstanceService;
    private final WorkflowTaskService taskService;

    public BuiltInSystemSourceQueryService(MenuService menuService,
                                           RoleService roleService,
                                           DictTypeService dictTypeService,
                                           ProcessService processService,
                                           ProcessInstanceService processInstanceService,
                                           WorkflowTaskService taskService) {
        this.menuService = menuService;
        this.roleService = roleService;
        this.dictTypeService = dictTypeService;
        this.processService = processService;
        this.processInstanceService = processInstanceService;
        this.taskService = taskService;
    }

    /** 是否由本服务负责取数（新 6 个 sourceKey；历史 2 个归 adapter）。 */
    public static boolean handles(String sourceKey) {
        return sourceKey != null && HANDLED_KEYS.contains(sourceKey);
    }

    /** 内建数据源元数据列（按目录顺序），只读；未知 sourceKey → 400。 */
    public List<ColumnConfig> columnsOf(String sourceKey) {
        BuiltInSystemSources.BuiltInSystemSource source = BuiltInSystemSources.byKey(sourceKey);
        if (source == null) {
            throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
        }
        return source.columns();
    }

    /** 统一取数入口（本服务负责的 6 个 sourceKey）。 */
    public BizDataPageVO query(String sourceKey, BizDataQueryRequest req) {
        if (req == null) {
            req = new BizDataQueryRequest();
        }
        return switch (sourceKey == null ? "" : sourceKey) {
            case "sys-menus" -> queryMenus();
            case "sys-roles" -> queryRoles(req);
            case "sys-dicts" -> queryDicts(req);
            case "process-definitions" -> queryProcessDefinitions();
            case "process-instances" -> queryProcessInstances(req);
            case "todo-tasks" -> queryTodoTasks(req);
            default -> throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
        };
    }

    // ==================== 系统菜单（全量扁平化，语义同 dept-tree） ====================

    private BizDataPageVO queryMenus() {
        List<BizDataVO> records = new ArrayList<>();
        for (MenuTree node : menuService.tree()) {
            collectMenu(node, records);
        }
        return new BizDataPageVO(records, records.size(), 0, records.size());
    }

    private void collectMenu(MenuTree node, List<BizDataVO> out) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", String.valueOf(node.id()));
        data.put("parentId", node.parentId() == null ? "" : String.valueOf(node.parentId()));
        data.put("menuName", node.menuName() == null ? "" : node.menuName());
        data.put("menuType", node.menuType());
        data.put("path", node.path() == null ? "" : node.path());
        data.put("permission", node.permission() == null ? "" : node.permission());
        data.put("sortOrder", node.sortOrder() == null ? "" : String.valueOf(node.sortOrder()));
        out.add(new BizDataVO(String.valueOf(node.id()), data, null, null, null));
        if (node.children() != null) {
            for (MenuTree child : node.children()) {
                collectMenu(child, out);
            }
        }
    }

    // ==================== 系统角色 / 系统字典（标准分页） ====================

    private BizDataPageVO queryRoles(BizDataQueryRequest req) {
        int page = Math.max(req.getPage(), 1);
        PageResult<RoleVO> result = roleService.list(
                new RoleQueryRequest(null, null, null, page, req.getSize()));
        List<BizDataVO> records = new ArrayList<>();
        for (RoleVO row : rowsOf(result)) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", String.valueOf(row.id()));
            data.put("roleName", row.roleName() == null ? "" : row.roleName());
            data.put("roleCode", row.roleCode() == null ? "" : row.roleCode());
            data.put("description", row.description() == null ? "" : row.description());
            data.put("status", row.status());
            records.add(new BizDataVO(String.valueOf(row.id()), data, null, null, null));
        }
        return new BizDataPageVO(records, result.getTotal(), result.getPage(), result.getSize());
    }

    private BizDataPageVO queryDicts(BizDataQueryRequest req) {
        int page = Math.max(req.getPage(), 1);
        PageResult<DictTypeVO> result = dictTypeService.list(
                new DictTypeQueryRequest(null, null, null, page, req.getSize()));
        List<BizDataVO> records = new ArrayList<>();
        for (DictTypeVO row : rowsOf(result)) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", String.valueOf(row.id()));
            data.put("dictCode", row.dictCode() == null ? "" : row.dictCode());
            data.put("dictName", row.dictName() == null ? "" : row.dictName());
            data.put("remark", row.remark() == null ? "" : row.remark());
            data.put("status", row.status());
            records.add(new BizDataVO(String.valueOf(row.id()), data, null, null, null));
        }
        return new BizDataPageVO(records, result.getTotal(), result.getPage(), result.getSize());
    }

    // ==================== 流程定义（全量，语义同 dept-tree） ====================

    private BizDataPageVO queryProcessDefinitions() {
        List<ProcessDefinitionSummary> summaries = processService.listSummaries();
        List<BizDataVO> records = new ArrayList<>();
        for (ProcessDefinitionSummary row : summaries) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", row.getId());
            data.put("key", row.getKey() == null ? "" : row.getKey());
            data.put("name", row.getName() == null ? "" : row.getName());
            data.put("version", row.getVersion());
            records.add(new BizDataVO(row.getId(), data, null, null, null));
        }
        return new BizDataPageVO(records, records.size(), 0, records.size());
    }

    // ==================== 流程实例（标准分页，运行中） ====================

    private BizDataPageVO queryProcessInstances(BizDataQueryRequest req) {
        int page = Math.max(req.getPage(), 1);
        Page<ProcessInstance> result = processInstanceService.listProcessInstances(
                PageRequest.of(page - 1, req.getSize()));
        List<BizDataVO> records = new ArrayList<>();
        for (ProcessInstance row : result.getContent()) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", row.getId());
            data.put("name", row.getName() == null ? "" : row.getName());
            data.put("processDefinitionName", row.getProcessDefinitionName() == null
                    ? "" : row.getProcessDefinitionName());
            data.put("businessKey", row.getBusinessKey() == null ? "" : row.getBusinessKey());
            data.put("currentNode", currentNodeOf(row));
            data.put("status", statusOf(row));
            data.put("startTime", startTimeOf(row));
            records.add(new BizDataVO(row.getId(), data, null, null, null));
        }
        // Spring Page 页码 0 基 → 外壳页码 1 基（对齐 NodeJS PageResponse.pageNumber）
        return new BizDataPageVO(records, result.getTotalElements(), result.getNumber() + 1, result.getSize());
    }

    // ==================== 待办任务（标准分页，按当前登录人过滤） ====================

    /**
     * 待办任务：assignee 必须来自<b>当前登录人</b>（SecurityContext）。
     * 未认证上下文（系统内部调用）没有登录人 → 400 明确报错，
     * 而不是静默返回全租户待办（那是越权）。
     */
    private BizDataPageVO queryTodoTasks(BizDataQueryRequest req) {
        String assignee = currentUserId();
        if (assignee == null) {
            throw new BusinessException(400, "待办任务数据源需要登录用户上下文");
        }
        int page = Math.max(req.getPage(), 1);
        Page<TaskTodoVO> result = taskService.listTodoTasksVO(
                assignee, PageRequest.of(page - 1, req.getSize()), null);
        List<BizDataVO> records = new ArrayList<>();
        for (TaskTodoVO row : result.getContent()) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("taskId", row.getTaskId());
            data.put("currentNodeName", row.getCurrentNodeName() == null ? "" : row.getCurrentNodeName());
            data.put("processName", row.getProcessName() == null ? "" : row.getProcessName());
            data.put("assignee", row.getAssignee() == null ? "" : row.getAssignee());
            data.put("initiatorName", row.getInitiatorName() == null ? "" : row.getInitiatorName());
            data.put("createTime", row.getCreateTime() == null ? "" : row.getCreateTime());
            records.add(new BizDataVO(row.getTaskId(), data, null, null, null));
        }
        return new BizDataPageVO(records, result.getTotalElements(), result.getNumber() + 1, result.getSize());
    }

    // ==================== helpers ====================

    /** 从 SecurityContext 获取当前登录用户 ID；未认证 → null（对齐 TaskController.getCurrentUserId）。 */
    private String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return String.valueOf(loginUser.getUserId());
        }
        return null;
    }

    private static <T> List<T> rowsOf(PageResult<T> result) {
        return result.getRows() == null ? List.of() : result.getRows();
    }

    /** 当前节点：运行中取活动节点 id，已结束为空串（对齐 ProcessInstanceController.toMap）。 */
    private static String currentNodeOf(ProcessInstance row) {
        String currentNode = row.isEnded() ? null : row.getActivityId();
        return currentNode == null ? "" : currentNode;
    }

    /** 状态：suspended / completed / running（对齐 ProcessInstanceController.toMap 与 NodeJS statusText）。 */
    private static String statusOf(ProcessInstance row) {
        if (row.isSuspended()) {
            return "suspended";
        }
        return row.isEnded() ? "completed" : "running";
    }

    /** 发起时间：LocalDateTime ISO 字符串；空 → 空串（对齐 ProcessInstanceController.toMap）。 */
    private static String startTimeOf(ProcessInstance row) {
        Date startTime = row.getStartTime();
        return startTime == null ? ""
                : startTime.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime().toString();
    }
}
