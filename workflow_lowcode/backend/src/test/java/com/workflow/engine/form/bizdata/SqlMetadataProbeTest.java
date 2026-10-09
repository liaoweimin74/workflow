package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SqlMetadataProbeTest {

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final SqlMetadataProbe probe = new SqlMetadataProbe(jdbcTemplate);

    /** 显式泛型 any：避免 JdbcTemplate.query(psc, RowCallbackHandler)/(psc, RowMapper) 重载解析歧义 */
    @SuppressWarnings("unchecked")
    private static org.springframework.jdbc.core.ResultSetExtractor<List<ColumnMeta>> anyExtractor() {
        return any();
    }

    @Test
    void probe_mapsResultSetMetaDataToColumns() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData md = mock(ResultSetMetaData.class);
        when(md.getColumnCount()).thenReturn(2);
        when(md.getColumnLabel(1)).thenReturn("order_no");
        when(md.getColumnLabel(2)).thenReturn("amount");
        when(md.getColumnTypeName(1)).thenReturn("VARCHAR");
        when(md.getColumnTypeName(2)).thenReturn("DECIMAL");
        when(md.getPrecision(1)).thenReturn(64);
        when(md.getPrecision(2)).thenReturn(18);
        when(md.getScale(1)).thenReturn(0);
        when(md.getScale(2)).thenReturn(2);
        when(md.isNullable(1)).thenReturn(ResultSetMetaData.columnNullable);
        when(md.isNullable(2)).thenReturn(ResultSetMetaData.columnNoNulls);
        when(rs.getMetaData()).thenReturn(md);

        when(jdbcTemplate.query(any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                anyExtractor()))
                .thenAnswer(inv -> {
                    org.springframework.jdbc.core.ResultSetExtractor<?> ext = inv.getArgument(1);
                    return ext.extractData(rs);
                });

        List<ColumnMeta> cols = probe.probe("SELECT order_no, amount FROM wf_biz_order WHERE tenant_id = :tenantId");

        assertThat(cols).hasSize(2);
        assertThat(cols.get(0).key()).isEqualTo("order_no");
        assertThat(cols.get(0).columnType()).isEqualTo("VARCHAR");
        assertThat(cols.get(0).length()).isEqualTo(64);
        assertThat(cols.get(1).columnType()).isEqualTo("DECIMAL");
        assertThat(cols.get(1).length()).isEqualTo(18);
        assertThat(cols.get(1).scale()).isEqualTo(2);
        assertThat(cols.get(1).nullable()).isFalse();
    }

    @Test
    void probe_nonSelectSql_rejected() {
        assertThatThrownBy(() -> probe.probe("DELETE FROM wf_biz_order"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void probe_placeholderBoundToNull() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData md = mock(ResultSetMetaData.class);
        when(md.getColumnCount()).thenReturn(1);
        when(md.getColumnLabel(1)).thenReturn("id");
        when(md.getColumnTypeName(1)).thenReturn("VARCHAR");
        when(md.getPrecision(1)).thenReturn(64);
        when(md.getScale(1)).thenReturn(0);
        when(rs.getMetaData()).thenReturn(md);

        when(jdbcTemplate.query(any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                anyExtractor()))
                .thenAnswer(inv -> ((org.springframework.jdbc.core.ResultSetExtractor<?>) inv.getArgument(1)).extractData(rs));

        probe.probe("SELECT id FROM wf_biz_order WHERE created_at > :startTime");

        // 捕获传给 connection.prepareStatement 的最终 SQL：占位符已替换成 NULL，不再残留 :startTime，且已包 LIMIT 1
        Connection conn = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(conn.prepareStatement(any(String.class))).thenReturn(ps);
        org.mockito.ArgumentCaptor<org.springframework.jdbc.core.PreparedStatementCreator> captor =
                org.mockito.ArgumentCaptor.forClass(org.springframework.jdbc.core.PreparedStatementCreator.class);
        verify(jdbcTemplate).query(captor.capture(), anyExtractor());
        captor.getValue().createPreparedStatement(conn);
        verify(conn).prepareStatement(argThat(sql ->
                !sql.contains(":startTime") && sql.contains("LIMIT 1")));
    }
}
