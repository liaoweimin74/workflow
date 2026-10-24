package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseCreateRequest;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.app.AppReleaseService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 发布快照 Controller（Task 9.1，spec: app-release-pipeline）。
 * POST /api/v1/apps/{appId}/clients/{clientId}/releases        创建快照（固化 published_version）
 * GET  /api/v1/apps/{appId}/clients/{clientId}/releases        快照列表（version 降序）
 * GET  /api/v1/apps/{appId}/clients/{clientId}/releases/{id}   快照明细
 * 刻意不提供 PUT/DELETE：快照不可原地变更，重发布 = 新建 Release。
 * 构建触发（POST .../releases/{id}/build）与上传（.../upload）由 Task 9.2/9.3 追加。
 */
@RestController
@RequestMapping("/api/v1/apps/{appId}/clients/{clientId}/releases")
public class AppReleaseController {

    private final AppReleaseService releaseService;

    public AppReleaseController(AppReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @PostMapping
    public R<AppReleaseResponse> create(@PathVariable String appId,
                                        @PathVariable String clientId,
                                        @RequestBody(required = false) AppReleaseCreateRequest req) {
        return R.ok(releaseService.create(appId, clientId));
    }

    @GetMapping
    public R<List<AppReleaseResponse>> list(@PathVariable String appId, @PathVariable String clientId) {
        return R.ok(releaseService.list(appId, clientId));
    }

    @GetMapping("/{releaseId}")
    public R<AppReleaseResponse> get(@PathVariable String appId,
                                     @PathVariable String clientId,
                                     @PathVariable String releaseId) {
        return R.ok(releaseService.get(appId, clientId, releaseId));
    }
}
