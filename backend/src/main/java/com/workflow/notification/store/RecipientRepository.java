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
     * 批量标记已读
     */
    @Modifying
    @Query("UPDATE Recipient r SET r.status = com.workflow.notification.model.MessageStatus.SENT, r.sentAt = :now " +
           "WHERE r.userId = :userId AND r.status = com.workflow.notification.model.MessageStatus.PENDING")
    int markAllAsRead(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 标记单条已读
     */
    @Modifying
    @Query("UPDATE Recipient r SET r.status = com.workflow.notification.model.MessageStatus.SENT, r.sentAt = :now " +
           "WHERE r.id = :id AND r.userId = :userId")
    int markAsRead(@Param("id") Long id, @Param("userId") Long userId, @Param("now") LocalDateTime now);

    /**
     * 删除用户的消息接收记录
     */
    void deleteByUserIdAndMessageId(Long userId, Long messageId);
}
