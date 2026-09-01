package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.criteria.Predicate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端发送记录 API
 *
 * <p>发送记录 = 消息(msg_message) + 收件人(msg_recipient) 聚合。
 * 每次发送（含渠道连通性测试消息）都会经 {@code MessageService#send} 写入这两个表，
 * 因此发送记录天然包含测试消息，无需额外记录表。
 */
@RestController
@RequestMapping("/api/v1/admin/notification/deliveries")
public class DeliveryController {

    private final MessageRepository messageRepository;
    private final RecipientRepository recipientRepository;

    public DeliveryController(MessageRepository messageRepository, RecipientRepository recipientRepository) {
        this.messageRepository = messageRepository;
        this.recipientRepository = recipientRepository;
    }

    /**
     * 发送记录列表（按消息聚合，时间倒序）
     *
     * <p>支持按标题（keyword）、收件人用户名（recipient）、渠道（channel）与时间段（start/end）过滤。
     * 收件人与渠道位于收件人表（msg_recipient），需先反查匹配的消息ID再过滤消息表。
     *
     * @return rows: [{id, title, recipientCount, recipients, channel, status, createdAt}]
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String recipient,
            @RequestParam(required = false) ChannelType channel,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end) {

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        // 1. 按收件人/渠道过滤时：从收件人表反查匹配的消息ID集合
        List<Long> filteredMessageIds = null;
        boolean filterByRecipient = recipient != null && !recipient.isBlank();
        boolean filterByChannel = channel != null;
        if (filterByRecipient || filterByChannel) {
            List<Recipient> matched = new ArrayList<>();
            if (filterByRecipient) {
                matched.addAll(recipientRepository.findByUsernameContaining(recipient.trim()));
            }
            if (filterByChannel) {
                matched.addAll(recipientRepository.findByChannel(channel));
            }
            filteredMessageIds = matched.stream().map(Recipient::getMessageId).distinct().toList();
            // 无匹配收件人/渠道：直接返回空结果（避免 id IN () 无效）
            if (filteredMessageIds.isEmpty()) {
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("rows", new ArrayList<>());
                empty.put("total", 0L);
                return R.ok(empty);
            }
        }

        // 2. 组合标题/时间段/消息ID过滤
        final List<Long> messageIdsForFilter = filteredMessageIds;
        Specification<Message> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (keyword != null && !keyword.isBlank()) {
                predicates.add(cb.like(root.get("title"), "%" + keyword.trim() + "%"));
            }
            if (start != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
            if (end != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), end));
            }
            if (messageIdsForFilter != null) {
                predicates.add(root.get("id").in(messageIdsForFilter));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Page<Message> messages = messageRepository.findAll(spec, pageable);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Message m : messages.getContent()) {
            List<Recipient> recipients = recipientRepository.findByMessageId(m.getId());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", m.getId());
            row.put("title", m.getTitle());
            row.put("recipientCount", recipients.size());
            row.put("recipients", recipients.stream().map(r -> {
                Map<String, Object> rec = new LinkedHashMap<>();
                rec.put("userId", r.getUserId());
                rec.put("username", r.getUsername());
                rec.put("status", r.getStatus().name());
                return rec;
            }).toList());
            row.put("channel", recipients.isEmpty() ? "IN_APP" : recipients.get(0).getChannel().name());
            row.put("status", m.getStatus() != null ? m.getStatus().name() : "SENT");
            row.put("createdAt", m.getCreatedAt());
            rows.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", messages.getTotalElements());
        return R.ok(result);
    }

    /**
     * 手动重发
     */
    @PostMapping("/{id}/retry")
    public R<Void> retry(@PathVariable Long id) {
        // TODO: 重新触发发送
        return R.ok();
    }
}
