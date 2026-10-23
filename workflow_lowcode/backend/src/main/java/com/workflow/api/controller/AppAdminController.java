package com.workflow.api.controller;

import com.workflow.api.dto.AppClientPageItem;
import com.workflow.api.dto.AppClientPageResponse;
import com.workflow.api.dto.AppClientResponse;
import com.workflow.api.dto.AppClientSaveRequest;
import com.workflow.api.dto.AppResponse;
import com.workflow.api.dto.AppSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.app.AppModelService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 多端应用管理 Controller（Task 1.2 / 1.3）。
 * 应用（App）与客户端实例（Client）的 CRUD；页面启用清单
 * PUT/GET /{appId}/clients/{clientId}/pages。
 * 响应封装统一为 { code, data, message }（R<T>）。
 */
@RestController
@RequestMapping("/api/v1/apps")
public class AppAdminController {

    private final AppModelService appModelService;

    public AppAdminController(AppModelService appModelService) {
        this.appModelService = appModelService;
    }

    @PostMapping
    public R<AppResponse> create(@RequestBody AppSaveRequest req) {
        return R.ok(appModelService.createApp(req));
    }

    @GetMapping
    public R<PageResponse<AppResponse>> list(@RequestParam(required = false) String keyword,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return R.ok(appModelService.listApps(keyword, page, size));
    }

    @GetMapping("/{appId}")
    public R<AppResponse> get(@PathVariable String appId) {
        return R.ok(appModelService.getApp(appId));
    }

    @PutMapping("/{appId}")
    public R<AppResponse> update(@PathVariable String appId, @RequestBody AppSaveRequest req) {
        return R.ok(appModelService.updateApp(appId, req));
    }

    @DeleteMapping("/{appId}")
    public R<Void> delete(@PathVariable String appId) {
        appModelService.deleteApp(appId);
        return R.ok();
    }

    @PostMapping("/{appId}/clients")
    public R<AppClientResponse> createClient(@PathVariable String appId, @RequestBody AppClientSaveRequest req) {
        return R.ok(appModelService.createClient(appId, req));
    }

    @GetMapping("/{appId}/clients")
    public R<List<AppClientResponse>> listClients(@PathVariable String appId) {
        return R.ok(appModelService.listClients(appId));
    }

    @PutMapping("/{appId}/clients/{clientId}")
    public R<AppClientResponse> updateClient(@PathVariable String appId,
                                             @PathVariable String clientId,
                                             @RequestBody AppClientSaveRequest req) {
        return R.ok(appModelService.updateClient(appId, clientId, req));
    }

    @DeleteMapping("/{appId}/clients/{clientId}")
    public R<Void> deleteClient(@PathVariable String appId, @PathVariable String clientId) {
        appModelService.deleteClient(appId, clientId);
        return R.ok();
    }

    /**
     * 全量替换客户端页面启用清单（Task 1.3）。
     */
    @PutMapping("/{appId}/clients/{clientId}/pages")
    public R<List<AppClientPageResponse>> assignPages(@PathVariable String appId,
                                                      @PathVariable String clientId,
                                                      @RequestBody List<AppClientPageItem> items) {
        return R.ok(appModelService.assignPages(appId, clientId, items));
    }

    /**
     * 查询客户端页面启用清单（按 sort 升序，附带页面名称）。
     */
    @GetMapping("/{appId}/clients/{clientId}/pages")
    public R<List<AppClientPageResponse>> getAssignedPages(@PathVariable String appId,
                                                           @PathVariable String clientId) {
        return R.ok(appModelService.getAssignedPages(appId, clientId));
    }
}
