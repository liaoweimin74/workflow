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
import com.workflow.engine.form.bizdata.JoinSqlGenerator;
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
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.ArrayList;
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
    @Mock private WorkflowFormDataQueryService workflowQueryService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private UnifiedDataSourceAdapter adapter;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId("tenant-1");
        when(router.resolve(any(), any())).thenReturn(
            new InternalDataSourceRouter.ResolvedEndpoint("T", "t", "GET", "/t"));
        adapter = new UnifiedDataSourceAdapter(bizDataService, formDefService, organizationService,
                userService, httpExecutor, objectMapper, router, workflowQueryService);
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
        if ("WORKFLOW".equals(type)) d.setFormKey(key);
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
    void supportsAllTypes() {
        assertTrue(adapter.supports("FORM"));
        assertTrue(adapter.supports("SYSTEM"));
        assertTrue(adapter.supports("API"));
        assertTrue(adapter.supports("WORKFLOW"));
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
        assertEquals("order", meta.getFormKey());
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

    // ===== FORM join/sql 查询分流（Task 4） =====

    @Test
    void formQuery_configMode_delegatesToQueryJoin() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"config","joins":[{"alias":"c","targetFormKey":"customer","localField":"customer_id",
                "foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称",
                "sortable":true,"filterable":true}]}
                """);
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.queryJoin(eq("order"), same(req), anyList())).thenReturn(expected);

        BizDataPageVO result = adapter.query(ds, req);

        assertSame(expected, result);
        verify(router).resolve(ds, "list");
        verify(bizDataService).queryJoin(eq("order"), same(req),
                argThat(joins -> joins.size() == 1
                        && ((JoinSqlGenerator.JoinConfig) joins.get(0)).virtualKey().equals("customer_name")));
    }

    @Test
    void formQuery_sqlMode_delegatesToQuerySql() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT order_no FROM orders_view WHERE tenant_id = :tenantId",
                "columns":[{"key":"order_no","columnType":"VARCHAR","sortable":true}],"params":[]}
                """);
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.querySql(eq("order"), same(req), any())).thenReturn(expected);

        BizDataPageVO result = adapter.query(ds, req);

        assertSame(expected, result);
        verify(router).resolve(ds, "list");
        verify(bizDataService).querySql(eq("order"), same(req),
                argThat(cfg -> cfg != null && cfg.isSqlMode()));
    }

    @Test
    void formQuery_noQueryMode_fallsBackToSingleTable() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("{\"action\":\"list\"}"); // 无 queryMode，向后兼容
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.query("order", req)).thenReturn(expected);

        BizDataPageVO result = adapter.query(ds, req);

        assertSame(expected, result);
        verify(router).resolve(ds, "list");
        verify(bizDataService).query("order", req);
    }

    @Test
    void formMetadata_configMode_appendsVirtualColumns() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"config","joins":[{"alias":"c","targetFormKey":"customer","localField":"customer_id",
                "foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称",
                "sortable":true,"filterable":false}]}
                """);
        when(formDefService.getBusinessColumnsByKey("order"))
                .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));
        when(formDefService.getBusinessColumnsByKey("customer"))
                .thenReturn(List.of(col("name", "客户名称", "VARCHAR", 100)));

        DataSourceMetadata meta = adapter.metadata(ds);

        assertEquals(2, meta.getColumns().size());
        ColumnConfig v = meta.getColumns().get(1);
        assertEquals("customer_name", v.getKey());
        assertEquals("客户名称", v.getLabel());
        assertEquals("VARCHAR", v.getColumnType());
        assertEquals(Boolean.TRUE, v.getSortable());
        assertEquals(Boolean.FALSE, v.getFilterable());
        assertTrue(meta.isWritable());
        verify(formDefService).getBusinessColumnsByKey("customer");
    }

    @Test
    void formMetadata_configMode_skipsDuplicateVirtualKey() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"config","joins":[{"alias":"c","targetFormKey":"customer","localField":"customer_id",
                "foreignField":"id","joinField":"name","virtualKey":"order_no","label":"冲突列",
                "sortable":true,"filterable":true}]}
                """);
        when(formDefService.getBusinessColumnsByKey("order"))
                .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));

        DataSourceMetadata meta = adapter.metadata(ds);

        // virtualKey 与主表列重名 → 跳过，不重复追加
        assertEquals(1, meta.getColumns().size());
        assertEquals("order_no", meta.getColumns().get(0).getKey());
    }

    @Test
    void formMetadata_sqlMode_appendsDeclaredColumns() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT order_no, total FROM orders_view WHERE tenant_id = :tenantId",
                "columns":[{"key":"total","label":"合计","columnType":"DECIMAL","sortable":true,"filterable":false}],
                "params":[]}
                """);
        when(formDefService.getBusinessColumnsByKey("order"))
                .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));

        DataSourceMetadata meta = adapter.metadata(ds);

        assertEquals(2, meta.getColumns().size());
        ColumnConfig v = meta.getColumns().get(1);
        assertEquals("total", v.getKey());
        assertEquals("合计", v.getLabel());
        assertEquals("DECIMAL", v.getColumnType());
        assertEquals(Boolean.TRUE, v.getSortable());
        assertEquals(Boolean.FALSE, v.getFilterable());
    }

    @Test
    void formMetadata_sqlMode_skipsDeclaredDuplicate() {
        DataSourceDefinition ds = ds("FORM", "order");
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT order_no FROM orders_view WHERE tenant_id = :tenantId",
                "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}],"params":[]}
                """);
        when(formDefService.getBusinessColumnsByKey("order"))
                .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));

        DataSourceMetadata meta = adapter.metadata(ds);

        assertEquals(1, meta.getColumns().size());
    }

    // ===== SQL 数据源 =====

    @Test
    void sqlQuery_visualMode_delegatesToQuerySql() {
        DataSourceDefinition ds = ds("SQL", null);
        ds.setParams("""
                {"queryMode":"visual","query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
                 "columns":[{"key":"order_no","columnType":"VARCHAR","sortable":true}],"params":[]}
                """);
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.querySql(isNull(), eq(req), any())).thenReturn(expected);

        BizDataPageVO result = adapter.query(ds, req);

        assertSame(expected, result);
        verify(bizDataService).querySql(isNull(), eq(req), any());
    }

    @Test
    void sqlQuery_sqlMode_delegatesToQuerySql() {
        DataSourceDefinition ds = ds("SQL", null);
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT id FROM test WHERE tenant_id = :tenantId",
                 "columns":[{"key":"id","columnType":"VARCHAR","sortable":true}],"params":[]}
                """);
        BizDataQueryRequest req = new BizDataQueryRequest();
        BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
        when(bizDataService.querySql(isNull(), eq(req), any())).thenReturn(expected);

        BizDataPageVO result = adapter.query(ds, req);

        assertSame(expected, result);
    }

    @Test
    void sqlMetadata_withFormKey_mergesFormColumns() {
        DataSourceDefinition ds = ds("SQL", null);
        ds.setFormKey("order");
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
                 "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                            {"key":"customer_name","label":"客户","columnType":"VARCHAR","sortable":true,"filterable":true}],
                 "params":[]}
                """);
        when(formDefService.getBusinessColumnsByKey("order"))
                .thenReturn(new ArrayList<>(List.of(col("order_no", "订单号", "VARCHAR", 100))));

        DataSourceMetadata meta = adapter.metadata(ds);

        // 表单列 order_no 优先，声明列 customer_name 追加
        assertEquals(2, meta.getColumns().size());
        assertEquals("order_no", meta.getColumns().get(0).getKey());
        assertEquals("customer_name", meta.getColumns().get(1).getKey());
        assertTrue(meta.isWritable());
    }

    @Test
    void sqlMetadata_noFormKey_onlyDeclaredColumns() {
        DataSourceDefinition ds = ds("SQL", null);
        ds.setParams("""
                {"queryMode":"sql","query":"SELECT id FROM raw_logs WHERE tenant_id = :tenantId",
                 "columns":[{"key":"id","label":"ID","columnType":"VARCHAR","sortable":true,"filterable":true}],
                 "params":[]}
                """);

        DataSourceMetadata meta = adapter.metadata(ds);

        assertEquals(1, meta.getColumns().size());
        assertFalse(meta.isWritable());
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
        verify(userService).list(argThat(query -> query.page() == 1 && query.size() == 20));
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
    void systemMetadata_userTreeReturnsChineseColumnLabels() {
        DataSourceMetadata meta = adapter.metadata(ds("SYSTEM", "user-tree"));

        assertEquals(List.of("用户 ID", "用户名", "昵称", "部门 ID", "部门名称", "状态"),
                meta.getColumns().stream().map(ColumnConfig::getLabel).toList());
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

    // ===== WORKFLOW (只读：跨流程实例聚合) =====

    @Nested
    class WorkflowBranch {

        private DataSourceDefinition wfDef() {
            return ds("WORKFLOW", "leave");
        }

        @Test
        void metadata_returnsSystemAndBusinessColumns_readonly() {
            List<ColumnConfig> cols = List.of(
                    col("instanceId", "流程实例ID", "VARCHAR", 64),
                    col("reason", "事由", "VARCHAR", 255));
            when(workflowQueryService.columnsFor("leave")).thenReturn(cols);

            DataSourceMetadata meta = adapter.metadata(wfDef());

            assertFalse(meta.isWritable());
            assertEquals(2, meta.getColumns().size());
            assertEquals("reason", meta.getColumns().get(1).getKey());
            assertEquals("leave", meta.getFormKey());
            verify(workflowQueryService).columnsFor("leave");
        }

        @Test
        void query_delegatesToWorkflowQueryService() {
            BizDataQueryRequest req = new BizDataQueryRequest();
            BizDataPageVO expected = new BizDataPageVO(List.of(), 0L, 0, 20);
            when(workflowQueryService.query("leave", req)).thenReturn(expected);

            BizDataPageVO result = adapter.query(wfDef(), req);

            assertSame(expected, result);
            verify(workflowQueryService).query("leave", req);
        }

        @Test
        void get_delegatesToWorkflowQueryService() {
            BizDataVO expected = new BizDataVO("r1", Map.of(), null, null, null);
            when(workflowQueryService.getById("leave", "r1")).thenReturn(expected);

            BizDataVO result = adapter.get(wfDef(), "r1");

            assertSame(expected, result);
            verify(workflowQueryService).getById("leave", "r1");
        }

        @Test
        void create_throwsReadOnly() {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> adapter.create(wfDef(), Map.of("reason", "x")));
            assertEquals(400, ex.getCode());
        }

        @Test
        void update_throwsReadOnly() {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> adapter.update(wfDef(), "r1", Map.of("reason", "x"), 1));
            assertEquals(400, ex.getCode());
        }

        @Test
        void delete_throwsReadOnly() {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> adapter.delete(wfDef(), "r1"));
            assertEquals(400, ex.getCode());
        }
    }
}
