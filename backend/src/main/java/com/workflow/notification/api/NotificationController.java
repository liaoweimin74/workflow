package com.workflow.notification.api;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.store.MessageService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 用户端消息 API
 * 
 * <p>当前登录用户从 SecurityContext 获取（与 TaskController 等保持一致），
 * 不依赖前端传递用户 ID
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final MessageService messageService;

    public NotificationController(MessageService messageService) {
        this.messageService = messageService;
    }

    /**
     * 获取消息列表（分页，支持标题/分类/已读状态/时间段筛选）
     *
     * <p>时间参数格式与前端 SearchTable datetimerange 输出一致：{@code yyyy-MM-dd HH:mm:ss}
     */
    @GetMapping
    public R<PageResult<Message>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) MessageCategory category,
            @RequestParam(required = false) Boolean unread,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime start,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime end,
            @RequestParam(required = false) MessageType messageType) {
        return R.ok(messageService.listByUserId(currentUserId(), page, size, keyword, category, unread, start, end, messageType));
    }

    /**
     * 获取消息详情
     */
    @GetMapping("/{id}")
    public R<Message> getById(@PathVariable Long id) {
        return R.ok(messageService.getById(id, currentUserId()));
    }

    /**
     * 标记消息已读
     */
    @PutMapping("/{id}/read")
    public R<Void> markAsRead(@PathVariable Long id) {
        messageService.markAsRead(id, currentUserId());
        return R.ok();
    }

    /**
     * 批量标记已读
     */
    @PostMapping("/read-batch")
    public R<Void> batchMarkAsRead(@RequestBody List<Long> messageIds) {
        messageService.batchMarkAsRead(messageIds, currentUserId());
        return R.ok();
    }

    /**
     * 切换消息已读状态（未读↔已读）
     */
    @PostMapping("/{id}/toggle-read")
    public R<MessageStatus> toggleRead(@PathVariable Long id) {
        return R.ok(messageService.toggleRead(id, currentUserId()));
    }

    /**
     * 全部已读
     */
    @PostMapping("/read-all")
    public R<Void> markAllAsRead() {
        messageService.markAllAsRead(currentUserId());
        return R.ok();
    }

    /**
     * 删除消息
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        messageService.delete(id, currentUserId());
        return R.ok();
    }

    /**
     * 获取未读消息数
     */
    @GetMapping("/unread-count")
    public R<Long> getUnreadCount() {
        return R.ok(messageService.getUnreadCount(currentUserId()));
    }

    /**
     * 从 SecurityContext 获取当前登录用户 ID。
     */
    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUserId();
        }
        throw new com.workflow.common.exception.BusinessException("未获取到当前登录用户");
    }
}
