package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.MessageService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理端公告发布 API。
 *
 * <p>管理员创建公共公告：以 PUBLIC 消息类型 + SYSTEM 类别构造公告消息，
 * 按调用方指定的用户ID列表广播（复用现有 {@code MessageService#send} 底层链路，
 * 为每个用户创建站内信收件人记录），并通过 SSE 实时推送给在线用户。
 */
@RestController
@RequestMapping("/api/v1/admin/notification/announcements")
public class AnnouncementController {

    private final MessageService messageService;
    private final SseEmitterManager sseManager;

    public AnnouncementController(MessageService messageService, SseEmitterManager sseManager) {
        this.messageService = messageService;
        this.sseManager = sseManager;
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
        Long userId = currentUserId();

        Message message = new Message();
        message.setTenantId("default");
        message.setTemplateCode("ANNOUNCEMENT");
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

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUserId();
        }
        throw new com.workflow.common.exception.BusinessException("未获取到当前登录用户");
    }
}
