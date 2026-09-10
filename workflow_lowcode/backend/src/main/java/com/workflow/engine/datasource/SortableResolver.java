package com.workflow.engine.datasource;

import com.workflow.engine.form.column.ColumnConfig;

import java.util.List;
import java.util.Set;

/**
 * 字段排序能力推导：按列类型判定该列是否可参与服务器端排序。
 * 规则：JSON/TEXT/colorPicker/含子表 → 不可排；数值/日期/短文本/VARCHAR → 可排。
 * 数据源 metadata 构造时调用 {@link #resolve(List)} 填充未标注列的 sortable。
 */
public final class SortableResolver {

    private static final Set<String> UNSORTABLE_TYPES = Set.of("JSON", "TEXT");
    private static final Set<String> UNSORTABLE_COMPONENTS = Set.of("colorPicker");

    private SortableResolver() {}

    /** 就地填充未标注列的 sortable（已显式标注的列不覆盖）。 */
    public static void resolve(List<ColumnConfig> columns) {
        if (columns == null) {
            return;
        }
        for (ColumnConfig c : columns) {
            if (c.getSortable() == null) {
                c.setSortable(isSortable(c));
            }
        }
    }

    public static boolean isSortable(ColumnConfig c) {
        if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
            return false;
        }
        String type = c.getColumnType();
        if (type != null && UNSORTABLE_TYPES.contains(type.toUpperCase())) {
            return false;
        }
        String comp = c.getComponentType();
        return comp == null || !UNSORTABLE_COMPONENTS.contains(comp);
    }
}
