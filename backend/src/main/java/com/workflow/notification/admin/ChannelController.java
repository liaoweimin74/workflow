package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理端渠道 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/channels")
@PreAuthorize("hasAnyRole('ADMIN', 'NOTIFICATION_MANAGER')")
public class ChannelController {

    /**
     * 渠道列表
     */
    @GetMapping
    public R<List<Map<String, Object>>> list() {
        // TODO: 从配置或数据库读取渠道信息
        List<Map<String, Object>> channels = List.of(
            Map.of("id", 1, "name", "站内信", "type", "IN_APP", "enabled", true, "successRate", 100),
            Map.of("id", 2, "name", "短信", "type", "SMS", "enabled", false),
            Map.of("id", 3, "name", "企业微信", "type", "WECHAT_WORK", "enabled", false),
            Map.of("id", 4, "name", "小程序", "type", "WECHAT_MINIPROGRAM", "enabled", false)
        );
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
     */
    @PostMapping("/{id}/test")
    public R<Void> test(@PathVariable Long id) {
        // TODO: 调用对应渠道适配器的测试方法
        return R.ok();
    }
}
