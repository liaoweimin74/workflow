package com.workflow.engine.form.column;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ColumnConfig 子表结构（subColumns/subMode）单元测试。
 */
class ColumnConfigTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void subColumnsRoundTrip_withJackson() throws Exception {
        ColumnConfig sub = new ColumnConfig();
        sub.setKey("amount");
        sub.setColumnType("DECIMAL");
        sub.setLength(18);
        sub.setScale(2);

        ColumnConfig parent = new ColumnConfig();
        parent.setKey("items");
        parent.setSubColumns(List.of(sub));
        parent.setSubMode("dedicated");

        String json = objectMapper.writeValueAsString(parent);
        ColumnConfig parsed = objectMapper.readValue(json, ColumnConfig.class);

        assertThat(parsed.getSubColumns()).hasSize(1);
        assertThat(parsed.getSubColumns().get(0).getKey()).isEqualTo("amount");
        assertThat(parsed.getSubColumns().get(0).getColumnType()).isEqualTo("DECIMAL");
        assertThat(parsed.getSubMode()).isEqualTo("dedicated");
    }

    @Test
    void legacyConfig_parsesWithoutSubColumns() throws Exception {
        ColumnConfig parsed = objectMapper.readValue(
                "{\"key\":\"name\",\"columnType\":\"VARCHAR\",\"length\":255}", ColumnConfig.class);

        assertThat(parsed.getKey()).isEqualTo("name");
        assertThat(parsed.getSubColumns()).isNull();
        assertThat(parsed.getSubMode()).isNull();
    }

    @Test
    void embeddedIsDefaultWhenSubModeAbsent() throws Exception {
        ColumnConfig parsed = objectMapper.readValue(
                "{\"key\":\"items\",\"subColumns\":[]}", ColumnConfig.class);

        assertThat(parsed.getSubColumns()).isEmpty();
        assertThat(parsed.getSubMode()).isNull();
    }
}
