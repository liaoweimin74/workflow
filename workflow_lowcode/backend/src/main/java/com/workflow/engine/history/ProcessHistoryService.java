package com.workflow.engine.history;

import com.workflow.api.dto.ApprovalRecordVO;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 审批历史服务。
 *
 * <p>将 Flowable {@link HistoricActivityInstance}（userTask 类型历史活动节点）与
 * {@code wf_task_comment} 审批意见表聚合为 {@link ApprovalRecordVO} 时间线列表。
 *
 * <p>组装流程：
 * <ol>
 *   <li>查询流程实例下所有 userTask 类型的历史活动，按 startTime 正序排列</li>
 *   <li>查询 {@code wf_task_comment} 表中该流程实例的所有审批意见</li>
 *   <li>按 taskId 关联活动与意见，填充 action + comment</li>
 *   <li>批量查询 UserService 获取办理人姓名</li>
 *   <li>组装 {@link ApprovalRecordVO} 列表返回</li>
 * </ol>
 */
@Service
public class ProcessHistoryService {

    private static final Logger log = LoggerFactory.getLogger(ProcessHistoryService.class);
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final HistoryService historyService;
    private final WfTaskCommentRepository commentRepository;
    private final TenantProvider tenantProvider;
    private final UserService userService;

    public ProcessHistoryService(HistoryService historyService,
                                  WfTaskCommentRepository commentRepository,
                                  TenantProvider tenantProvider,
                                  UserService userService) {
        this.historyService = historyService;
        this.commentRepository = commentRepository;
        this.tenantProvider = tenantProvider;
        this.userService = userService;
    }

    /**
     * 获取流程实例的审批历史记录。
     *
     * @param processInstanceId 流程实例 ID
     * @return 按 startTime 正序排列的审批记录列表
     */
    public List<ApprovalRecordVO> getApprovalHistory(String processInstanceId) {
        // 1. 查询 userTask 类型的历史活动节点
        List<HistoricActivityInstance> activities = historyService
                .createHistoricActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .activityType("userTask")
                .orderByHistoricActivityInstanceStartTime()
                .asc()
                .list();

        if (activities.isEmpty()) {
            return List.of();
        }

        // 2. 查询 wf_task_comment 审批意见
        List<WfTaskComment> comments = commentRepository
                .findByProcessInstanceIdOrderByCreatedAtAsc(processInstanceId);

        // 3. 按 taskId 分组审批意见（取最后一条，即最新操作）
        Map<String, WfTaskComment> commentByTaskId = comments.stream()
                .collect(Collectors.toMap(
                        WfTaskComment::getTaskId,
                        c -> c,
                        (existing, replacement) -> replacement, // 保留最后一条
                        LinkedHashMap::new));

        // 4. 批量查询办理人姓名
        Set<String> assigneeIds = activities.stream()
                .map(HistoricActivityInstance::getAssignee)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<String, String> assigneeNameMap = batchQueryUserNames(assigneeIds);

        // 5. 组装 VO
        return activities.stream().map(activity -> {
            ApprovalRecordVO vo = new ApprovalRecordVO();
            vo.setActivityId(activity.getActivityId());
            vo.setActivityName(activity.getActivityName());
            vo.setAssignee(activity.getAssignee());
            vo.setAssigneeName(assigneeNameMap.get(activity.getAssignee()));

            if (activity.getStartTime() != null) {
                vo.setStartTime(formatDate(activity.getStartTime()));
            }
            if (activity.getEndTime() != null) {
                vo.setEndTime(formatDate(activity.getEndTime()));
            }

            // 关联审批意见
            WfTaskComment comment = commentByTaskId.get(activity.getTaskId());
            if (comment != null) {
                vo.setAction(comment.getAction());
                vo.setComment(comment.getComment());
            }

            return vo;
        }).toList();
    }

    // ==================== 辅助方法 ====================

    private Map<String, String> batchQueryUserNames(Set<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }

        // assignee 存的是 userId（数字字符串），用 findByIds 查询
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
}
