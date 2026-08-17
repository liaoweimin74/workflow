package com.workflow.engine.form.mapping;

import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * VariableMappingWriter 单元测试。
 *
 * <p>验证：form:* 源从源表单当前数据取值写入流程变量；variable:* 源透传；
 * 源数据缺失时跳过写入。
 */
class VariableMappingWriterTest {

    private FormMappingResolver resolver;
    private FormDataRepository formDataRepository;
    private RuntimeService runtimeService;
    private TenantProvider tenantProvider;
    private VariableMappingWriter writer;

    private static final String PROC_DEF = "procDef:1:uuid";

    @BeforeEach
    void setUp() {
        // variableMappings: [{variable:requestAmount, source:form:initiator, sourceField:amount},
        //                    {variable:copy, source:variable:orig}]
        resolver = mock(FormMappingResolver.class);
        when(resolver.resolveVariableMappings(PROC_DEF)).thenReturn(List.of(
            new VariableMapping("requestAmount", "form:initiator", "amount"),
            new VariableMapping("copy", "variable:orig", null)));
        when(resolver.resolveSourceFormDefId(eq("form:initiator"), anyString(), nullable(String.class), anyString()))
            .thenReturn("F1");

        formDataRepository = mock(FormDataRepository.class);
        when(formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                eq("t1"), eq("inst1"), eq("F1"), eq(false)))
            .thenReturn(Optional.of(formData("{\"amount\":5000}")));
        when(formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                eq("t1"), eq("instNoData"), eq("F1"), eq(false)))
            .thenReturn(Optional.empty());

        runtimeService = mock(RuntimeService.class);
        when(runtimeService.getVariable("inst1", "orig")).thenReturn("X");

        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("t1");

        writer = new VariableMappingWriter(resolver, formDataRepository, runtimeService, tenantProvider);
    }

    private FormData formData(String dataJson) {
        FormData fd = new FormData();
        fd.setDataJson(dataJson);
        return fd;
    }

    @Test
    void writesFormFieldToVariable() {
        writer.write(PROC_DEF, "inst1");
        verify(runtimeService).setVariable("inst1", "requestAmount", 5000);
    }

    @Test
    void skipsWhenSourceDataMissing() {
        writer.write(PROC_DEF, "instNoData");
        verify(runtimeService, never()).setVariable(any(), any(), any());
    }

    @Test
    void passesThroughVariableSource() {
        writer.write(PROC_DEF, "inst1");
        verify(runtimeService).setVariable("inst1", "copy", "X");
    }
}