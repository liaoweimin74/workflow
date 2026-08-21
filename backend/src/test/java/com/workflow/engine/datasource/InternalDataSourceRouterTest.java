package com.workflow.engine.datasource;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantNotSetException;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * InternalDataSourceRouter 测试：
 * FORM formKey → BizDataController 方法；SYSTEM sourceKey → SystemInternalController 方法；
 * 未注册路径 / 未知类型 / 缺少 tenant → 400 / TenantNotSetException。
 */
class InternalDataSourceRouterTest {

    private InternalDataSourceRouter router;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId("tenant-1");
        router = new InternalDataSourceRouter(new TenantProvider());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    private DataSourceDefinition ds(String type, String key) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("ds-1");
        ds.setName("测试数据源");
        ds.setType(type);
        ds.setStatus("ENABLED");
        if ("FORM".equals(type)) ds.setFormKey(key);
        if ("SYSTEM".equals(type)) ds.setSourceKey(key);
        return ds;
    }

    // ==================== FORM → BizDataController ====================

    @Test
    void resolveFormList_mapsToBizDataQuery() {
        var r = router.resolve(ds("FORM", "order"), "list");
        assertEquals("BizDataController", r.controller());
        assertEquals("query", r.method());
        assertEquals("GET", r.httpMethod());
        assertEquals("/api/v1/biz-data/order", r.path());
    }

    @Test
    void resolveFormGroup_get_mapsToBizDataGetById() {
        var r = router.resolve(ds("FORM", "order"), "get");
        assertEquals("BizDataController", r.controller());
        assertEquals("getById", r.method());
        assertEquals("GET", r.httpMethod());
        assertEquals("/api/v1/biz-data/order/{id}", r.path());
    }

    @Test
    void resolveFormGroup_create_mapsToBizDataCreate() {
        var r = router.resolve(ds("FORM", "order"), "create");
        assertEquals("create", r.method());
        assertEquals("POST", r.httpMethod());
    }

    @Test
    void resolveFormGroup_update_mapsToBizDataUpdate() {
        var r = router.resolve(ds("FORM", "order"), "update");
        assertEquals("update", r.method());
        assertEquals("PUT", r.httpMethod());
    }

    @Test
    void resolveFormGroup_delete_mapsToBizDataDelete() {
        var r = router.resolve(ds("FORM", "order"), "delete");
        assertEquals("delete", r.method());
        assertEquals("DELETE", r.httpMethod());
    }

    @Test
    void resolveFormWithId_substitutesFormKeyAndId() {
        var r = router.resolve(ds("FORM", "order"), "delete");
        assertTrue(r.path().contains("/biz-data/order/"));
        assertTrue(r.path().contains("{id}"));
    }

    // ==================== SYSTEM → SystemInternalController ====================

    @Test
    void resolveSystemDeptTreeList_mapsToDeptTree() {
        var r = router.resolve(ds("SYSTEM", "dept-tree"), "list");
        assertEquals("SystemInternalController", r.controller());
        assertEquals("deptTree", r.method());
        assertEquals("GET", r.httpMethod());
        assertEquals("/api/v1/internal/system/dept-tree", r.path());
    }

    @Test
    void resolveSystemDeptTreeCreate_mapsToCreateDept() {
        var r = router.resolve(ds("SYSTEM", "dept-tree"), "create");
        assertEquals("SystemInternalController", r.controller());
        assertEquals("createDept", r.method());
        assertEquals("POST", r.httpMethod());
        assertEquals("/api/v1/internal/system/dept", r.path());
    }

    @Test
    void resolveSystemDeptTreeDelete_mapsToDeleteDept() {
        var r = router.resolve(ds("SYSTEM", "dept-tree"), "delete");
        assertEquals("deleteDept", r.method());
        assertEquals("DELETE", r.httpMethod());
        assertEquals("/api/v1/internal/system/dept/{id}", r.path());
    }

    @Test
    void resolveSystemUserTreeList_mapsToUsers() {
        var r = router.resolve(ds("SYSTEM", "user-tree"), "list");
        assertEquals("SystemInternalController", r.controller());
        assertEquals("users", r.method());
        assertEquals("GET", r.httpMethod());
        assertEquals("/api/v1/internal/system/users", r.path());
    }

    @Test
    void resolveSystemUserTreeGet_mapsToGetUser() {
        var r = router.resolve(ds("SYSTEM", "user-tree"), "get");
        assertEquals("getUser", r.method());
        assertEquals("GET", r.httpMethod());
        assertEquals("/api/v1/internal/system/users/{id}", r.path());
    }

    @Test
    void resolveSystemUserTreeCreate_mapsToCreateUser() {
        var r = router.resolve(ds("SYSTEM", "user-tree"), "create");
        assertEquals("createUser", r.method());
        assertEquals("POST", r.httpMethod());
    }

    @Test
    void resolveSystemUserTreeDelete_mapsToDeleteUser() {
        var r = router.resolve(ds("SYSTEM", "user-tree"), "delete");
        assertEquals("deleteUser", r.method());
        assertEquals("DELETE", r.httpMethod());
    }

    // ==================== SYSTEM unsupported operations ====================

    @Test
    void resolveSystemDeptTreeUpdate_unsupported() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds("SYSTEM", "dept-tree"), "update"));
        assertEquals(400, ex.getCode());
    }

    @Test
    void resolveSystemDeptTreeGet_unsupported() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds("SYSTEM", "dept-tree"), "get"));
        assertEquals(400, ex.getCode());
    }

    // ==================== Error / rejection ====================

    @Test
    void resolveUnknownSourceKey_rejected400() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds("SYSTEM", "unknown-key"), "list"));
        assertEquals(400, ex.getCode());
        assertTrue(ex.getMessage().contains("unknown-key"));
    }

    @Test
    void resolveUnknownType_rejected400() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("ds-1");
        ds.setName("unknown");
        ds.setType("UNKNOWN");
        ds.setStatus("ENABLED");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds, "list"));
        assertEquals(400, ex.getCode());
    }

    @Test
    void resolveFormMissingFormKey_rejected400() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("ds-1");
        ds.setName("test");
        ds.setType("FORM");
        ds.setStatus("ENABLED");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds, "list"));
        assertEquals(400, ex.getCode());
    }

    @Test
    void resolveWithoutTenant_rejected() {
        TenantContext.clear();
        assertThrows(TenantNotSetException.class,
                () -> router.resolve(ds("SYSTEM", "dept-tree"), "list"));
    }

    @Test
    void resolveSystemMissingSourceKey_rejected400() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("ds-1");
        ds.setName("test");
        ds.setType("SYSTEM");
        ds.setStatus("ENABLED");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> router.resolve(ds, "list"));
        assertEquals(400, ex.getCode());
    }
}
