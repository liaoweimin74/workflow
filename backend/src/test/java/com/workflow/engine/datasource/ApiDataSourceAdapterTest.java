package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * API 数据源适配器测试：
 * 多操作 params 解析（list/get/create/update/delete + columns）；
 * 兼容旧格式（顶层 action 归入 list）；parse/totalParse 响应抽取；
 * 未配置写操作 → 抛"未配置 X 操作"；只写元数据 writable 标记。
 */
@ExtendWith(MockitoExtension.class)
class ApiDataSourceAdapterTest {

    @Mock
    private HttpLogicExecutor httpExecutor;

    private ApiDataSourceAdapter adapter;
    private ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        adapter = new ApiDataSourceAdapter(httpExecutor, objectMapper);
    }

    private DataSourceDefinition ds(String paramsJson) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("api-1");
        ds.setName("外部库存");
        ds.setType("API");
        ds.setSourceKey("external-stock");
        ds.setParams(paramsJson);
        ds.setStatus("ENABLED");
        return ds;
    }

    private static final String MULTI_OP_PARAMS = "{"
            + "\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},"
            + "\"get\":{\"action\":\"/v1/products/{id}\",\"method\":\"GET\"},"
            + "\"create\":{\"action\":\"/v1/products\",\"method\":\"POST\"},"
            + "\"update\":{\"action\":\"/v1/products/{id}\",\"method\":\"PUT\"},"
            + "\"delete\":{\"action\":\"/v1/products/{id}\",\"method\":\"DELETE\"},"
            + "\"columns\":[{\"key\":\"name\",\"label\":\"商品名\",\"columnType\":\"VARCHAR\"},"
            + "{\"key\":\"price\",\"label\":\"价格\",\"columnType\":\"DECIMAL\"}],"
            + "\"headers\":{\"X-Api-Key\":\"abc\"}}";

    // ==================== metadata ====================

    @Test
    void metadata_parsesColumnsAndWritable() {
        DataSourceMetadata meta = adapter.metadata(ds(MULTI_OP_PARAMS));
        assertEquals(2, meta.getColumns().size());
        assertEquals("name", meta.getColumns().get(0).getKey());
        assertEquals("商品名", meta.getColumns().get(0).getLabel());
        assertTrue(meta.isWritable());
    }

    @Test
    void metadata_readOnly_notWritable() {
        String readOnly = "{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\",\"parse\":\"records\"},"
                + "\"columns\":[{\"key\":\"name\",\"label\":\"名称\"}]}";
        DataSourceMetadata meta = adapter.metadata(ds(readOnly));
        assertFalse(meta.isWritable());
    }

    // ==================== query ====================

    @Test
    void query_usesListOperation_andExtractsRecords() {
        // parse/totalParse 走点分路径（data.records / data.total）
        String params = "{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\","
                + "\"parse\":\"data.records\",\"totalParse\":\"data.total\"},"
                + "\"headers\":{\"X-Api-Key\":\"abc\"}}";
        when(httpExecutor.execute(anyString(), eq("GET"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"code\":0,\"data\":{\"records\":[{\"id\":\"1\",\"name\":\"A\"},{\"id\":\"2\",\"name\":\"B\"}],\"total\":10}}");

        DataSourceDefinition ds = ds(params);
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO page = adapter.query(ds, req);

        assertEquals(2, page.getRecords().size());
        assertEquals("1", page.getRecords().get(0).getId());
        assertEquals("A", page.getRecords().get(0).getData().get("name"));
        assertEquals(10, page.getTotal());

        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        verify(httpExecutor).execute(urlCaptor.capture(), eq("GET"), anyMap(), eq(List.of()), eq(List.of()), anyMap(), anyInt(), anyInt(), anyInt());
        assertEquals("/v1/products", urlCaptor.getValue());
    }

    @Test
    void query_emptyRecords_whenParseMissing() {
        String noParse = "{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\"}}";
        when(httpExecutor.execute(anyString(), anyString(), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"code\":0,\"data\":[{\"id\":\"1\"}]}");

        BizDataPageVO page = adapter.query(ds(noParse), new BizDataQueryRequest());

        assertEquals(0, page.getRecords().size());
    }

    @Test
    void query_legacyTopLevelAction_mapsToList() {
        String legacy = "{\"action\":\"/v1/old\",\"method\":\"POST\",\"parse\":\"rows\",\"totalParse\":\"total\"}";
        when(httpExecutor.execute(anyString(), eq("POST"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"rows\":[{\"id\":\"x\"}],\"total\":3}");

        BizDataPageVO page = adapter.query(ds(legacy), new BizDataQueryRequest());

        assertEquals(1, page.getRecords().size());
        assertEquals(3, page.getTotal());
    }

    @Test
    void query_searchKeyword_boundIntoVars() {
        String withSearch = "{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\",\"parse\":\"records\"},"
                + "\"searchParam\":\"kw\",\"keywordColumn\":\"name\"}";
        when(httpExecutor.execute(anyString(), anyString(), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"records\":[]}");

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setKeyword("iphone");
        adapter.query(ds(withSearch), req);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> varsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(httpExecutor).execute(anyString(), anyString(), anyMap(), anyList(), anyList(), varsCaptor.capture(), anyInt(), anyInt(), anyInt());
        assertTrue(varsCaptor.getValue().containsKey("kw"));
        assertEquals("iphone", varsCaptor.getValue().get("kw"));
    }

    @Test
    void query_missingListOperation_rejected() {
        DataSourceDefinition ds = ds("{\"get\":{\"action\":\"/v1/products/{id}\",\"method\":\"GET\"}}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> adapter.query(ds, new BizDataQueryRequest()));
        assertTrue(ex.getMessage().contains("list"));
    }

    // ==================== get ====================

    @Test
    void get_resolvesIdAndReturnsRow() {
        when(httpExecutor.execute(eq("/v1/products/{id}"), eq("GET"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"id\":\"42\",\"name\":\"苹果\"}");

        BizDataVO vo = adapter.get(ds(MULTI_OP_PARAMS), "42");

        assertEquals("42", vo.getId());
        assertEquals("苹果", vo.getData().get("name"));
    }

    @Test
    void get_missingOperation_rejected() {
        DataSourceDefinition ds = ds("{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\"}}");
        assertThrows(BusinessException.class, () -> adapter.get(ds, "1"));
    }

    // ==================== create/update/delete ====================

    @Test
    void create_sendsDataAndReturnsCreatedId() {
        when(httpExecutor.execute(eq("/v1/products"), eq("POST"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"id\":\"100\",\"name\":\"新商品\"}");

        Map<String, Object> data = new HashMap<>();
        data.put("name", "新商品");
        data.put("price", 9.9);

        String id = adapter.create(ds(MULTI_OP_PARAMS), data);

        assertEquals("100", id);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> varsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(httpExecutor).execute(eq("/v1/products"), eq("POST"), anyMap(), anyList(), anyList(),
                varsCaptor.capture(), anyInt(), anyInt(), anyInt());
        assertEquals("新商品", varsCaptor.getValue().get("name"));
    }

    @Test
    void update_sendsIdAndData() {
        when(httpExecutor.execute(eq("/v1/products/{id}"), eq("PUT"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"success\":true}");

        Map<String, Object> data = new HashMap<>();
        data.put("price", 19.9);
        adapter.update(ds(MULTI_OP_PARAMS), "42", data, 1);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> varsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(httpExecutor).execute(eq("/v1/products/{id}"), eq("PUT"), anyMap(), anyList(), anyList(),
                varsCaptor.capture(), anyInt(), anyInt(), anyInt());
        assertEquals("42", varsCaptor.getValue().get("id"));
        assertEquals(19.9, varsCaptor.getValue().get("price"));
    }

    @Test
    void delete_sendsId() {
        when(httpExecutor.execute(eq("/v1/products/{id}"), eq("DELETE"), anyMap(), anyList(), anyList(), anyMap(), anyInt(), anyInt(), anyInt()))
                .thenReturn(null);

        adapter.delete(ds(MULTI_OP_PARAMS), "42");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> varsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(httpExecutor).execute(eq("/v1/products/{id}"), eq("DELETE"), anyMap(), anyList(), anyList(),
                varsCaptor.capture(), anyInt(), anyInt(), anyInt());
        assertEquals("42", varsCaptor.getValue().get("id"));
    }

    @Test
    void writeOperation_notConfigured_rejected() {
        DataSourceDefinition ds = ds("{\"list\":{\"action\":\"/v1/products\",\"method\":\"GET\"}}");
        assertThrows(BusinessException.class, () -> adapter.create(ds, Map.of()));
        assertThrows(BusinessException.class, () -> adapter.update(ds, "1", Map.of(), null));
        assertThrows(BusinessException.class, () -> adapter.delete(ds, "1"));
    }

    @Test
    void operation_missingAction_rejected() {
        DataSourceDefinition ds = ds("{\"list\":{\"parse\":\"records\"}}");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> adapter.query(ds, new BizDataQueryRequest()));
        assertTrue(ex.getMessage().contains("action"));
    }

    // ==================== params 合法性 ====================

    @Test
    void params_invalidJson_rejected() {
        DataSourceDefinition ds = ds("{not-json");
        assertThrows(BusinessException.class, () -> adapter.metadata(ds));
    }

    @Test
    void params_missing_rejected() {
        DataSourceDefinition ds = ds(null);
        assertThrows(BusinessException.class, () -> adapter.metadata(ds));
    }
}