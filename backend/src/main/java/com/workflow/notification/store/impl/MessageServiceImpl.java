package com.workflow.notification.store.impl;

import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.notification.cache.NotificationCache;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.model.RecipientStatus;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.repository.SysUserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 消息服务实现
 */
@Service
public class MessageServiceImpl implements MessageService {

    private final MessageRepository messageRepository;
    private final RecipientRepository recipientRepository;
    private final NotificationCache notificationCache;
    private final SysUserRepository sysUserRepository;

    public MessageServiceImpl(MessageRepository messageRepository, RecipientRepository recipientRepository,
                              NotificationCache notificationCache, SysUserRepository sysUserRepository) {
        this.messageRepository = messageRepository;
        this.recipientRepository = recipientRepository;
        this.notificationCache = notificationCache;
        this.sysUserRepository = sysUserRepository;
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

        // 批量加载收件人真实用户信息（姓名/昵称/邮箱/手机号），缺失用户回退占位
        Map<Long, SysUser> usersById = new HashMap<>();
        if (sysUserRepository != null && !recipientIds.isEmpty()) {
            sysUserRepository.findAllById(recipientIds)
                    .forEach(u -> usersById.put(u.getId(), u));
        }

        // 创建收件人记录
        for (Long userId : recipientIds) {
            Recipient recipient = new Recipient();
            recipient.setTenantId(message.getTenantId());
            recipient.setMessageId(savedMessage.getId());
            recipient.setUserId(userId);
            SysUser user = usersById.get(userId);
            if (user != null) {
                recipient.setUsername(user.getUsername() != null ? user.getUsername() : "user_" + userId);
                recipient.setNickname(user.getNickname());
                recipient.setEmail(user.getEmail());
                recipient.setPhone(user.getPhone());
            } else {
                recipient.setUsername("user_" + userId);
            }
            recipient.setChannel(com.workflow.notification.model.ChannelType.IN_APP);
            recipient.setStatus(com.workflow.notification.model.RecipientStatus.PENDING);
            recipient.setCreatedAt(LocalDateTime.now());
            recipientRepository.save(recipient);

            // 更新缓存：未读数 +1
            notificationCache.incrementUnread(userId);
        }

        return savedMessage;
    }

    @Override
    public PageResult<Message> listByUserId(Long userId, int page, int size, String keyword,
                                           MessageCategory category, Boolean unread,
                                           LocalDateTime start, LocalDateTime end,
                                           MessageType messageType) {
        // 1. 按用户 + 已读状态过滤收件人记录，得到消息ID集合
        List<Recipient> recipients;
        if (unread != null) {
            recipients = recipientRepository.findByUserIdAndStatus(userId,
                    unread ? RecipientStatus.PENDING : RecipientStatus.SENT);
        } else {
            recipients = recipientRepository.findByUserId(userId);
        }
        if (recipients.isEmpty()) {
            return new PageResult<>(0, page, size, new ArrayList<>());
        }
        List<Long> messageIds = recipients.stream().map(Recipient::getMessageId).distinct().toList();

        // 2. 查询消息 + 筛选（关键字/分类/时间）
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Specification<Message> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(root.get("id").in(messageIds));
            if (keyword != null && !keyword.isBlank()) {
                predicates.add(cb.like(root.get("title"), "%" + keyword.trim() + "%"));
            }
            if (category != null) {
                predicates.add(cb.equal(root.get("category"), category));
            }
            if (messageType != null) {
                predicates.add(cb.equal(root.get("messageType"), messageType));
            }
            if (start != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
            if (end != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), end));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
        Page<Message> messagePage = messageRepository.findAll(spec, pageRequest);

        // 3. 将该用户对每条消息的已读状态回填到 message.readStatus
        //    （recipient: PENDING=未读, SENT=已读；Message.status 保留发送状态，二者分离）
        Map<Long, RecipientStatus> statusByMessage = recipients.stream()
                .collect(java.util.stream.Collectors.toMap(
                        Recipient::getMessageId, Recipient::getStatus, (a, b) -> a));
        messagePage.getContent().forEach(m -> m.setReadStatus(statusByMessage.get(m.getId())));

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

        // 回填当前用户的已读状态（与 listByUserId 一致：PENDING=未读，SENT=已读），
        // Message.status 保留发送状态，前端据此判断是否需要标记已读
        recipientRepository.findByMessageIdAndUserId(id, userId)
                .ifPresent(r -> message.setReadStatus(r.getStatus()));

        return message;
    }

    @Override
    @Transactional
    public void markAsRead(Long messageId, Long userId) {
        int updated = recipientRepository.markAsRead(messageId, userId, LocalDateTime.now());
        if (updated == 0) {
            throw new BusinessException("消息不存在或已读");
        }
        // 失效缓存
        notificationCache.invalidateUnread(userId);
    }

    @Override
    @Transactional
    public void batchMarkAsRead(List<Long> messageIds, Long userId) {
        if (messageIds == null || messageIds.isEmpty()) {
            return;
        }
        recipientRepository.markBatchAsRead(userId, messageIds, LocalDateTime.now());
        // 失效缓存
        notificationCache.invalidateUnread(userId);
    }

    @Override
    @Transactional
    public RecipientStatus toggleRead(Long id, Long userId) {
        Recipient recipient = recipientRepository.findByMessageIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException("消息不存在"));
        boolean unread = recipient.getStatus() == RecipientStatus.PENDING;
        recipient.setStatus(unread ? RecipientStatus.SENT : RecipientStatus.PENDING);
        recipient.setSentAt(unread ? LocalDateTime.now() : null);
        recipientRepository.save(recipient);
        // 失效缓存
        notificationCache.invalidateUnread(userId);
        return recipient.getStatus();
    }

    @Override
    @Transactional
    public void markAllAsRead(Long userId) {
        recipientRepository.markAllAsRead(userId, LocalDateTime.now());
        // 失效缓存
        notificationCache.invalidateUnread(userId);
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
        // 失效缓存
        notificationCache.invalidateUnread(userId);
    }

    @Override
    public long getUnreadCount(Long userId) {
        // 优先从缓存读取
        Long cached = notificationCache.getUnreadCount(userId);
        if (cached != null) {
            return cached;
        }

        // 缓存未命中，查询数据库
        long count = recipientRepository.findByUserIdAndStatus(userId, RecipientStatus.PENDING).size();

        // 回填缓存
        notificationCache.setUnreadCount(userId, count);

        return count;
    }
}
