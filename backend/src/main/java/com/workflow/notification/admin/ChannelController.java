package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.DeliveryRetry;
import com.workflow.notification.model.Message;
import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.TemplateContentType;
import com.workflow.notification.sse.SseEmitterManager;
import com.workflow.notification.store.DeliveryRetryRepository;
import com.workflow.notification.store.MessageService;
import com.workflow.notification.subscription.ChannelConfigService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 管理端渠道 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/channels")
public class ChannelController {

    /** 渠道 ID → 类型映射（ID 稳定，供前端引用；保持与历史版本一致，按 ID 有序） */
    private static final Map<Integer, ChannelType> CHANNEL_BY_ID;
    static {
        CHANNEL_BY_ID = new LinkedHashMap<>();
        CHANNEL_BY_ID.put(1, ChannelType.IN_APP);
        CHANNEL_BY_ID.put(2, ChannelType.SMS);
        CHANNEL_BY_ID.put(3, ChannelType.WECHAT_WORK);
        CHANNEL_BY_ID.put(4, ChannelType.WECHAT_MINIPROGRAM);
    }

    /** 测试消息模板编码 */
    private static final String TEST_TEMPLATE_CODE = "CHANNEL_TEST";

    private final Map<ChannelType, ChannelAdapter> adapters;
    private final MessageService messageService;
    private final SseEmitterManager sseManager;
    private final ChannelConfigService channelConfigService;
    private final DeliveryRetryRepository retryRepository;

    public ChannelController(List<ChannelAdapter> channelAdapters,
                             MessageService messageService,
                             SseEmitterManager sseManager,
                             ChannelConfigService channelConfigService,
                             DeliveryRetryRepository retryRepository) {
        this.adapters = new ConcurrentHashMap<>();
        for (ChannelAdapter adapter : channelAdapters) {
            adapters.put(adapter.getChannelType(), adapter);
        }
        this.messageService = messageService;
        this.sseManager = sseManager;
        this.channelConfigService = channelConfigService;
        this.retryRepository = retryRepository;
    }

    /**
     * 渠道列表
     *
     * <p>enabled：站内信恒可用；外部渠道 = 已配置运行时配置（或配置项齐全的静态配置）。
     * successRate：站内信 100；外部渠道按该渠道重试记录统计（成功=无失败/重试中记录）。
     */
    @GetMapping
    public R<List<Map<String, Object>>> list() {
        requireAdmin();
        List<Map<String, Object>> channels = new ArrayList<>();
        for (Map.Entry<Integer, ChannelType> entry : CHANNEL_BY_ID.entrySet()) {
            ChannelType type = entry.getValue();
            ChannelAdapter adapter = adapters.get(type);
            Map<String, Object> channel = new LinkedHashMap<>();
            channel.put("id", entry.getKey());
            channel.put("name", channelName(type));
            channel.put("type", type.name());
            boolean enabled;
            if (type == ChannelType.IN_APP) {
                enabled = true;
            } else {
                enabled = channelConfigService.isConfigured(type)
                        || (adapter != null && adapter.isAvailable());
            }
            channel.put("enabled", enabled);
            channel.put("successRate", successRate(type));
            channels.add(channel);
        }
        return R.ok(channels);
    }

    /**
     * 渠道成功率：站内信 100%；外部渠道按该渠道重试记录估算——
     * 有 FAILED 记 0%，有 PENDING（重试中）记 50%，无异常记录且已配置记 100%。
     */
    private Integer successRate(ChannelType type) {
        if (type == ChannelType.IN_APP) {
            return 100;
        }
        List<DeliveryRetry> retries = retryRepository.findByChannel(type);
        if (retries == null || retries.isEmpty()) {
            return channelConfigService.isConfigured(type) ? 100 : null;
        }
        boolean hasFailed = retries.stream()
                .anyMatch(r -> r.getStatus() == MessageStatus.FAILED);
        if (hasFailed) {
            return 0;
        }
        boolean hasPending = retries.stream()
                .anyMatch(r -> r.getStatus() == MessageStatus.PENDING);
        return hasPending ? 50 : 100;
    }

    /**
     * 更新渠道配置（敏感字段加密存储）
     */
    @PutMapping("/{id}/config")
    public R<Void> updateConfig(@PathVariable Long id, @RequestBody Map<String, String> config) {
        requireAdmin();
        ChannelType type = CHANNEL_BY_ID.get(id.intValue());
        if (type == null) {
            return R.fail("未知渠道 ID: " + id);
        }
        channelConfigService.save(type, config);
        return R.ok();
    }

    /**
     * 测试渠道连通性
     *
     * <p>发送一条真实的测试消息：
     * <ul>
     *   <li>站内信：给当前登录用户创建一条站内信（落库 + SSE 推送），可在消息中心直接查看</li>
     *   <li>外部渠道：调用适配器 {@code send} 走完整发送链路，以真实投递结果判定连通性</li>
     * </ul>
     */
    @PostMapping("/{id}/test")
    public R<Void> test(@PathVariable Long id) {
        requireAdmin();
        ChannelType type = CHANNEL_BY_ID.get(id.intValue());
        if (type == null) {
            return R.fail("未知渠道 ID: " + id);
        }

        // 站内信：真实创建一条测试消息给当前用户
        if (type == ChannelType.IN_APP) {
            return sendInAppTestMessage();
        }

        ChannelAdapter adapter = adapters.get(type);
        if (adapter == null) {
            return R.fail("渠道适配器未注册: " + type);
        }
        ChannelDeliveryResult result = adapter.test();
        if (!result.isSuccess()) {
            return R.fail("渠道测试失败: " + result.getError());
        }
        return R.ok();
    }

    /**
     * 给当前登录用户发送一条真实的站内信测试消息
     */
    private R<Void> sendInAppTestMessage() {
        Long userId = currentUserId();

        Message message = new Message();
        message.setTenantId("default");
        message.setTemplateCode(TEST_TEMPLATE_CODE);
        message.setSenderId(userId);
        message.setSenderType("SYSTEM");
        message.setTitle("【渠道测试】站内信连通性测试");
        message.setContentType(TemplateContentType.MARKDOWN);
        message.setContent(Map.of(
                "text", "这是一条渠道连通性**测试消息**，收到即表示站内信渠道正常。",
                "variables", Map.of()));
        message.setPriority(MessagePriority.NORMAL);
        message.setCategory(MessageCategory.SYSTEM);
        message.setMessageType(MessageType.PRIVATE);

        messageService.send(message, List.of(userId));
        sseManager.sendToUser(userId, "new-message", message);
        return R.ok();
    }

    /**
     * 从 SecurityContext 获取当前登录用户 ID
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

    private void requireAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof LoginUser loginUser)) {
            throw new com.workflow.common.exception.BusinessException("需要管理员权限");
        }
        boolean isAdmin = loginUser.getRoles().stream()
                .anyMatch(r -> "ROLE_ADMIN".equals(r) || "admin".equals(r));
        if (!isAdmin) {
            throw new com.workflow.common.exception.BusinessException("需要管理员权限");
        }
    }
}
