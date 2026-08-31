package com.workflow.notification.store;

import com.workflow.common.domain.PageResult;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;

import java.util.List;

/**
 * 消息服务接口
 */
public interface MessageService {

    /**
     * 发送消息（创建消息和收件人记录）
     *
     * @param message     消息实体
     * @param recipientIds 接收用户ID列表
     * @return 创建的消息
     */
    Message send(Message message, List<Long> recipientIds);

    /**
     * 查询消息列表（分页）
     *
     * @param userId 用户ID
     * @param page   页码
     * @param size   每页大小
     * @return 分页结果
     */
    PageResult<Message> listByUserId(Long userId, int page, int size);

    /**
     * 获取消息详情
     *
     * @param id     消息ID
     * @param userId 用户ID（校验权限）
     * @return 消息详情
     */
    Message getById(Long id, Long userId);

    /**
     * 标记消息已读
     *
     * @param id     消息ID
     * @param userId 用户ID
     */
    void markAsRead(Long id, Long userId);

    /**
     * 标记所有消息已读
     *
     * @param userId 用户ID
     */
    void markAllAsRead(Long userId);

    /**
     * 删除消息
     *
     * @param id     消息ID
     * @param userId 用户ID
     */
    void delete(Long id, Long userId);

    /**
     * 获取未读消息数
     *
     * @param userId 用户ID
     * @return 未读数
     */
    long getUnreadCount(Long userId);
}
