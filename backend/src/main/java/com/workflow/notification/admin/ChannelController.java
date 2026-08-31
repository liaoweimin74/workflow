package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.model.ChannelType;
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

    private final Map<ChannelType, ChannelAdapter> adapters;

    public ChannelController(List<ChannelAdapter> channelAdapters) {
        this.adapters = new ConcurrentHashMap<>();
        for (ChannelAdapter adapter : channelAdapters) {
            adapters.put(adapter.getChannelType(), adapter);
        }
    }

    /**
     * 渠道列表
     */
    @GetMapping
    public R<List<Map<String, Object>>> list() {
        List<Map<String, Object>> channels = new ArrayList<>();
        for (Map.Entry<Integer, ChannelType> entry : CHANNEL_BY_ID.entrySet()) {
            ChannelAdapter adapter = adapters.get(entry.getValue());
            Map<String, Object> channel = new LinkedHashMap<>();
            channel.put("id", entry.getKey());
            channel.put("name", channelName(entry.getValue()));
            channel.put("type", entry.getValue().name());
            channel.put("enabled", adapter != null && adapter.isAvailable());
            channel.put("successRate", adapter != null && adapter.isAvailable() ? 100 : null);
            channels.add(channel);
        }
        return R.ok(channels);
    }

    /**
     * 更新渠道配置
     */
    @PutMapping("/{id}/config")
    public R<Void> updateConfig(@PathVariable Long id, @RequestBody Map<String, String> config) {
        // TODO: 保存加密后的配置
        return R.ok();
    }

    /**
     * 测试渠道连通性
     *
     * <p>通过渠道 ID 定位对应适配器，调用其 test() 方法返回真实探测结果。
     */
    @PostMapping("/{id}/test")
    public R<Void> test(@PathVariable Long id) {
        ChannelType type = CHANNEL_BY_ID.get(id.intValue());
        if (type == null) {
            return R.fail("未知渠道 ID: " + id);
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
