package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceDTO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.api.dto.DataSourceSaveRequest;
import com.workflow.api.dto.JoinPreviewRequest;
import com.workflow.api.dto.JoinPreviewVO;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.bizdata.BizDataSupport;
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
 * 数据源管理：API/SQL 类型支持用户手动创建/编辑（DRAFT 后可启用）；
 * FORM/WORKFLOW/SYSTEM 由系统自动管理，创建时后端按类型校验 source_key/form_key。
 */
@RestController
@RequestMapping("/api/v1/data-sources")
public class DataSourceController {

    private final DataSourceDefinitionService dataSourceService;
    private final BizDataSupport bizDataSupport;

    public DataSourceController(DataSourceDefinitionService dataSourceService, BizDataSupport bizDataSupport) {
        this.dataSourceService = dataSourceService;
        this.bizDataSupport = bizDataSupport;
    }

    /**
     * 创建数据源（默认 DRAFT）。API/SQL 用户手动创建；FORM/WORKFLOW/SYSTEM 由系统流程创建。
     */
    @PostMapping
    public R<DataSourceDTO> create(@RequestBody DataSourceSaveRequest req) {
        DataSourceDefinition ds = dataSourceService.create(
                req.getName(), req.getType(), req.getFormKey(), req.getSourceKey(), req.getParams());
        return R.ok(toDTO(ds));
    }

    /**
     * 更新数据源（原地更新；null 字段表示不更新）。
     */
    @PutMapping("/{id}")
    public R<DataSourceDTO> update(@PathVariable String id, @RequestBody DataSourceSaveRequest req) {
        DataSourceDefinition ds = dataSourceService.update(
                id, req.getName(), req.getType(), req.getFormKey(), req.getSourceKey(), req.getParams());
        return R.ok(toDTO(ds));
    }

    /**
     * 删除数据源（仅 DRAFT 可删除；已启用须先禁用）。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        dataSourceService.delete(id);
        return R.ok();
    }

    /**
     * 启用数据源（DRAFT/DISABLED → ENABLED；校验按类型必填项齐全 + FORM 须绑定已发布表单）。
     */
    @PostMapping("/{id}/enable")
    public R<DataSourceDTO> enable(@PathVariable String id) {
        return R.ok(toDTO(dataSourceService.enable(id)));
    }

    /**
     * 禁用数据源（ENABLED → DISABLED）。
     */
    @PostMapping("/{id}/disable")
    public R<DataSourceDTO> disable(@PathVariable String id) {
        return R.ok(toDTO(dataSourceService.disable(id)));
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
     * config 模式 JOIN SQL 预览：formKey + joins → 生成的 SELECT SQL（不落库不执行）。
     * 供前端设计器配置 JOIN 后即时预览。
     */
    @PostMapping("/join-preview")
    public R<JoinPreviewVO> previewJoin(@RequestBody JoinPreviewRequest req) {
        return R.ok(bizDataSupport.previewJoinSql(req.formKey(), req.joins()));
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
