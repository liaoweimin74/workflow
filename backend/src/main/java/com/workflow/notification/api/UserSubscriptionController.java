package com.workflow.notification.api;

import com.workflow.common.domain.R;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.UserSubscription;
import com.workflow.notification.subscription.SubscriptionService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户端订阅偏好 API
 *
 * <p>当前登录用户管理各渠道（站内信/短信/企业微信/小程序）的订阅开关。
 * 发送链路 {@code MessageDispatcher} 已通过 {@link SubscriptionService#shouldSend}
 * 按用户偏好拦截外部渠道投递，此接口即为用户侧管理入口。
 * 用户未设置过的渠道视为默认订阅（返回 subscribed=true）。
 */
@RestController
@RequestMapping("/api/v1/notifications/subscriptions")
public class UserSubscriptionController {

    private final SubscriptionService subscriptionService;
    private final TenantProvider tenantProvider;

    public UserSubscriptionController(SubscriptionService subscriptionService, TenantProvider tenantProvider) {
        this.subscriptionService = subscriptionService;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 获取当前用户全部渠道的订阅偏好（未设置的渠道默认 subscribed=true）。
     *
     * @return rows: [{channel, channelName, subscribed}]
     */
    @GetMapping
    public R<List<Map<String, Object>>> list() {
        Long userId = currentUserId();
        String tenantId = tenantProvider.getTenantId();

        Map<ChannelType, Boolean> prefs = subscriptionService.getUserPreferences(tenantId, userId).stream()
                .collect(Collectors.toMap(
                        UserSubscription::getChannel,
                        u -> Boolean.TRUE.equals(u.getSubscribed()),
                        (a, b) -> a));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (ChannelType channel : ChannelType.values()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("channel", channel.name());
            row.put("channelName", channelName(channel));
            // 未设置过 → 默认订阅 true
            row.put("subscribed", prefs.getOrDefault(channel, true));
            rows.add(row);
        }
        return R.ok(rows);
    }

    /**
     * 批量更新当前用户订阅偏好。
     *
     * @param items 渠道开关列表 [{channel, subscribed}]
     */
    @PutMapping
    public R<Void> update(@RequestBody List<Map<String, Object>> items) {
        Long userId = currentUserId();
        String tenantId = tenantProvider.getTenantId();

        if (items != null) {
            for (Map<String, Object> item : items) {
                Object channelVal = item.get("channel");
                Object subscribedVal = item.get("subscribed");
                if (channelVal == null || subscribedVal == null) {
                    continue;
                }
                try {
                    ChannelType channel = ChannelType.valueOf(String.valueOf(channelVal));
                    boolean subscribed = Boolean.parseBoolean(String.valueOf(subscribedVal));
                    subscriptionService.updatePreference(tenantId, userId, channel, subscribed);
                } catch (IllegalArgumentException e) {
                    // 非法渠道名忽略，不中断整批更新
                }
            }
        }
        return R.ok();
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

    private String channelName(ChannelType type) {
        return switch (type) {
            case IN_APP -> "站内信";
            case SMS -> "短信";
            case WECHAT_WORK -> "企业微信";
            case WECHAT_MINIPROGRAM -> "小程序";
            case APP -> "APP";
        };
    }
}
