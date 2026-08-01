package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DictTypeCreateRequest(
        @NotBlank @Size(max = 100) String dictName,
        @NotBlank @Size(max = 50) String dictCode,
        String remark,
        Integer status) {
}