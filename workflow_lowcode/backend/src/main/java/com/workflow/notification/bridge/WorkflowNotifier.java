package com.workflow.notification.bridge;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.notification.dispatch.MessageSender;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.store.MessageService;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工作流 → 通知中心桥接服务。
 *
 * <p>把引擎侧发生的关键事件（任务待办 / 流程办结 / 催办）推送到通知中心，
 * 最终经 MessageDispatcher 写站内信并对在线用户 SSE 实时推送（铃铛角标 + 消息中心）。
 *
 * <p>设计要点：
 * <ul>
 *   <li><b>只兜底不阻断</b>：所有对外方法吞掉全部异常（仅记日志），通知失败绝不影响流程流转/催办事务；</li>
 *   <li><b>模板优先，自由内容兜底</b>：优先按种子模板（见 V32）发送，运营可在模板管理页改文案；
 *       模板缺失/停用时降级为自由内容站内信（MessageService.send），链路永不因数据缺失而失效；</li>
 *   <li><b>租户自恢复</b>：HTTP 请求线程内租户上下文已由拦截器设置；异步 Job 线程无上下文时，
 *       按流程实例的 tenantId 临时补设并在 finally 清理；</li>
 *   <li><b>引擎数据延迟解析</b>：HistoryService 通过 {@link ObjectProvider} 延迟获取，
 *       打破 Flowable 引擎装配期循环依赖（与 BackendLogicExecutor 同款方案）；
 *       办结通知的发起人/流程名/单号统一从 Flowable 历史库解析（实例运行时行在
 *       PROCESS_COMPLETED 派发时点可能已被删除，历史库是最可靠的读取面）。</li>
 * </ul>
 */
@Service
public class WorkflowNotifier {

    private static final Logger log = LoggerFactory.getLogger(WorkflowNotifier.class);

    /** 模板代码：任务待办通知（V32 种子化，模板管理页可改文案）。 */
    public static final String TPL_TASK_ASSIGNED = "TPL_WF_TASK_ASSIGNED";
    /** 模板代码：流程办结通知。 */
    public static final String TPL_PROCESS_FINISHED = "TPL_WF_PROCESS_FINISHED";
    /** 模板代码：催办通知。 */
    public static final String TPL_TASK_REMINDED = "TPL_WF_TASK_REMINDED";

    /** 系统发送者 ID（msg_message.sender_id NOT NULL，系统消息固定为 0）。 */
    private static final long SYSTEM_SENDER_ID = 0L;

    private final MessageSender messageSender;
    private final MessageService messageService;
    private final UserService userService;
    private final TenantProvider tenantProvider;
    private final ObjectProvider<HistoryService> historyServiceProvider;

    public WorkflowNotifier(MessageSender messageSender,
                            MessageService messageService,
                            UserService userService,
                            TenantProvider tenantProvider,
                            ObjectProvider<HistoryService> historyServiceProvider) {
        this.messageSender = messageSender;
        this.messageService = messageService;
        this.userService = userService;
        this.tenantProvider = tenantProvider;
        this.historyServiceProvider = historyServiceProvider;
    }

    /**
     * 任务待办通知：用户任务分配给办理人时推送（Flowable TASK_ASSIGNED）。
     *
     * @param tenantId    流程实例租户（异步线程上下文缺失时用于临时补设，可为 null）
     * @param assigneeId  办理人用户 ID（为空/非数字则跳过——候选人组等场景不推送站内信）
     * @param taskName    任务节点名
     * @param instanceId  流程实例 ID（用于解析流程名/发起人）
     * @param initiatorId 发起人用户 ID（可为空）
     */
    public void notifyTaskAssigned(String tenantId, String assigneeId, String taskName,
                                   String instanceId, String initiatorId) {
        runGuarded("TASK_ASSIGNED", tenantId, () -> {
            Long recipient = parseLong(assigneeId);
            if (recipient == null) {
                log.debug("[工作流通知] TASK_ASSIGNED 接收人非数字 ID：{}，跳过", assigneeId);
                return;
            }
            HistoricProcessInstance hpi = requireHistory(instanceId);
            Map<String, Object> vars = baseVars(taskName, processNameOf(hpi));
            // 发起人：startUserId → 流程变量 initiator（平台发起时未调
            // Authentication.setAuthenticatedUserId，startUserId 常为 null）
            String initiator = (initiatorId != null && !initiatorId.isBlank())
                    ? initiatorId : resolveInitiatorId(instanceId, hpi);
            vars.put("initiatorName", resolveUserName(initiator));
            sendWithFallback(tenantId, TPL_TASK_ASSIGNED, vars, recipient);
            log.info("[工作流通知] TASK_ASSIGNED 已推送：to={}, task={}, tpl={}",
                    recipient, taskName, TPL_TASK_ASSIGNED);
        });
    }

    /**
     * 流程办结通知：流程实例全部审批完成时通知发起人（Flowable PROCESS_COMPLETED）。
     * 发起人、流程名、单号均由历史库解析，实例行删除不影响通知。
     *
     * @param tenantId   流程实例租户（可为 null）
     * @param instanceId 流程实例 ID
     */
    public void notifyProcessFinished(String tenantId, String instanceId) {
        runGuarded("PROCESS_FINISHED", tenantId, () -> {
            HistoricProcessInstance hpi = requireHistory(instanceId);
            String initiatorId = resolveInitiatorId(instanceId, hpi);
            Long recipient = parseLong(initiatorId);
            if (recipient == null) {
                log.debug("[工作流通知] PROCESS_FINISHED 无法解析发起人：{}，跳过", initiatorId);
                return;
            }
            Map<String, Object> vars = baseVars(null, processNameOf(hpi));
            vars.put("businessKey", hpi.getBusinessKey() != null ? hpi.getBusinessKey() : "-");
            sendWithFallback(tenantId, TPL_PROCESS_FINISHED, vars, recipient);
            log.info("[工作流通知] PROCESS_FINISHED 已推送：to={}, process={}",
                    recipient, vars.get("processName"));
        });
    }

    /**
     * 催办通知：发起人对待办任务催办后通知办理人。
     *
     * @param tenantId     租户（HTTP 线程内已有上下文，可为 null）
     * @param remindToId   办理人用户 ID
     * @param remindFromId 催办发起人用户 ID
     * @param taskName     任务节点名
     * @param instanceId   流程实例 ID
     */
    public void notifyTaskReminded(String tenantId, String remindToId, String remindFromId,
                                   String taskName, String instanceId) {
        runGuarded("TASK_REMINDED", tenantId, () -> {
            Long recipient = parseLong(remindToId);
            if (recipient == null) {
                log.debug("[工作流通知] TASK_REMINDED 接收人非数字 ID：{}，跳过", remindToId);
                return;
            }
            HistoricProcessInstance hpi = requireHistory(instanceId);
            Map<String, Object> vars = baseVars(taskName, processNameOf(hpi));
            vars.put("senderName", resolveUserName(remindFromId));
            sendWithFallback(tenantId, TPL_TASK_REMINDED, vars, recipient);
            log.info("[工作流通知] TASK_REMINDED 已推送：to={}, task={}", recipient, taskName);
        });
    }

    // ---------- 内部实现 ----------

    private interface NotificationAction {
        void run() throws Exception;
    }

    /** 统一防护：租户上下文补设 + 全量吞异常（通知失败绝不影响流程流转）。 */
    private void runGuarded(String scene, String tenantId, NotificationAction action) {
        boolean restoreTenant = !tenantProvider.hasTenantId()
                && tenantId != null && !tenantId.isBlank();
        if (restoreTenant) {
            TenantContext.setTenantId(tenantId);
        }
        try {
            action.run();
        } catch (Exception e) {
            log.error("[工作流通知] {} 推送失败（已忽略，不影响流程流转）：{}", scene, e.getMessage(), e);
        } finally {
            if (restoreTenant) {
                TenantContext.clear();
            }
        }
    }

    /**
     * 模板优先发送；模板缺失/停用（BusinessException）时降级为自由内容站内信。
     */
    private void sendWithFallback(String tenantId, String templateCode,
                                  Map<String, Object> vars, Long recipient) {
        String tenant = tenantProvider.hasTenantId() ? tenantProvider.getTenantId() : tenantId;
        try {
            messageSender.sendByTemplate(SYSTEM_SENDER_ID, templateCode, vars,
                    MessageType.PRIVATE, List.of(recipient), List.of(ChannelType.IN_APP));
            return;
        } catch (BusinessException e) {
            log.warn("[工作流通知] 模板不可用（{}），降级为自由内容站内信：{}", templateCode, e.getMessage());
        }

        Message message = new Message();
        message.setTenantId(tenant != null && !tenant.isBlank() ? tenant : "default");
        message.setTemplateCode(templateCode);
        message.setSenderId(SYSTEM_SENDER_ID);
        message.setSenderType("SYSTEM");
        message.setTitle(String.valueOf(vars.get("title")));
        Map<String, Object> content = new HashMap<>();
        content.put("text", String.valueOf(vars.get("content")));
        content.put("variables", vars);
        message.setContent(content);
        message.setContentType(TemplateContentType.TEXT);
        message.setPriority(MessagePriority.NORMAL);
        message.setCategory(MessageCategory.WORKFLOW);
        message.setMessageType(MessageType.PRIVATE);
        messageService.send(message, List.of(recipient));
    }

    /** 查历史流程实例（实例名/发起人/单号的权威读取面）。 */
    private HistoricProcessInstance requireHistory(String instanceId) {
        if (instanceId == null || instanceId.isBlank()) {
            throw new BusinessException("流程实例 ID 为空");
        }
        HistoricProcessInstance hpi = historyServiceProvider.getObject()
                .createHistoricProcessInstanceQuery()
                .processInstanceId(instanceId)
                .singleResult();
        if (hpi == null) {
            throw new BusinessException("历史流程实例不存在: " + instanceId);
        }
        return hpi;
    }

    /** 流程展示名：优先定义名（如"请假审批"），实例名未设置时回退。 */
    private static String processNameOf(HistoricProcessInstance hpi) {
        if (hpi.getProcessDefinitionName() != null && !hpi.getProcessDefinitionName().isBlank()) {
            return hpi.getProcessDefinitionName();
        }
        return hpi.getName();
    }

    /**
     * 解析发起人 ID：优先 startUserId；为 null（未调 Flowable Authentication API）时
     * 回退流程变量 {@code initiator}（ProcessInstanceController 发起时写入，历史库可查）。
     */
    private String resolveInitiatorId(String instanceId, HistoricProcessInstance hpi) {
        if (hpi.getStartUserId() != null && !hpi.getStartUserId().isBlank()) {
            return hpi.getStartUserId();
        }
        try {
            HistoricVariableInstance hv = historyServiceProvider.getObject()
                    .createHistoricVariableInstanceQuery()
                    .processInstanceId(instanceId)
                    .variableName("initiator")
                    .singleResult();
            if (hv != null && hv.getValue() != null) {
                return String.valueOf(hv.getValue());
            }
        } catch (Exception e) {
            log.debug("[工作流通知] 读取 initiator 历史变量失败：instanceId={}", instanceId);
        }
        return null;
    }

    private String resolveUserName(String userId) {
        Long id = parseLong(userId);
        if (id == null) {
            return userId == null || userId.isBlank() ? "-" : userId;
        }
        try {
            UserVO user = userService.getById(id);
            if (user != null) {
                return user.nickname() != null && !user.nickname().isBlank()
                        ? user.nickname() : user.username();
            }
        } catch (Exception e) {
            log.debug("[工作流通知] 解析用户昵称失败：id={}", id);
        }
        return userId;
    }

    private static Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 统一组装模板变量（缺省占位，保证模板必填变量校验始终通过）。 */
    private static Map<String, Object> baseVars(String taskName, String processName) {
        Map<String, Object> vars = new HashMap<>();
        vars.put("taskName", taskName != null && !taskName.isBlank() ? taskName : "-");
        vars.put("processName", processName != null && !processName.isBlank() ? processName : "-");
        vars.put("initiatorName", "-");
        vars.put("senderName", "-");
        vars.put("businessKey", "-");
        vars.put("title", "您的流程「" + vars.get("processName") + "」状态更新");
        vars.put("content", "流程「" + vars.get("processName") + "」任务「" + vars.get("taskName") + "」有新的动态。");
        return vars;
    }
}
