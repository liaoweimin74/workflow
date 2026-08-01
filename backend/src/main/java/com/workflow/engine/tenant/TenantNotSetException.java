package com.workflow.engine.tenant;

public class TenantNotSetException extends RuntimeException {
    public TenantNotSetException(String message) {
        super(message);
    }
}