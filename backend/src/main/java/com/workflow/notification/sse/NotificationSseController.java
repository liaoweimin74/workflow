package com.workflow.notification.sse;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SSE 连接 endpoint
 * 
 * <p>注意：浏览器 {@code EventSource} 无法自定义请求头，
 * 因此这里通过 query 参数 {@code token} 传递 JWT，手动解析当前用户。
 * 该路径已在 SecurityConfig 中放行。
 */
@RestController
@RequestMapping("/api/v1/notifications/sse")
public class NotificationSseController {

    private final SseEmitterManager sseManager;
    private final JwtTokenProvider jwtTokenProvider;

    public NotificationSseController(SseEmitterManager sseManager,
                                     JwtTokenProvider jwtTokenProvider) {
        this.sseManager = sseManager;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    /**
     * 建立 SSE 连接
     * 
     * <p>前端通过 EventSource 连接此 endpoint（URL 携带 token），
     * 后端在有新消息时推送事件
     */
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect(@RequestParam("token") String token) {
        if (!jwtTokenProvider.validateToken(token)) {
            throw new IllegalArgumentException("无效的访问令牌");
        }
        if (!GlobalConstant.ACCESS_TOKEN_KEY.equals(jwtTokenProvider.getTokenType(token))) {
            throw new IllegalArgumentException("令牌类型必须是访问令牌");
        }
        Long userId = jwtTokenProvider.getUserIdFromToken(token);
        return sseManager.register(userId);
    }
}
