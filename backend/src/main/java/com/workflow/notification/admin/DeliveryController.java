package com.workflow.notification.admin;

import com.workflow.common.domain.R;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 管理端发送记录 API
 */
@RestController
@RequestMapping("/api/v1/admin/notification/deliveries")
public class DeliveryController {

    /**
     * 发送记录列表
     */
    @GetMapping
    public R<Map<String, Object>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        // TODO: 查询发送记录
        return R.ok(Map.of("rows", List.of(), "total", 0));
    }

    /**
     * 手动重发
     */
    @PostMapping("/{id}/retry")
    public R<Void> retry(@PathVariable Long id) {
        // TODO: 重新触发发送
        return R.ok();
    }
}
