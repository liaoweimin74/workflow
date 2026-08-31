package com.workflow.notification.sse;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SSE 连接 endpoint
 */
@RestController
@RequestMapping("/api/v1/notifications/sse")
public class NotificationSseController {

    private final SseEmitterManager sseManager;

    public NotificationSseController(SseEmitterManager sseManager) {
        this.sseManager = sseManager;
    }

    /**
     * 建立 SSE 连接
     * 
     * <p>前端通过 EventSource 连接此 endpoint，
     * 后端在有新消息时推送事件
     */
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect(@RequestHeader("X-User-Id") Long userId) {
        return sseManager.register(userId);
    }
}
