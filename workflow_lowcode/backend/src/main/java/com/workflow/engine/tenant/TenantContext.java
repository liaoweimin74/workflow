package com.workflow.engine.tenant;

/**
 * ThreadLocal-based tenant context holder.
 * Tenant ID is set by TenantInterceptor from the X-Tenant-Id HTTP header.
 */
public class TenantContext {

    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    public static void setTenantId(String tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static String getTenantId() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}