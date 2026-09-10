package com.workflow.system.domain.dto;

public record DictTypeQueryRequest(
        String dictName,
        String dictCode,
        Integer status,
        Integer page,
        Integer size) {
}