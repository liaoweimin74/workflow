package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DbSchemaController 数据库结构只读端点测试：
 * tables（全部基础表名，排除 Flyway 历史表）/ columns（按表名列真实字段）统一 R 包装。
 */
class DbSchemaControllerTest {

    private DynamicTableManager tableManager;
    private DbSchemaController controller;

    @BeforeEach
    void setUp() {
        tableManager = mock(DynamicTableManager.class);
        controller = new DbSchemaController(tableManager);
    }

    @Test
    void tables_returnsAllTablesExcludingFlywayHistory() {
        when(tableManager.listTableNames())
                .thenReturn(List.of("flyway_schema_history", "wf_biz_customer", "wf_biz_order"));

        R<List<String>> result = controller.tables();

        assertThat(result.getData())
                .containsExactly("wf_biz_customer", "wf_biz_order")
                .doesNotContain("flyway_schema_history");
    }

    @Test
    void tables_whenOnlyFlywayTable_returnsEmpty() {
        when(tableManager.listTableNames()).thenReturn(List.of("flyway_schema_history"));

        R<List<String>> result = controller.tables();

        assertThat(result.getData()).isEmpty();
    }

    @Test
    void columns_delegatesAndWraps() {
        ColumnInfo col = new ColumnInfo("name", "VARCHAR", 255, null, true, false);
        when(tableManager.findTableColumns("wf_biz_order")).thenReturn(List.of(col));

        R<List<ColumnInfo>> result = controller.columns("wf_biz_order");

        assertThat(result.getData()).hasSize(1);
        assertThat(result.getData().get(0).getKey()).isEqualTo("name");
        assertThat(result.getData().get(0).getColumnType()).isEqualTo("VARCHAR");
        verify(tableManager).findTableColumns("wf_biz_order");
    }

    @Test
    void columns_unknownTable_returnsEmpty() {
        when(tableManager.findTableColumns("no_such_table")).thenReturn(List.of());

        R<List<ColumnInfo>> result = controller.columns("no_such_table");

        assertThat(result.getData()).isEmpty();
        verify(tableManager).findTableColumns("no_such_table");
    }
}