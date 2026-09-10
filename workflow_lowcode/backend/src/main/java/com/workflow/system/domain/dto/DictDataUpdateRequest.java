package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record DictDataUpdateRequest(
        @Size(max = 50) String dictCode,
        @Size(max = 100) String label,
        @Size(max = 100) String value,
        Integer sortOrder,
        Integer status) {
}