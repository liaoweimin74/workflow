package com.workflow.engine.tenant;

import com.workflow.api.interceptor.TenantInterceptor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

class TenantInterceptorTest {

    private TenantInterceptor interceptor;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        interceptor = new TenantInterceptor();
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        TenantContext.clear();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void preHandle_withValidTenant_setsTenantContext() throws Exception {
        request.addHeader("X-Tenant-Id", "tenant-123");

        boolean result = interceptor.preHandle(request, response, null);

        assertTrue(result);
        assertEquals("tenant-123", TenantContext.getTenantId());
    }

    @Test
    void preHandle_withoutTenant_passesThrough() throws Exception {
        boolean result = interceptor.preHandle(request, response, null);

        assertTrue(result);
        assertNull(TenantContext.getTenantId());
    }

    @Test
    void afterCompletion_clearsTenantContext() throws Exception {
        TenantContext.setTenantId("tenant-456");

        interceptor.afterCompletion(request, response, null, null);

        assertNull(TenantContext.getTenantId());
    }
}