package com.workflow.app;

import com.workflow.core.tenant.TenantContext;
import com.workflow.core.tenant.TenantNotSetException;
import com.workflow.core.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TenantProviderTest {

    private TenantProvider tenantProvider;

    @BeforeEach
    void setUp() {
        tenantProvider = new TenantProvider();
        TenantContext.clear();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void getTenantId_whenSet_returnsTenantId() {
        TenantContext.setTenantId("tenant-abc");

        String result = tenantProvider.getTenantId();

        assertEquals("tenant-abc", result);
    }

    @Test
    void getTenantId_whenNotSet_throwsException() {
        assertThrows(TenantNotSetException.class, () -> tenantProvider.getTenantId());
    }

    @Test
    void hasTenantId_whenSet_returnsTrue() {
        TenantContext.setTenantId("tenant-xyz");

        assertTrue(tenantProvider.hasTenantId());
    }

    @Test
    void hasTenantId_whenNotSet_returnsFalse() {
        assertFalse(tenantProvider.hasTenantId());
    }
}