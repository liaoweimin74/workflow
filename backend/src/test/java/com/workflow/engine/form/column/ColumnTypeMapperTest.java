package com.workflow.engine.form.column;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ColumnTypeMapper 单元测试：组件类型 → 列类型映射。
 */
class ColumnTypeMapperTest {

    @Test
    void mapInputText_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("input", Map.of());
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapTextarea_returnsText() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("textarea", Map.of());
        assertThat(c.getColumnType()).isEqualTo("TEXT");
    }

    @Test
    void mapDate_returnsDate() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("DatePicker", Map.of("type", "date"));
        assertThat(c.getColumnType()).isEqualTo("DATE");
    }

    @Test
    void mapDatetime_returnsDatetime() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("DatePicker", Map.of("type", "datetime"));
        assertThat(c.getColumnType()).isEqualTo("DATETIME");
    }

    @Test
    void mapNumberInteger_returnsInt() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("inputNumber", Map.of());
        assertThat(c.getColumnType()).isEqualTo("INT");
    }

    @Test
    void mapNumberDecimal_returnsDecimal() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("inputNumber", Map.of("precision", 2));
        assertThat(c.getColumnType()).isEqualTo("DECIMAL");
        assertThat(c.getScale()).isEqualTo(2);
    }

    @Test
    void mapSelect_returnsVarchar255() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("select", Map.of());
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(255);
    }

    @Test
    void mapCheckbox_returnsVarchar1024() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("checkbox", Map.of());
        assertThat(c.getColumnType()).isEqualTo("VARCHAR");
        assertThat(c.getLength()).isEqualTo(1024);
    }

    @Test
    void mapSwitch_returnsTinyint() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("switch", Map.of());
        assertThat(c.getColumnType()).isEqualTo("TINYINT");
    }

    @Test
    void mapUpload_returnsJson() {
        ColumnConfig c = ColumnTypeMapper.mapComponentToColumn("Upload", Map.of());
        assertThat(c.getColumnType()).isEqualTo("JSON");
    }

    @Test
    void mapUnsupported_returnsNull() {
        assertThat(ColumnTypeMapper.mapComponentToColumn("subTable", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("nestedForm", Map.of())).isNull();
        assertThat(ColumnTypeMapper.mapComponentToColumn("userPicker", Map.of())).isNull();
    }

    @Test
    void crossTypeChange_isRejected() {
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "TEXT")).isFalse();
        assertThat(ColumnTypeMapper.isCrossTypeChange("VARCHAR", "VARCHAR")).isFalse();
        assertThat(ColumnTypeMapper.isCrossTypeChange("INT", "DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isCrossTypeChange("DATE", "DATETIME")).isFalse();
    }

    @Test
    void allowedColumnType_validation() {
        assertThat(ColumnTypeMapper.isAllowedColumnType("VARCHAR")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("TEXT")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("DECIMAL")).isTrue();
        assertThat(ColumnTypeMapper.isAllowedColumnType("BLOB")).isFalse();
        assertThat(ColumnTypeMapper.isAllowedColumnType(null)).isFalse();
    }
}
