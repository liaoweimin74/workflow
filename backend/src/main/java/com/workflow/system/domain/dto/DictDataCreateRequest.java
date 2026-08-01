package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DictDataCreateRequest(
        @NotBlank String dictCode,
        @NotBlank @Size(max = 100) String label,
        @NotBlank @Size(max = 100) String value,
        Integer sortOrder,
        Integer status) {
}