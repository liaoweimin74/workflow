package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseBuildRequest;
import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.app.AppReleaseBuildService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Release 构建 Controller（Task 9.2，spec: app-release-pipeline「按 Client 构建」）。
 * POST /api/v1/apps/{appId}/clients/{clientId}/releases/{releaseId}/build
 * V1 同步调用：请求体携带前端出码 files，应答即终态（PUBLISHED/FAILED）。
 * 上传（.../upload）由 Task 9.3 追加。
 */
@RestController
@RequestMapping("/api/v1/apps/{appId}/clients/{clientId}/releases/{releaseId}")
public class AppReleaseBuildController {

    private final AppReleaseBuildService buildService;

    public AppReleaseBuildController(AppReleaseBuildService buildService) {
        this.buildService = buildService;
    }

    @PostMapping("/build")
    public R<AppReleaseResponse> build(@PathVariable String appId,
                                       @PathVariable String clientId,
                                       @PathVariable String releaseId,
                                       @RequestBody AppReleaseBuildRequest req) {
        return R.ok(buildService.build(appId, clientId, releaseId, req));
    }
}
