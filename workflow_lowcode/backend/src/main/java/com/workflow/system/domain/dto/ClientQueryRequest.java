package com.workflow.system.domain.dto;

/** 客户端分页查询（keyword 匹配 name/code；status 空=全部）。 */
public record ClientQueryRequest(
        String keyword,
        Integer status,
        Integer page,
        Integer size) {
}
