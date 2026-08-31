package com.workflow.notification.api;

import com.workflow.common.domain.PageResult;
import com.workflow.common.domain.R;
import com.workflow.notification.model.Message;
import com.workflow.notification.store.MessageService;
import org.springframework.web.bind.annotation.*;

/**
 * 用户端消息 API
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final MessageService messageService;

    public NotificationController(MessageService messageService) {
        this.messageService = messageService;
    }

    /**
     * 获取消息列表（分页）
     */
    @GetMapping
    public R<PageResult<Message>> list(
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return R.ok(messageService.listByUserId(userId, page, size));
    }

    /**
     * 获取消息详情
     */
    @GetMapping("/{id}")
    public R<Message> getById(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        return R.ok(messageService.getById(id, userId));
    }

    /**
     * 标记消息已读
     */
    @PutMapping("/{id}/read")
    public R<Void> markAsRead(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        messageService.markAsRead(id, userId);
        return R.ok();
    }

    /**
     * 全部已读
     */
    @PostMapping("/read-all")
    public R<Void> markAllAsRead(@RequestHeader("X-User-Id") Long userId) {
        messageService.markAllAsRead(userId);
        return R.ok();
    }

    /**
     * 删除消息
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId) {
        messageService.delete(id, userId);
        return R.ok();
    }

    /**
     * 获取未读消息数
     */
    @GetMapping("/unread-count")
    public R<Long> getUnreadCount(@RequestHeader("X-User-Id") Long userId) {
        return R.ok(messageService.getUnreadCount(userId));
    }
}
