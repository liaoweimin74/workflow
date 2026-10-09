package com.workflow.engine.datasource;

import com.workflow.engine.form.column.ColumnConfig;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SortableResolverTest {

    private ColumnConfig col(String key, String type, String component) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setColumnType(type);
        c.setComponentType(component);
        return c;
    }

    @Test
    void jsonTextAndColorPickerAreNotSortable() {
        assertFalse(SortableResolver.isSortable(col("a", "JSON", null)));
        assertFalse(SortableResolver.isSortable(col("b", "TEXT", null)));
        assertFalse(SortableResolver.isSortable(col("c", "VARCHAR", "colorPicker")));
    }

    @Test
    void subTableColumnIsNotSortable() {
        ColumnConfig c = col("sub", "JSON", null);
        c.setSubColumns(List.of(col("x", "VARCHAR", null)));
        assertFalse(SortableResolver.isSortable(c));
    }

    @Test
    void numericDateAndShortTextAreSortable() {
        assertTrue(SortableResolver.isSortable(col("n", "INTEGER", null)));
        assertTrue(SortableResolver.isSortable(col("d", "DATETIME", null)));
        assertTrue(SortableResolver.isSortable(col("s", "VARCHAR", null)));
    }

    @Test
    void resolveFillsOnlyUnsetColumns() {
        ColumnConfig set = col("x", "VARCHAR", null);
        set.setSortable(false);
        List<ColumnConfig> list = List.of(set, col("y", "INTEGER", null));
        SortableResolver.resolve(list);
        // 已显式标注不覆盖
        assertFalse(list.get(0).getSortable());
        // 未标注按类型推导
        assertTrue(list.get(1).getSortable());
    }
}
