package com.workflow.api.dto;

import java.util.List;

/**
 * 可视化查询配置 DTO。
 * 前端可视化构建器的结构化输出，由 {@code VisualSqlGenerator} 转换为 SQL。
 */
public record VisualQueryRequest(
    String mainTable,
    String mainAlias,
    List<JoinClause> joins,
    List<String> selectColumns,
    List<WhereCondition> where,
    List<OrderClause> orderBy,
    List<String> params
) {
    public record JoinClause(
        String alias,
        String targetTable,
        String joinType,
        String on,
        List<String> columns
    ) {}

    public record WhereCondition(
        String column,
        String op,
        Object value
    ) {}

    public record OrderClause(
        String column,
        String order
    ) {}
}
