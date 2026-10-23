package com.workflow.api.controller;

import com.workflow.api.dto.PageDefinitionDTO;
import com.workflow.api.dto.PageDefinitionDetailDTO;
import com.workflow.api.dto.PageDefinitionSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.HomePageSettingService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.framework.security.permission.PermissionEvaluator;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 页面定义 Controller。
 * 管理页面（视图 VIEW / 自定义页面 PAGE）的 CRUD、发布与版本管理。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageDefinitionController {

    private static final String PERMISSION_PUBLISH = "page:publish";

    private final PageDefinitionService pageDefService;
    private final PageAccessGuard pageAccessGuard;
    private final HomePageSettingService homePageSettingService;
    private final PermissionEvaluator permissionEvaluator;

    public PageDefinitionController(PageDefinitionService pageDefService,
                                    PageAccessGuard pageAccessGuard,
                                    HomePageSettingService homePageSettingService,
                                    PermissionEvaluator permissionEvaluator) {
        this.pageDefService = pageDefService;
        this.pageAccessGuard = pageAccessGuard;
        this.homePageSettingService = homePageSettingService;
        this.permissionEvaluator = permissionEvaluator;
    }

    /**
     * 创建页面定义。
     */
    @PostMapping
    public R<PageDefinition> create(@RequestBody PageDefinitionSaveRequest request) {
        PageDefinition pageDef = pageDefService.create(
                request.getName(), request.getKey(), request.getType(), request.getFormKey(),
                request.getDataSourceId(), request.getSchema());
        return R.ok(pageDef);
    }

    /**
     * 分页查询页面定义列表。
     */
    @GetMapping
    public R<PageResponse<PageDefinitionDTO>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String type) {

        PageRequest pageable = PageRequest.of(Math.max(page, 1) - 1, size);
        Page<PageDefinition> result = pageDefService.list(status, name, type, pageable);

        List<PageDefinitionDTO> dtos = result.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());

        PageResponse<PageDefinitionDTO> response = new PageResponse<>(
                dtos, result.getNumber() + 1, result.getSize(), result.getTotalElements());
        return R.ok(response);
    }

    /**
     * 当前系统首页的页面 key（未配置或配置失效时为 dashboard）。
     */
    @GetMapping("/home")
    public R<String> getHomePage() {
        return R.ok(homePageSettingService.getHomePageKey());
    }

    /**
     * 把已发布的自定义页面设为系统首页（租户级）。
     */
    @PutMapping("/{id}/home")
    public R<String> setHomePage(@PathVariable String id) {
        if (!permissionEvaluator.hasPermission(PERMISSION_PUBLISH)) {
            throw new BusinessException(403, "需要页面发布权限（" + PERMISSION_PUBLISH + "）");
        }
        return R.ok(homePageSettingService.setHomePage(id));
    }

    /**
     * 获取页面定义详情（含 schema）。
     */
    @GetMapping("/{id}")
    public R<PageDefinitionDetailDTO> getById(@PathVariable String id) {
        return R.ok(toDetailDTO(pageDefService.getById(id)));
    }

    /**
     * 按 key 获取页面定义。
     * 渲染页默认取已发布版本（未发布 → 404）；preview=true 时取最新定义，
     * 未发布的 DRAFT 视图动态编译（效果与发布后一致），预览用。
     * 非 preview 访问经 PageAccessGuard 校验权限（无菜单 404 / 无权限 403）。
     */
    @GetMapping("/{key}/definition")
    public R<PageDefinitionDetailDTO> getByKey(@PathVariable String key,
                                               @RequestParam(defaultValue = "false") boolean preview) {
        if (!preview) {
            pageAccessGuard.assertPageAccess(key);
        }
        PageDefinition pageDef = preview ? pageDefService.getPreviewByKey(key) : pageDefService.getPublishedByKey(key);
        return R.ok(toDetailDTO(pageDef));
    }

    /**
     * 更新页面定义。
     */
    @PutMapping("/{id}")
    public R<PageDefinition> update(@PathVariable String id,
                                    @RequestBody PageDefinitionSaveRequest request) {
        PageDefinition pageDef = pageDefService.update(
                id, request.getName(), request.getKey(), request.getSchema(), request.getFormKey(),
                request.getDataSourceId());
        return R.ok(pageDef);
    }

    /**
     * 删除页面定义（软删除）。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        pageDefService.delete(id);
        return R.ok();
    }

    /**
     * 发布页面定义（不建表，编译视图配置）。
     */
    @PostMapping("/{id}/publish")
    public R<PageDefinition> publish(@PathVariable String id) {
        PageDefinition pageDef = pageDefService.publish(id);
        return R.ok(pageDef);
    }

    private PageDefinitionDTO toDTO(PageDefinition pageDef) {
        PageDefinitionDTO dto = new PageDefinitionDTO();
        dto.setId(pageDef.getId());
        dto.setName(pageDef.getName());
        dto.setKey(pageDef.getKey());
        dto.setType(pageDef.getType());
        dto.setFormKey(pageDef.getFormKey());
        dto.setDataSourceId(pageDef.getDataSourceId());
        dto.setVersion(pageDef.getVersion());
        dto.setStatus(pageDef.getStatus());
        dto.setPublishedVersion(pageDef.getPublishedVersion());
        dto.setCreatedBy(pageDef.getCreatedBy());
        dto.setCreatedAt(pageDef.getCreatedAt());
        dto.setUpdatedAt(pageDef.getUpdatedAt());
        return dto;
    }

    private PageDefinitionDetailDTO toDetailDTO(PageDefinition pageDef) {
        PageDefinitionDetailDTO dto = new PageDefinitionDetailDTO();
        dto.setId(pageDef.getId());
        dto.setName(pageDef.getName());
        dto.setKey(pageDef.getKey());
        dto.setType(pageDef.getType());
        dto.setFormKey(pageDef.getFormKey());
        dto.setDataSourceId(pageDef.getDataSourceId());
        dto.setVersion(pageDef.getVersion());
        dto.setStatus(pageDef.getStatus());
        dto.setPublishedVersion(pageDef.getPublishedVersion());
        dto.setCreatedBy(pageDef.getCreatedBy());
        dto.setCreatedAt(pageDef.getCreatedAt());
        dto.setUpdatedAt(pageDef.getUpdatedAt());
        dto.setSchema(pageDef.getSchema());
        return dto;
    }
}
