package com.workflow.notification.store;

import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.Recipient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 收件人 JPA Repository
 */
public interface RecipientRepository extends JpaRepository<Recipient, Long> {

    List<Recipient> findByMessageId(Long messageId);

    List<Recipient> findByUserId(Long userId);

    List<Recipient> findByUserIdAndStatus(Long userId, MessageStatus status);

    /**
     * 根据消息ID和用户ID查询收件人记录
     */
    java.util.Optional<Recipient> findByMessageIdAndUserId(Long messageId, Long userId);

    /**
     * 批量标记已读
     */
    @Modifying
    @Query("UPDATE Recipient r SET r.status = com.workflow.notification.model.MessageStatus.SENT, r.sentAt = :now " +
           "WHERE r.userId = :userId AND r.status = com.workflow.notification.model.MessageStatus.PENDING")
    int markAllAsRead(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 标记单条已读（按消息ID + 用户ID）
     */
    @Modifying
    @Query("UPDATE Recipient r SET r.status = com.workflow.notification.model.MessageStatus.SENT, r.sentAt = :now " +
           "WHERE r.messageId = :messageId AND r.userId = :userId")
    int markAsRead(@Param("messageId") Long messageId, @Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 批量标记已读（按消息ID + 用户ID）
     */
    @Modifying
    @Query("UPDATE Recipient r SET r.status = com.workflow.notification.model.MessageStatus.SENT, r.sentAt = :now " +
           "WHERE r.userId = :userId AND r.messageId IN :messageIds")
    int markBatchAsRead(@Param("userId") Long userId, @Param("messageIds") List<Long> messageIds,
                        @Param("now") LocalDateTime now);

    /**
     * 删除用户的消息接收记录
     */
    void deleteByUserIdAndMessageId(Long userId, Long messageId);
}
