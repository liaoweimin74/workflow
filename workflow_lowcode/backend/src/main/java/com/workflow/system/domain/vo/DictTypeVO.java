package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

public record DictTypeVO(
        Long id,
        String dictName,
        String dictCode,
        String remark,
        Integer status,
        LocalDateTime createdAt) {
}