package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record DictTypeUpdateRequest(
        @Size(max = 100) String dictName,
        String remark,
        Integer status) {
}