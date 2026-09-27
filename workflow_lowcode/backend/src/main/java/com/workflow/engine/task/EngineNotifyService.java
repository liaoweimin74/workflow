package com.workflow.engine.task;

import com.workflow.engine.task.entity.WfEngineNotify;
import com.workflow.engine.task.repository.WfEngineNotifyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 引擎外发通知写入服务（对齐 NodeJS 端 writeNodeSmsNotifications / writeInstanceEndSms /
 * TimeoutScanner 的 TIMEOUT_REMIND 幂等标记）。
 *
 * <p>本期只落库不外发（PENDING/SENT 占位），后续接入消息网关统一消费。
 */
@Service
public class EngineNotifyService {

    public static final String TYPE_SMS_NODE = "SMS_NODE";
    public static final String TYPE_SMS_END = "SMS_END";
    public static final String TYPE_TIMEOUT_REMIND = "TIMEOUT_REMIND";

    private static final Logger log = LoggerFactory.getLogger(EngineNotifyService.class);

    private final WfEngineNotifyRepository repository;

    public EngineNotifyService(WfEngineNotifyRepository repository) {
        this.repository = repository;
    }

    /**
     * 节点 notify.sms=true 的新建待办 → 短信通知记录。
     */
    public void writeSmsNode(String tenantId, String instanceId, String taskId,
                             String targetUser, String nodeLabel) {
        write(tenantId, instanceId, taskId, TYPE_SMS_NODE,
                targetUser == null ? "" : targetUser,
                "您有新的办理任务：" + (nodeLabel == null || nodeLabel.isBlank() ? taskId : nodeLabel),
                "PENDING");
    }

    /**
     * 实例结束 + 发起节点 smsOnEnd=true → 给发起人的短信通知记录。
     */
    public void writeSmsEnd(String tenantId, String instanceId, String initiator) {
        write(tenantId, instanceId, null, TYPE_SMS_END, initiator, "您发起的流程已结束", "PENDING");
    }

    /**
     * 超时调度记录（兼作幂等标记，status=SENT）。
     */
    public void writeTimeoutMark(String tenantId, String instanceId, String taskId, String action) {
        write(tenantId, instanceId, taskId, TYPE_TIMEOUT_REMIND, "", "任务超时（" + action + "）", "SENT");
    }

    /**
     * 该任务是否已有超时处理记录（幂等）。
     */
    public boolean hasTimeoutRecord(String taskId) {
        try {
            return repository.existsByTaskIdAndNotifyType(taskId, TYPE_TIMEOUT_REMIND);
        } catch (Exception e) {
            log.warn("查询超时通知记录失败 taskId={}: {}", taskId, e.getMessage());
            return false;
        }
    }

    private void write(String tenantId, String instanceId, String taskId, String notifyType,
                       String targetUser, String content, String status) {
        try {
            WfEngineNotify record = new WfEngineNotify();
            record.setId(UUID.randomUUID().toString().replace("-", ""));
            record.setTenantId(tenantId == null || tenantId.isBlank() ? "default" : tenantId);
            record.setInstanceId(instanceId);
            record.setTaskId(taskId);
            record.setNotifyType(notifyType);
            record.setTargetUser(targetUser == null ? "" : targetUser);
            record.setContent(content == null ? "" : content);
            record.setStatus(status);
            record.setCreatedAt(LocalDateTime.now());
            repository.save(record);
        } catch (Exception e) {
            // 通知落库失败不影响主流程
            log.warn("写入引擎通知记录失败 type={} instanceId={}: {}", notifyType, instanceId, e.getMessage());
        }
    }
}
