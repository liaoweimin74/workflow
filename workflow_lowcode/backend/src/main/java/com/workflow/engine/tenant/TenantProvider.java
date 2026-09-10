package com.workflow.engine.tenant;

import org.springframework.stereotype.Component;

/**
 * Provides tenant ID for engine operations.
 */
@Component
public class TenantProvider {

    public String getTenantId() {
        String tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId.isBlank()) {
            throw new TenantNotSetException("Tenant ID is not set. Ensure X-Tenant-Id header is provided.");
        }
        return tenantId;
    }

    public boolean hasTenantId() {
        return TenantContext.getTenantId() != null && !TenantContext.getTenantId().isBlank();
    }
}