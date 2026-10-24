package com.workflow.api.controller;

import com.workflow.api.dto.AppReleaseResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.app.AppReleaseUploadService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Release 体验版上传 Controller（Task 9.3，spec: app-release-pipeline「体验版上传」）。
 * POST /api/v1/apps/{appId}/clients/{clientId}/releases/{releaseId}/upload
 * 上传凭据按 Client 配置（取自快照内 client.buildConfig），请求体不携带凭证。
 * V1 同步调用：应答即终态（UPLOADED + 体验版二维码地址 / 失败原因）。
 */
@RestController
@RequestMapping("/api/v1/apps/{appId}/clients/{clientId}/releases/{releaseId}")
public class AppReleaseUploadController {

    private final AppReleaseUploadService uploadService;

    public AppReleaseUploadController(AppReleaseUploadService uploadService) {
        this.uploadService = uploadService;
    }

    @PostMapping("/upload")
    public R<AppReleaseResponse> upload(@PathVariable String appId,
                                        @PathVariable String clientId,
                                        @PathVariable String releaseId) {
        return R.ok(uploadService.upload(appId, clientId, releaseId));
    }
}