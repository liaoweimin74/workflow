package com.workflow.engine.datasource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.PageResult;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.tenant.TenantContext;

import com.workflow.system.domain.dto.UserQueryRequest;
import com.workflow.system.domain.vo.TreeNode;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.OrganizationService;
import com.workflow.system.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;

import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UnifiedDataSourceAdapterTest {

    @Mock private BizDataService bizDataService;
    @Mock private FormDefinitionService formDefService;
    @Mock private OrganizationService organizationService;
    @Mock private UserService userService;
    @Mock private HttpLogicExecutor httpExecutor;
    @Mock private InternalDataSourceRouter router;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private UnifiedDataSourceAdapter adapter;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId("tenant-1");
        when(router.resolve(any(), any())).thenReturn(
            new InternalDataSourceRouter.ResolvedEndpoint("T", "t", "GET", "/t"));
        adapter = new UnifiedDataSourceAdapter(bizDataService, formDefService, organizationService,
                userService, httpExecutor, objectMapper, router);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private DataSourceDefinition ds(String type, String key) {
        DataSourceDefinition d = new DataSourceDefinition();
        d.setId("ds-1"); d.setName("test"); d.setType(type); d.setStatus("ENABLED");
        if ("FORM".equals(type)) d.setFormKey(key);
        if ("SYSTEM".equals(type)) d.setSourceKey(key);
        return d;
    }

    private ColumnConfig col(String key, String label, String type, int length) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key); c.setLabel(label); c.setColumnType(type); c.setLength(length);
        return c;
    }

    private String apiParamsJson() {
        ObjectNode p = objectMapper.getNodeFactory().objectNode();
        ObjectNode list = p.putObject("list");
        list.put("action", "/v1/products");
        list.put("method", "GET");
        list.put("parse", "records");
        list.put("totalParse", "total");
        p.putArray("columns").addObject().put("key", "name").put("label", "n").put("columnType", "VARCHAR");
        return p.toString();
    }

    @Test
    void supportsAllThreeTypes() {
        assertTrue(adapter.supports("FORM"));
        assertTrue(adapter.supports("SYSTEM"));
        assertTrue(adapter.supports("API"));
        assertFalse(adapter.supports("UNKNOWN"));
    }

    // ===== FORM (internal://) =====

    @Test
    void formQuery_delegatesToBizDataService() {
        DataSourceDefinition ds = ds("FORM", "order");
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.query("order", req)).thenReturn(expected);
        BizDataPageVO result = adapter.query(ds, req);
        assertSame(expected, result);
        verify(router).resolve(ds, "list");
        verify(bizDataService).query("order", req);
    }

    @Test
    void formMetadata_returnsFormColumns() {
        DataSourceDefinition ds = ds("FORM", "order");
        List<ColumnConfig> cols = List.of(col("name", "n", "VARCHAR", 100));
        when(formDefService.getBusinessColumnsByKey("order")).thenReturn(cols);
        DataSourceMetadata meta = adapter.metadata(ds);
        assertTrue(meta.isWritable());
        assertEquals(1, meta.getColumns().size());
    }

    @Test
    void formCreate_delegatesToBizDataService() {
        DataSourceDefinition ds = ds("FORM", "order");
        BizDataVO created = new BizDataVO("100", Map.of(), null, null, null);
        when(bizDataService.create(eq("order"), anyMap())).thenReturn(created);
        assertEquals("100", adapter.create(ds, Map.of("name", "x")));
        verify(router).resolve(ds, "create");
    }

    @Test
    void formDelete_delegatesToBizDataService() {
        DataSourceDefinition ds = ds("FORM", "order");
        adapter.delete(ds, "1");
        verify(router).resolve(ds, "delete");
        verify(bizDataService).delete("order", "1");
    }

    // ===== SYSTEM (internal://) =====

    @Test
    void systemDeptTreeQuery_flattensTree() {
        TreeNode child = new TreeNode(2L, 1L, "RD", "RD", 1, 1, List.of());
        TreeNode root = new TreeNode(1L, null, "TECH", "TECH", 1, 1, List.of(child));
        when(organizationService.tree()).thenReturn(List.of(root));
        DataSourceDefinition ds = ds("SYSTEM", "dept-tree");
        BizDataPageVO page = adapter.query(ds, null);
        assertEquals(2, page.getRecords().size());
        assertEquals("1", page.getRecords().get(0).getId());
        assertEquals("", page.getRecords().get(0).getData().get("parentId"));
        assertEquals("2", page.getRecords().get(1).getId());
        assertEquals("1", page.getRecords().get(1).getData().get("parentId"));
    }

    @Test
    void systemUserTreeQuery_delegatesToUserService() {
        UserVO u = new UserVO(7L, "admin", "admin", null, null, null, 1L, "TECH", 1, null, null);
        when(userService.list(any(UserQueryRequest.class)))
                .thenReturn(new PageResult<>(1L, 0, 20, List.of(u)));
        DataSourceDefinition ds = ds("SYSTEM", "user-tree");
        BizDataPageVO page = adapter.query(ds, new BizDataQueryRequest());
        assertEquals(1, page.getRecords().size());
        assertEquals("7", page.getRecords().get(0).getId());
        assertEquals(1L, page.getTotal());
    }

    @Test
    void systemMetadata_deptTreeReturnsBuiltInColumns() {
        DataSourceDefinition ds = ds("SYSTEM", "dept-tree");
        DataSourceMetadata meta = adapter.metadata(ds);
        assertFalse(meta.isWritable());
        assertEquals(4, meta.getColumns().size());
        assertEquals("id", meta.getColumns().get(0).getKey());
    }

    @Test
    void systemCreate_throwsReadOnly() {
        DataSourceDefinition ds = ds("SYSTEM", "dept-tree");
        assertThrows(BusinessException.class, () -> adapter.create(ds, Map.of()));
    }

    // ===== API (external://) =====

    @Test
    void apiQuery_delegatesToHttpExecutor() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ds.setParams(apiParamsJson());
        String jsonResp = "{\"records\": [{\"id\": \"1\", \"name\": \"Widget\"}], \"total\": 1}";
        when(httpExecutor.execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenReturn(jsonResp);
        BizDataPageVO page = adapter.query(ds, new BizDataQueryRequest());
        assertEquals(1, page.getRecords().size());
        assertEquals("1", page.getRecords().get(0).getId());
        assertEquals(1L, page.getTotal());
        verify(router, never()).resolve(any(), any());
    }

    @Test
    void apiMetadata_parsesParamsColumns() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ds.setParams(apiParamsJson());
        DataSourceMetadata meta = adapter.metadata(ds);
        assertEquals(1, meta.getColumns().size());
        assertEquals("name", meta.getColumns().get(0).getKey());
        assertFalse(meta.isWritable());
    }

    @Test
    void apiMetadata_writableWhenCreateConfigured() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ObjectNode p = objectMapper.getNodeFactory().objectNode();
        p.putArray("columns").addObject().put("key", "x").put("label", "y").put("columnType", "VARCHAR");
        p.putObject("create").put("action", "/v1/x").put("method", "POST");
        ds.setParams(p.toString());
        DataSourceMetadata meta = adapter.metadata(ds);
        assertTrue(meta.isWritable());
    }

    @Test
    void apiCreate_throwsWhenNotConfigured() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ds.setParams(apiParamsJson());
        assertThrows(BusinessException.class, () -> adapter.create(ds, Map.of()));
    }

    @Test
    void apiDelete_throwsWhenNotConfigured() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ds.setParams(apiParamsJson());
        assertThrows(BusinessException.class, () -> adapter.delete(ds, "1"));
    }

    @Test
    void apiCreate_delegatesToHttpExecutor() {
        DataSourceDefinition ds = ds("API", "external-stock");
        ObjectNode p = objectMapper.getNodeFactory().objectNode();
        ObjectNode list = p.putObject("list");
        list.put("action", "/v1/products");
        list.put("method", "GET");
        list.put("parse", "records");
        p.putArray("columns").addObject().put("key", "name").put("label", "n").put("columnType", "VARCHAR");
        p.putObject("create").put("action", "/v1/products").put("method", "POST");
        ds.setParams(p.toString());
        when(httpExecutor.execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenReturn("{\"id\": \"99\"}");
        String id = adapter.create(ds, Map.of("name", "Widget"));
        assertEquals("99", id);
    }
}
