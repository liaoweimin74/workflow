package com.workflow.api.controller;

import com.workflow.api.dto.FormDefinitionDetailDTO;
import com.workflow.api.dto.FormDefinitionDTO;
import com.workflow.api.dto.FormDefinitionSaveRequest;
import com.workflow.api.dto.FormVersionDTO;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.entity.FormDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 表单定义 Controller。
 * 管理表单定义的 CRUD、发布、版本管理。
 */
@RestController
@RequestMapping("/api/v1/form-definitions")
public class FormDefinitionController {

    private final FormDefinitionService formDefService;

    public FormDefinitionController(FormDefinitionService formDefService) {
        this.formDefService = formDefService;
    }

    /**
     * 创建表单定义。
     */
    @PostMapping
    public R<FormDefinition> create(@RequestParam String name,
                                    @RequestParam String key) {
        FormDefinition formDef = formDefService.create(name, key);
        return R.ok(formDef);
    }

    /**
     * 查询表单定义列表（分页）。
     */
    @GetMapping
    public R<PageResponse<FormDefinitionDTO>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String name) {

        PageRequest pageable = PageRequest.of(page, size);
        Page<FormDefinition> result = formDefService.list(status, name, pageable);

        List<FormDefinitionDTO> dtos = result.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());

        PageResponse<FormDefinitionDTO> response = new PageResponse<>(
                dtos,
                result.getNumber(),
                result.getSize(),
                result.getTotalElements()
        );
        return R.ok(response);
    }

    /**
     * 获取表单定义详情（含 schema）。
     */
    @GetMapping("/{id}")
    public R<FormDefinitionDetailDTO> getById(@PathVariable String id) {
        FormDefinition formDef = formDefService.getById(id);
        return R.ok(toDetailDTO(formDef));
    }

    /**
     * 更新表单定义 schema（创建新版本）。
     */
    @PutMapping("/{id}")
    public R<FormDefinition> update(@PathVariable String id,
                                    @RequestBody FormDefinitionSaveRequest request) {
        FormDefinition formDef = formDefService.update(id, request.getSchema());
        return R.ok(formDef);
    }

    /**
     * 删除表单定义（软删除）。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        formDefService.delete(id);
        return R.ok();
    }

    /**
     * 发布表单定义。
     */
    @PostMapping("/{id}/publish")
    public R<FormDefinition> publish(@PathVariable String id) {
        FormDefinition formDef = formDefService.publish(id);
        return R.ok(formDef);
    }

    /**
     * 获取表单定义的所有版本列表。
     */
    @GetMapping("/{id}/versions")
    public R<List<FormVersionDTO>> getVersions(@PathVariable String id) {
        List<FormDefinition> versions = formDefService.getVersions(id);
        List<FormVersionDTO> dtos = versions.stream()
                .map(v -> new FormVersionDTO(v.getId(), v.getVersion(), v.getStatus(), v.getCreatedBy(), v.getCreatedAt()))
                .collect(Collectors.toList());
        return R.ok(dtos);
    }

    /**
     * 获取特定版本的表单定义。
     */
    @GetMapping("/{id}/versions/{version}")
    public R<FormDefinitionDetailDTO> getByVersion(@PathVariable String id,
                                                   @PathVariable Integer version) {
        FormDefinition formDef = formDefService.getByVersion(id, version);
        return R.ok(toDetailDTO(formDef));
    }

    private FormDefinitionDTO toDTO(FormDefinition formDef) {
        FormDefinitionDTO dto = new FormDefinitionDTO();
        dto.setId(formDef.getId());
        dto.setName(formDef.getName());
        dto.setKey(formDef.getKey());
        dto.setVersion(formDef.getVersion());
        dto.setStatus(formDef.getStatus());
        dto.setPublishedVersion(formDef.getPublishedVersion());
        dto.setCreatedBy(formDef.getCreatedBy());
        dto.setCreatedAt(formDef.getCreatedAt());
        dto.setUpdatedAt(formDef.getUpdatedAt());
        return dto;
    }

    private FormDefinitionDetailDTO toDetailDTO(FormDefinition formDef) {
        FormDefinitionDetailDTO dto = new FormDefinitionDetailDTO();
        dto.setId(formDef.getId());
        dto.setName(formDef.getName());
        dto.setKey(formDef.getKey());
        dto.setVersion(formDef.getVersion());
        dto.setStatus(formDef.getStatus());
        dto.setPublishedVersion(formDef.getPublishedVersion());
        dto.setCreatedBy(formDef.getCreatedBy());
        dto.setCreatedAt(formDef.getCreatedAt());
        dto.setUpdatedAt(formDef.getUpdatedAt());
        dto.setSchema(formDef.getSchema());
        return dto;
    }
}
