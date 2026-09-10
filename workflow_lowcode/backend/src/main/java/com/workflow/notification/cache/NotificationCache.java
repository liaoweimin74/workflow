package com.workflow.notification.cache;

import com.workflow.framework.redis.RedisCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * 消息通知 Redis 缓存
 * 
 * <p>缓存未读计数，避免每次查询数据库
 * Redis 不可用时自动降级为直查数据库
 */
@Component
public class NotificationCache {

    private static final Logger log = LoggerFactory.getLogger(NotificationCache.class);

    /** 缓存 key 前缀 */
    private static final String UNREAD_PREFIX = "notification:unread:";

    /** 缓存过期时间：5 分钟 */
    private static final long UNREAD_TTL = 5;
    private static final TimeUnit UNREAD_UNIT = TimeUnit.MINUTES;

    private final RedisCache redisCache;

    public NotificationCache(@Autowired(required = false) RedisCache redisCache) {
        this.redisCache = redisCache;
    }

    /**
     * 获取缓存的未读数
     *
     * @return 未读数，缓存未命中返回 null
     */
    public Long getUnreadCount(Long userId) {
        if (redisCache == null) return null;
        try {
            String value = redisCache.get(UNREAD_PREFIX + userId);
            return value != null ? Long.parseLong(value) : null;
        } catch (Exception e) {
            log.warn("Redis 读取失败，降级查询数据库: userId={}", userId);
            return null;
        }
    }

    /**
     * 设置未读数缓存
     */
    public void setUnreadCount(Long userId, long count) {
        if (redisCache == null) return;
        try {
            redisCache.set(UNREAD_PREFIX + userId, String.valueOf(count), UNREAD_TTL, UNREAD_UNIT);
        } catch (Exception e) {
            log.warn("Redis 写入失败: userId={}", userId);
        }
    }

    /**
     * 未读数 +1
     */
    public void incrementUnread(Long userId) {
        if (redisCache == null) return;
        try {
            String key = UNREAD_PREFIX + userId;
            if (redisCache.hasKey(key)) {
                redisCache.increment(key, 1);
            }
            // 如果 key 不存在，不在这里设置（避免覆盖），等查询时回填
        } catch (Exception e) {
            log.warn("Redis increment 失败: userId={}", userId);
        }
    }

    /**
     * 未读数 -1
     */
    public void decrementUnread(Long userId) {
        if (redisCache == null) return;
        try {
            String key = UNREAD_PREFIX + userId;
            if (redisCache.hasKey(key)) {
                redisCache.increment(key, -1);
            }
        } catch (Exception e) {
            log.warn("Redis decrement 失败: userId={}", userId);
        }
    }

    /**
     * 清除用户未读数缓存（已读/删除时调用）
     */
    public void invalidateUnread(Long userId) {
        if (redisCache == null) return;
        try {
            redisCache.delete(UNREAD_PREFIX + userId);
        } catch (Exception e) {
            log.warn("Redis 删除失败: userId={}", userId);
        }
    }
}
