package com.workflow.notification.sse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SSE 连接管理器
 * 
 * <p>管理每个用户的 SSE 连接，支持向指定用户推送消息事件
 */
@Component
public class SseEmitterManager {

    private static final Logger log = LoggerFactory.getLogger(SseEmitterManager.class);

    /** userId → SseEmitter */
    private final Map<Long, SseEmitter> connections = new ConcurrentHashMap<>();

    /** 超时时间：30分钟 */
    private static final long TIMEOUT = 30 * 60 * 1000;

    /**
     * 注册用户的 SSE 连接
     */
    public SseEmitter register(Long userId) {
        // 关闭旧连接
        SseEmitter old = connections.remove(userId);
        if (old != null) {
            old.complete();
        }

        SseEmitter emitter = new SseEmitter(TIMEOUT);

        emitter.onCompletion(() -> {
            connections.remove(userId);
            log.debug("SSE 连接完成: userId={}", userId);
        });

        emitter.onTimeout(() -> {
            connections.remove(userId);
            log.debug("SSE 连接超时: userId={}", userId);
        });

        emitter.onError(e -> {
            connections.remove(userId);
            log.warn("SSE 连接错误: userId={}", userId, e);
        });

        connections.put(userId, emitter);
        log.info("SSE 连接注册: userId={}, 当前在线={}", userId, connections.size());

        return emitter;
    }

    /**
     * 向指定用户推送消息事件
     */
    public void sendToUser(Long userId, String eventName, Object data) {
        SseEmitter emitter = connections.get(userId);
        if (emitter == null) {
            log.debug("用户不在线，跳过推送: userId={}", userId);
            return;
        }

        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(data));
        } catch (IOException e) {
            connections.remove(userId);
            log.warn("SSE 推送失败: userId={}", userId, e);
        }
    }

    /**
     * 获取当前在线用户数
     */
    public int getOnlineCount() {
        return connections.size();
    }
}
