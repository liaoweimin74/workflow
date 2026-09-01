package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceDTO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 全局数据源管理 Controller。
 * 供前端数据源管理页（Task 10A）与页面设计器（Task 8/10A）调用。
 * 响应封装统一为 { code, data, message }（R<T>）。
 * 
 * 注意：数据源由系统自动管理，用户只能查看，不能新增、编辑、删除。
 */
@RestController
@RequestMapping("/api/v1/data-sources")
public class DataSourceController {

    private final DataSourceDefinitionService dataSourceService;

    public DataSourceController(DataSourceDefinitionService dataSourceService) {
        this.dataSourceService = dataSourceService;
    }

    /**
     * 查询数据源列表（分页 + type/status 过滤）。
     */
    @GetMapping
    public R<PageResponse<DataSourceDTO>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status) {

        int normalizedPage = Math.max(page, 1);
        Page<DataSourceDefinition> result = dataSourceService.list(type, status, PageRequest.of(normalizedPage - 1, size));
        List<DataSourceDTO> dtos = result.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        PageResponse<DataSourceDTO> response = new PageResponse<>(
                dtos, result.getNumber() + 1, result.getSize(), result.getTotalElements());
        return R.ok(response);
    }

    /**
     * 仅已启用数据源（页面设计器数据源下拉）。
     */
    @GetMapping("/enabled")
    public R<List<DataSourceDTO>> enabled() {
        List<DataSourceDTO> dtos = dataSourceService.getEnabled().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        return R.ok(dtos);
    }

    /**
     * 获取数据源详情。
     */
    @GetMapping("/{id}")
    public R<DataSourceDTO> getById(@PathVariable String id) {
        return R.ok(toDTO(dataSourceService.getById(id)));
    }

    // ==================== 统一数据访问端点（经 DataSourceAdapter SPI） ====================

    /**
     * 数据源元数据：列定义 + 可写标记（设计器切换数据源刷新列用）。
     */
    @GetMapping("/{id}/metadata")
    public R<DataSourceMetadata> metadata(@PathVariable String id) {
        return R.ok(dataSourceService.metadata(id));
    }

    /**
     * 数据源列表分页查询。
     */
    @GetMapping("/{id}/data")
    public R<BizDataPageVO> queryData(@PathVariable String id, BizDataQueryRequest req) {
        return R.ok(dataSourceService.queryData(id, req));
    }

    /**
     * 数据源单条查询。
     */
    @GetMapping("/{id}/data/{rowId}")
    public R<BizDataVO> getData(@PathVariable String id, @PathVariable String rowId) {
        return R.ok(dataSourceService.getData(id, rowId));
    }

    /**
     * 数据源新增（只读数据源 → 400 不支持）。
     */
    @PostMapping("/{id}/data")
    public R<String> createData(@PathVariable String id, @RequestBody Map<String, Object> data) {
        return R.ok(dataSourceService.createData(id, data));
    }

    /**
     * 数据源修改（version 乐观锁可空）。
     */
    @PutMapping("/{id}/data/{rowId}")
    public R<Void> updateData(@PathVariable String id, @PathVariable String rowId,
                              @RequestParam(required = false) Integer version,
                              @RequestBody Map<String, Object> data) {
        dataSourceService.updateData(id, rowId, data, version);
        return R.ok();
    }

    /**
     * 数据源删除。
     */
    @DeleteMapping("/{id}/data/{rowId}")
    public R<Void> deleteData(@PathVariable String id, @PathVariable String rowId) {
        dataSourceService.deleteData(id, rowId);
        return R.ok();
    }

    // ==================== DTO 转换 ====================

    private DataSourceDTO toDTO(DataSourceDefinition ds) {
        DataSourceDTO dto = new DataSourceDTO();
        dto.setId(ds.getId());
        dto.setTenantId(ds.getTenantId());
        dto.setName(ds.getName());
        dto.setType(ds.getType());
        dto.setFormKey(ds.getFormKey());
        dto.setSourceKey(ds.getSourceKey());
        dto.setParams(ds.getParams());
        dto.setStatus(ds.getStatus());
        dto.setCreatedBy(ds.getCreatedBy());
        dto.setCreatedAt(ds.getCreatedAt());
        dto.setUpdatedAt(ds.getUpdatedAt());
        return dto;
    }
}
