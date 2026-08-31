package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理端订阅规则 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/subscriptions")
public class SubscriptionController {

    /**
     * 订阅规则列表
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        // TODO: 查询订阅规则
        return R.ok(Map.of("rows", List.of(), "total", 0));
    }

    /**
     * 创建订阅规则
     */
    @PostMapping
    public R<Void> create(@RequestBody Map<String, Object> rule) {
        // TODO: 保存订阅规则
        return R.ok();
    }

    /**
     * 更新订阅规则
     */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> rule) {
        // TODO: 更新订阅规则
        return R.ok();
    }
}
