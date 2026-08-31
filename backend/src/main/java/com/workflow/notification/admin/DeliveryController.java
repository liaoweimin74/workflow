package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.RecipientRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

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
     * @return rows: [{id, title, recipientCount, recipients, channel, status, createdAt}]
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<Message> messages = messageRepository.findAll(
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));

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
