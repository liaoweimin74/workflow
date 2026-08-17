package com.workflow.api.controller;

import com.workflow.api.dto.PageDefinitionDTO;
import com.workflow.api.dto.PageDefinitionDetailDTO;
import com.workflow.api.dto.PageDefinitionSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
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

    private final PageDefinitionService pageDefService;

    public PageDefinitionController(PageDefinitionService pageDefService) {
        this.pageDefService = pageDefService;
    }

    /**
     * 创建页面定义。
     */
    @PostMapping
    public R<PageDefinition> create(@RequestBody PageDefinitionSaveRequest request) {
        PageDefinition pageDef = pageDefService.create(
                request.getName(), request.getKey(), request.getType(), request.getFormKey());
        return R.ok(pageDef);
    }

    /**
     * 分页查询页面定义列表。
     */
    @GetMapping
    public R<PageResponse<PageDefinitionDTO>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String type) {

        PageRequest pageable = PageRequest.of(page, size);
        Page<PageDefinition> result = pageDefService.list(status, name, type, pageable);

        List<PageDefinitionDTO> dtos = result.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());

        PageResponse<PageDefinitionDTO> response = new PageResponse<>(
                dtos, result.getNumber(), result.getSize(), result.getTotalElements());
        return R.ok(response);
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
     */
    @GetMapping("/{key}/definition")
    public R<PageDefinitionDetailDTO> getByKey(@PathVariable String key,
                                               @RequestParam(defaultValue = "false") boolean preview) {
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
                id, request.getName(), request.getKey(), request.getSchema(), request.getFormKey());
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