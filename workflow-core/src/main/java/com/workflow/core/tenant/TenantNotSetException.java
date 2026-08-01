package com.workflow.core.tenant;

public class TenantNotSetException extends RuntimeException {

    public TenantNotSetException(String message) {
        super(message);
    }
}