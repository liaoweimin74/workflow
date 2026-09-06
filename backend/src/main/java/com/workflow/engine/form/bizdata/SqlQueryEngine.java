package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 统一 SQL 执行引擎。
 * <p>
 * config（JOIN）与 sql（子查询）两种 queryMode 的共享执行层：
 * <ul>
 *   <li>{@link #execPage}      执行 COUNT + SELECT 并组装 BizDataPageVO；</li>
 *   <li>{@link #wrapSubquery}  将（管理员）SQL 包裹为分页子查询，派生行查询与 COUNT 查询。</li>
 * </ul>
 * 单表路径（BizDataSupport.queryGeneric）亦复用 execPage，保证分页/总数语义一致。
 */
public class SqlQueryEngine {

    private final JdbcTemplate jdbcTemplate;

    public SqlQueryEngine(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 执行分页查询：先 COUNT 得出总数，再 SELECT 取当前页，按 rowMapper 映射行后组装分页结果。
     *
     * @param count    COUNT 查询（与 select 同筛选条件）
     * @param select   行查询（已含 ORDER BY / LIMIT / OFFSET）
     * @param page     页码（1 起）
     * @param size     每页大小（&lt;= 0 表示不分页）
     */
    public BizDataPageVO execPage(int page, int size,
                                  BizDataQueryBuilder.SqlAndParams count,
                                  BizDataQueryBuilder.SqlAndParams select,
                                  Function<Map<String, Object>, BizDataVO> rowMapper) {
        Long total = jdbcTemplate.queryForObject(count.sql(), Long.class, count.params().toArray());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(select.sql(), select.params().toArray());
        List<BizDataVO> records = rows.stream().map(rowMapper).toList();
        return new BizDataPageVO(records, total == null ? 0 : total, page, size);
    }

    /** 行查询与 COUNT 查询对 */
    public record WrappedQuery(BizDataQueryBuilder.SqlAndParams select, BizDataQueryBuilder.SqlAndParams count) {}

    /**
     * 将内层 SQL（如管理员 SQL 模板）包裹为分页子查询：
     * <pre>
     *   SELECT * FROM (&lt;inner&gt;) _qs {filterFragment} {orderByFragment} [LIMIT ? OFFSET ?]
     *   SELECT COUNT(*) FROM (&lt;inner&gt;) _qs {filterFragment}
     * </pre>
     * 参数顺序：内层参数 → 筛选参数 → 分页参数（仅 select）。size &lt;= 0 表示不分页取全部。
     *
     * @param inner          内层 SQL 及其参数
     * @param filterFragment 筛选片段（如 " WHERE x &gt; ?"，含前导空格；由调用方按白名单生成）
     * @param filterParams   筛选片段对应参数（顺序与 ? 一致）
     * @param orderByFragment 排序片段（如 " ORDER BY total DESC"，含前导空格）
     */
    public static WrappedQuery wrapSubquery(BizDataQueryBuilder.SqlAndParams inner,
                                            String filterFragment, List<Object> filterParams,
                                            String orderByFragment, int page, int size) {
        List<Object> baseParams = new ArrayList<>(inner.params());
        baseParams.addAll(filterParams);

        StringBuilder rowSql = new StringBuilder("SELECT * FROM (").append(inner.sql())
                .append(") _qs").append(filterFragment).append(orderByFragment);
        List<Object> rowParams = new ArrayList<>(baseParams);
        if (size > 0) {
            rowSql.append(" LIMIT ? OFFSET ?");
            rowParams.add(size);
            rowParams.add((Math.max(page, 1) - 1) * size);
        }

        String countSql = "SELECT COUNT(*) FROM (" + inner.sql() + ") _qs" + filterFragment;
        return new WrappedQuery(
                new BizDataQueryBuilder.SqlAndParams(rowSql.toString(), rowParams),
                new BizDataQueryBuilder.SqlAndParams(countSql, baseParams));
    }
}