package com.workflow.api.dto;

/**
 * 探测结果列元数据（SQL 执行 / API 样例推断统一返回）。
 */
public record ColumnMeta(String key, String label, String columnType,
                         Integer length, Integer scale, boolean nullable) {}
