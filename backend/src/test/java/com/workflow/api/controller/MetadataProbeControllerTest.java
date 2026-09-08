package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.domain.R;
import com.workflow.engine.form.bizdata.SqlMetadataProbe;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MetadataProbeControllerTest {

    private SqlMetadataProbe probe;
    private HttpLogicExecutor httpExecutor;
    private ObjectMapper objectMapper;
    private MetadataProbeController controller;

    @BeforeEach
    void setUp() {
        probe = mock(SqlMetadataProbe.class);
        httpExecutor = mock(HttpLogicExecutor.class);
        objectMapper = new ObjectMapper();
        controller = new MetadataProbeController(probe, httpExecutor, objectMapper);
    }

    @Test
    void exploreSql_delegatesAndWraps() {
        when(probe.probe("SELECT id FROM t"))
                .thenReturn(List.of(new ColumnMeta("id", "id", "VARCHAR", 64, null, false)));

        R<List<ColumnMeta>> result = controller.exploreSql(Map.of("sql", "SELECT id FROM t"));

        assertThat(result.getData()).hasSize(1);
        assertThat(result.getData().get(0).key()).isEqualTo("id");
        assertThat(result.getData().get(0).columnType()).isEqualTo("VARCHAR");
    }

    @Test
    void exploreApi_infersColumnsFromSampleJsonArray() {
        String rawJson = """
                {"code":200,"data":{"list":[{"id":"1","name":"张三","active":true,"extra":null}]}}
                """;
        when(httpExecutor.execute(anyString(), anyString(), anyMap(), anyList(), anyList(),
                anyMap(), anyInt(), anyInt(), anyInt())).thenReturn(rawJson);

        R<List<ColumnMeta>> result = controller.exploreApi(Map.of(
                "action", "/v1/products",
                "method", "GET",
                "data", Map.of("dept", "IT")));

        assertThat(result.getData()).hasSize(4);
        Map<String, ColumnMeta> byKey = new java.util.HashMap<>();
        for (ColumnMeta c : result.getData()) {
            byKey.put(c.key(), c);
        }
        assertThat(byKey.get("id").columnType()).isEqualTo("VARCHAR");
        assertThat(byKey.get("name").columnType()).isEqualTo("VARCHAR");
        assertThat(byKey.get("active").columnType()).isEqualTo("TINYINT");
        assertThat(byKey.get("extra").columnType()).isEqualTo("VARCHAR");
    }

    @Test
    void exploreApi_missingAction_rejected() {
        org.junit.jupiter.api.Assertions.assertThrows(
                com.workflow.common.exception.BusinessException.class,
                () -> controller.exploreApi(Map.of()));
    }
}
