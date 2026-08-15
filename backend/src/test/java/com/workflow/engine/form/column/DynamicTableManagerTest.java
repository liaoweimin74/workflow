package com.workflow.engine.form.column;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * DynamicTableManager 单元测试：建表/变更/表信息查询。
 * SQL 内容正确性由 DdlBuilderTest 覆盖，此处验证调用行为。
 */
@ExtendWith(MockitoExtension.class)
class DynamicTableManagerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private DynamicTableManager tableManager;

    private ColumnConfig column(String key, String type, Integer length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setLength(length);
        return c;
    }

    @BeforeEach
    void setUp() {
        // tableExists 默认 false：information_schema.TABLES COUNT 为 0
        lenient().when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        lenient().when(jdbcTemplate.query(anyString(), any(RowMapper.class))).thenReturn(List.of());
    }

    @Test
    void tableExists_false_whenNoTableRow() {
        assertThat(tableManager.tableExists("wf_biz_biz_leave")).isFalse();
        verify(jdbcTemplate).queryForObject(anyString(), eq(Integer.class), any(Object[].class));
    }

    @Test
    void ensureTable_createsTable_whenMissing() {
        ColumnConfig name = column("name", "VARCHAR", 255);

        tableManager.ensureTable("biz_leave", List.of(name));

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).execute(captor.capture());
        assertThat(captor.getValue()).contains("CREATE TABLE IF NOT EXISTS wf_biz_biz_leave");
    }

    @Test
    void ensureTable_noAlter_whenSameStructure() {
        ColumnConfig name = column("name", "VARCHAR", 255);
        ColumnInfo existing = new ColumnInfo("name", "VARCHAR", 255, null, true, false);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(existing));

        tableManager.ensureTable("biz_leave", List.of(name));

        verify(jdbcTemplate, never()).execute(anyString());
    }

    @Test
    void ensureTable_addsColumn_whenNewField() {
        ColumnConfig name = column("name", "VARCHAR", 255);
        ColumnConfig dept = column("dept", "VARCHAR", 64);
        ColumnInfo existingName = new ColumnInfo("name", "VARCHAR", 255, null, true, false);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(existingName));

        tableManager.ensureTable("biz_leave", List.of(name, dept));

        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).execute(captor.capture());
        assertThat(captor.getValue()).contains("ALTER TABLE wf_biz_biz_leave ADD COLUMN dept");
    }

    @Test
    void findTableColumns_mapsInformationSchemaRow() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("COLUMN_NAME")).thenReturn("name");
        when(rs.getString("DATA_TYPE")).thenReturn("varchar");
        when(rs.getLong("CHARACTER_MAXIMUM_LENGTH")).thenReturn(255L);
        when(rs.wasNull()).thenReturn(false);
        when(rs.getString("IS_NULLABLE")).thenReturn("YES");
        when(rs.getString("COLUMN_KEY")).thenReturn("");
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<ColumnInfo> mapper = inv.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });

        List<ColumnInfo> columns = tableManager.findTableColumns("wf_biz_biz_leave");

        assertThat(columns).hasSize(1);
        ColumnInfo info = columns.get(0);
        assertThat(info.getKey()).isEqualTo("name");
        assertThat(info.getColumnType()).isEqualTo("VARCHAR");
        assertThat(info.getLength()).isEqualTo(255);
        assertThat(info.isNullable()).isTrue();
        assertThat(info.isUnique()).isFalse();
    }

    @Test
    void findTableColumns_mapsLongtextToLongtext() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("COLUMN_NAME")).thenReturn("sign");
        when(rs.getString("DATA_TYPE")).thenReturn("longtext");
        when(rs.getLong("CHARACTER_MAXIMUM_LENGTH")).thenReturn(0L);
        when(rs.wasNull()).thenReturn(false);
        when(rs.getString("IS_NULLABLE")).thenReturn("YES");
        when(rs.getString("COLUMN_KEY")).thenReturn("");
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<ColumnInfo> mapper = inv.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });

        List<ColumnInfo> columns = tableManager.findTableColumns("wf_biz_biz_leave");

        assertThat(columns).hasSize(1);
        assertThat(columns.get(0).getColumnType()).isEqualTo("LONGTEXT");
    }

    @Test
    void findTableColumns_mapsMediumtextToText() throws Exception {
        // 历史遗留 mediumtext/tinytext 列仍归一化为 TEXT（白名单内），避免二次发布被判非法列类型
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("COLUMN_NAME")).thenReturn("content");
        when(rs.getString("DATA_TYPE")).thenReturn("mediumtext");
        when(rs.getLong("CHARACTER_MAXIMUM_LENGTH")).thenReturn(0L);
        when(rs.wasNull()).thenReturn(false);
        when(rs.getString("IS_NULLABLE")).thenReturn("YES");
        when(rs.getString("COLUMN_KEY")).thenReturn("");
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<ColumnInfo> mapper = inv.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });

        List<ColumnInfo> columns = tableManager.findTableColumns("wf_biz_biz_leave");

        assertThat(columns).hasSize(1);
        assertThat(columns.get(0).getColumnType()).isEqualTo("TEXT");
    }
}
