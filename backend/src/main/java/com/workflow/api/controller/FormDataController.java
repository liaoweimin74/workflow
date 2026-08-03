package com.workflow.api.controller;

import com.workflow.api.dto.FormDataDTO;
import com.workflow.api.dto.FormDataSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.engine.form.FormDataService;
import com.workflow.engine.form.entity.FormData;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 表单实例数据 Controller。
 * 管理流程实例关联的表单数据的保存和查询。
 */
@RestController
@RequestMapping("/api/v1/form-data")
public class FormDataController {

    private final FormDataService formDataService;

    public FormDataController(FormDataService formDataService) {
        this.formDataService = formDataService;
    }

    /**
     * 保存表单数据。
     */
    @PostMapping
    public R<FormData> save(@RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.save(
                request.getFormDefId(),
                request.getProcessInstanceId(),
                request.getTaskId(),
                request.getDataJson()
        );
        return R.ok(formData);
    }

    /**
     * 按流程实例和表单定义查询表单数据。
     */
    @GetMapping
    public R<FormDataDTO> getByProcessInstance(
            @RequestParam String processInstanceId,
            @RequestParam String formDefId) {

        Optional<FormData> formData = formDataService.findByProcessInstance(processInstanceId, formDefId);
        return R.ok(formData.map(this::toDTO).orElse(null));
    }

    /**
     * 获取单条表单数据。
     */
    @GetMapping("/{id}")
    public R<FormDataDTO> getById(@PathVariable String id) {
        FormData formData = formDataService.getById(id);
        return R.ok(toDTO(formData));
    }

    /**
     * 更新表单数据。
     */
    @PutMapping("/{id}")
    public R<FormData> update(@PathVariable String id,
                              @RequestBody FormDataSaveRequest request) {
        FormData formData = formDataService.update(id, request.getDataJson());
        return R.ok(formData);
    }

    /**
     * 按流程实例查询所有表单数据。
     */
    @GetMapping("/process-instance/{processInstanceId}")
    public R<List<FormDataDTO>> getByProcessInstance(@PathVariable String processInstanceId) {
        List<FormData> list = formDataService.findByProcessInstance(processInstanceId);
        List<FormDataDTO> dtos = list.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        return R.ok(dtos);
    }

    private FormDataDTO toDTO(FormData formData) {
        FormDataDTO dto = new FormDataDTO();
        dto.setId(formData.getId());
        dto.setFormDefId(formData.getFormDefId());
        dto.setFormVersion(formData.getFormVersion());
        dto.setProcessInstanceId(formData.getProcessInstanceId());
        dto.setTaskId(formData.getTaskId());
        dto.setDataJson(formData.getDataJson());
        dto.setCreatedBy(formData.getCreatedBy());
        dto.setCreatedAt(formData.getCreatedAt());
        dto.setUpdatedAt(formData.getUpdatedAt());
        return dto;
    }
}
