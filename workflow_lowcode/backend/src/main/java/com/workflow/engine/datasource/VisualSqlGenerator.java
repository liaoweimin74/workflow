package com.workflow.engine.datasource;

import com.workflow.api.dto.VisualQueryRequest;
import com.workflow.api.dto.VisualQueryRequest.*;

import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 可视化查询配置→SQL 生成器。
 * <p>
 * 将 {@link VisualQueryRequest}（前端可视化构建器的结构化输出）转换为可执行的 SQL 字符串，
 * 供 {@code SqlTemplateEngine.wrap()} 包裹分页/筛选/排序。
 * <p>
 * 生成的 SQL 包含 {@code :tenantId} 占位符（由执行引擎绑定租户），
 * WHERE 条件使用 {@code ?} 参数化占位符。
 */
public final class VisualSqlGenerator {

    /** formKey 合法格式：字母开头，字母数字下划线，1-64 字符 */
    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    private VisualSqlGenerator() {}

    /**
     * 将可视化配置转换为 SQL 字符串。
     *
     * @param req 可视化查询配置（mainTable/joins.targetTable 应为物理表名或已映射的 formKey）
     * @return SQL 字符串（含 :tenantId 占位符和 ? 参数化占位符）
     */
    public static String generate(VisualQueryRequest req) {
        StringBuilder sql = new StringBuilder("SELECT ");

        // 1. 选择列
        sql.append(String.join(", ", req.selectColumns()));

        // 2. FROM + JOIN（表名由调用方保证为物理表名或 formKey）
        sql.append(" FROM ").append(req.mainTable())
           .append(" ").append(req.mainAlias());

        if (req.joins() != null) {
            for (JoinClause j : req.joins()) {
                sql.append(" ").append(safeJoinType(j.joinType())).append(" ")
                   .append(j.targetTable()).append(" ").append(j.alias())
                   .append(" ON ").append(j.on());
            }
        }

        // 3. WHERE（+ tenant_id）
        sql.append(" WHERE ").append(req.mainAlias()).append(".tenant_id = :tenantId");

        if (req.where() != null) {
            for (WhereCondition w : req.where()) {
                sql.append(" AND ").append(w.column()).append(" ").append(w.op()).append(" ?");
            }
        }

        // 4. ORDER BY
        if (req.orderBy() != null && !req.orderBy().isEmpty()) {
            sql.append(" ORDER BY ");
            sql.append(req.orderBy().stream()
                .map(o -> o.column() + " " + o.order())
                .collect(Collectors.joining(", ")));
        }

        return sql.toString();
    }

    /** 安全取 JOIN 类型，缺省 LEFT */
    private static String safeJoinType(String joinType) {
        if (joinType == null || joinType.isBlank()) {
            return "LEFT JOIN";
        }
        String upper = joinType.trim().toUpperCase();
        if (upper.endsWith("JOIN")) {
            return joinType.trim();
        }
        return joinType.trim() + " JOIN";
    }
}
