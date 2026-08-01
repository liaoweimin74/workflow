package com.workflow.api.controller;

import com.workflow.api.dto.Result;
import com.workflow.engine.tenant.TenantNotSetException;
import org.flowable.common.engine.api.FlowableException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(TenantNotSetException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleTenantNotSet(TenantNotSetException e) {
        return Result.error(400, e.getMessage());
    }

    @ExceptionHandler(FlowableException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> handleFlowableException(FlowableException e) {
        return Result.error(500, "Flowable engine error: " + e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleIllegalArgument(IllegalArgumentException e) {
        return Result.error(400, e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> handleGenericException(Exception e) {
        return Result.error(500, "Internal server error: " + e.getMessage());
    }
}