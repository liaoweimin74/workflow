package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.Recipient;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.store.RecipientRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端公告发布 API。
 *
 * <p>管理员创建公共公告：以 PUBLIC 消息类型 + SYSTEM 类别构造公告消息，
 * 按调用方指定的用户ID列表广播（复用现有 {@code MessageService#send} 底层链路，
 * 为每个用户创建站内信收件人记录），并通过 SSE 实时推送给在线用户。
 * 公告以 {@code templateCode=ANNOUNCEMENT} 标记，支持列表查询与撤回。
 */
@RestController
@RequestMapping("/api/v1/admin/notification/announcements")
public class AnnouncementController {

    private static final String ANNOUNCEMENT_TEMPLATE = "ANNOUNCEMENT";

    private final MessageService messageService;
    private final SseEmitterManager sseManager;
    private final MessageRepository messageRepository;
    private final RecipientRepository recipientRepository;

    public AnnouncementController(MessageService messageService,
                                  SseEmitterManager sseManager,
                                  MessageRepository messageRepository,
                                  RecipientRepository recipientRepository) {
        this.messageService = messageService;
        this.sseManager = sseManager;
        this.messageRepository = messageRepository;
        this.recipientRepository = recipientRepository;
    }

    /**
     * 发布公共公告。
     *
     * @param title        公告标题
     * @param content      公告正文（Markdown）
     * @param recipientIds 接收用户ID列表（手动指定广播范围）
     */
    @PostMapping
    public R<Void> publish(@RequestParam String title,
                           @RequestParam String content,
                           @RequestParam List<Long> recipientIds) {
        NotificationAdminAuthorization.requireAdmin();
        Long userId = currentUserId();

        Message message = new Message();
        message.setTenantId("default");
        message.setTemplateCode(ANNOUNCEMENT_TEMPLATE);
        message.setSenderId(userId);
        message.setSenderType("SYSTEM");
        message.setTitle(title);
        message.setContentType(TemplateContentType.MARKDOWN);
        message.setContent(Map.of(
                "text", content,
                "variables", Map.of()));
        message.setPriority(MessagePriority.NORMAL);
        message.setCategory(MessageCategory.SYSTEM);
        message.setMessageType(MessageType.PUBLIC);

        messageService.send(message, recipientIds);
        for (Long targetId : recipientIds) {
            sseManager.sendToUser(targetId, "new-message", message);
        }
        return R.ok();
    }

    /**
     * 公告列表（按发布时间倒序分页）。
     *
     * @return rows: [{id, title, senderId, recipientCount, createdAt}]
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {

        NotificationAdminAuthorization.requireAdmin();
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Specification<Message> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("templateCode"), ANNOUNCEMENT_TEMPLATE));
            if (keyword != null && !keyword.isBlank()) {
                predicates.add(cb.like(root.get("title"), "%" + keyword.trim() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Page<Message> announcements = messageRepository.findAll(spec, pageable);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Message m : announcements.getContent()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", m.getId());
            row.put("title", m.getTitle());
            row.put("senderId", m.getSenderId());
            row.put("recipientCount", recipientRepository.findByMessageId(m.getId()).size());
            row.put("createdAt", m.getCreatedAt());
            rows.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", announcements.getTotalElements());
        return R.ok(result);
    }

    /**
     * 撤回公告（删除消息及其收件人记录）。
     */
    @DeleteMapping("/{id}")
    public R<Void> recall(@PathVariable Long id) {
        NotificationAdminAuthorization.requireAdmin();
        Message message = messageRepository.findById(id)
                .orElseThrow(() -> new com.workflow.common.exception.BusinessException("公告不存在: " + id));
        if (!ANNOUNCEMENT_TEMPLATE.equals(message.getTemplateCode())) {
            throw new com.workflow.common.exception.BusinessException("非公告消息，不可撤回: " + id);
        }
        // 删除收件人记录 + 消息本身
        List<Recipient> recipients = recipientRepository.findByMessageId(id);
        recipientRepository.deleteAll(recipients);
        messageRepository.delete(message);
        return R.ok();
    }

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUserId();
        }
        throw new com.workflow.common.exception.BusinessException("未获取到当前登录用户");
    }

}
