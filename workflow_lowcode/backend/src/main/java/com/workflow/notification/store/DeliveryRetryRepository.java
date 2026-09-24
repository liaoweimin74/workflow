package com.workflow.notification.store;

import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.MessageStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 重试记录 Repository
 */
public interface DeliveryRetryRepository extends JpaRepository<DeliveryRetry, Long> {

    /**
     * 查找需要重试的记录
     */
    List<DeliveryRetry> findByStatusAndNextRetryAtLessThanEqual(MessageStatus status, LocalDateTime now);

    /**
     * 按消息ID查找重试记录（发送记录状态真实化用）
     */
    List<DeliveryRetry> findByMessageId(Long messageId);

    /**
     * 按渠道查找重试记录（渠道成功率统计用）
     */
    List<DeliveryRetry> findByChannel(com.workflow.notification.model.ChannelType channel);

    /**
     * 根据收件人ID和渠道查找
     */
    DeliveryRetry findByRecipientIdAndChannel(Long recipientId, com.workflow.notification.model.ChannelType channel);
}
