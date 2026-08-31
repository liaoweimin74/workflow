package com.workflow.notification.store.impl;

import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 消息服务实现
 */
@Service
public class MessageServiceImpl implements MessageService {

    private final MessageRepository messageRepository;
    private final RecipientRepository recipientRepository;

    public MessageServiceImpl(MessageRepository messageRepository, RecipientRepository recipientRepository) {
        this.messageRepository = messageRepository;
        this.recipientRepository = recipientRepository;
    }

    @Override
    @Transactional
    public Message send(Message message, List<Long> recipientIds) {
        // 设置消息状态
        message.setStatus(MessageStatus.SENT);
        if (message.getCreatedAt() == null) {
            message.setCreatedAt(LocalDateTime.now());
        }
        Message savedMessage = messageRepository.save(message);

        // 创建收件人记录
        for (Long userId : recipientIds) {
            Recipient recipient = new Recipient();
            recipient.setTenantId(message.getTenantId());
            recipient.setMessageId(savedMessage.getId());
            recipient.setUserId(userId);
            recipient.setUsername("user_" + userId); // TODO: 从 UserService 获取
            recipient.setChannel(com.workflow.notification.model.ChannelType.IN_APP);
            recipient.setStatus(MessageStatus.PENDING);
            recipient.setCreatedAt(LocalDateTime.now());
            recipientRepository.save(recipient);
        }

        return savedMessage;
    }

    @Override
    public PageResult<Message> listByUserId(Long userId, int page, int size) {
        // 查找用户收到的消息
        List<Recipient> recipients = recipientRepository.findByUserId(userId);
        if (recipients.isEmpty()) {
            return new PageResult<>(0, page, size, new ArrayList<>());
        }
        List<Long> messageIds = recipients.stream().map(Recipient::getMessageId).toList();

        // 分页查询消息
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Message> messagePage = messageRepository.findByIdIn(messageIds, pageRequest);

        return new PageResult<>(
                messagePage.getTotalElements(),
                page,
                size,
                messagePage.getContent()
        );
    }

    @Override
    public Message getById(Long id, Long userId) {
        Message message = messageRepository.findById(id)
                .orElseThrow(() -> new BusinessException("消息不存在"));

        // 校验用户是否有权查看（是发送者或接收者）
        boolean isRecipient = recipientRepository.findByMessageId(id).stream()
                .anyMatch(r -> r.getUserId().equals(userId));
        if (!isRecipient && !message.getSenderId().equals(userId)) {
            throw new BusinessException(403, "无权查看此消息");
        }

        return message;
    }

    @Override
    @Transactional
    public void markAsRead(Long id, Long userId) {
        int updated = recipientRepository.markAsRead(id, userId, LocalDateTime.now());
        if (updated == 0) {
            throw new BusinessException("消息不存在或已读");
        }
    }

    @Override
    @Transactional
    public void markAllAsRead(Long userId) {
        recipientRepository.markAllAsRead(userId, LocalDateTime.now());
    }

    @Override
    @Transactional
    public void delete(Long id, Long userId) {
        // 校验用户有权删除（是接收者）
        boolean isRecipient = recipientRepository.findByMessageId(id).stream()
                .anyMatch(r -> r.getUserId().equals(userId));
        if (!isRecipient) {
            throw new BusinessException(403, "无权删除此消息");
        }
        recipientRepository.deleteByUserIdAndMessageId(userId, id);
    }

    @Override
    public long getUnreadCount(Long userId) {
        return recipientRepository.findByUserIdAndStatus(userId, MessageStatus.PENDING).size();
    }
}
