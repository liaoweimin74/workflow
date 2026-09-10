package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

public record DictDataVO(
        Long id,
        String dictCode,
        String label,
        String value,
        Integer sortOrder,
        Integer status,
        LocalDateTime createdAt) {
}