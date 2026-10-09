package com.workflow.engine.form.mapping;

import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * FormDataMerger 单元测试。
 *
 * <p>验证：表单字段映射与流程变量映射的聚合；源数据缺失时跳过不抛错。
 */
class FormDataMergerTest {

    private FormMappingResolver resolver;
    private FormDataRepository formDataRepository;
    private RuntimeService runtimeService;
    private TenantProvider tenantProvider;
    private FormDataMerger merger;

    private static final String PROC_DEF = "procDef:1:uuid";

    @BeforeEach
    void setUp() {
        // 节点 UserTask_1 有 2 条映射：
        //   applicantName ← form:initiator.name（发起表单 F1 当前数据 dataJson {"name":"张三"}）
        //   auditResult   ← variable:gatewayResult（流程变量 gatewayResult="PASS"）
        resolver = mock(FormMappingResolver.class);
        when(resolver.resolveDataMappings(PROC_DEF)).thenReturn(Map.of("UserTask_1", List.of(
            new FormDataMapping("applicantName", "form:initiator", "name"),
            new FormDataMapping("auditResult", "variable:gatewayResult", null))));
        when(resolver.resolveSourceFormDefId(eq("form:initiator"), anyString(), nullable(String.class), anyString()))
            .thenReturn("F1");

        formDataRepository = mock(FormDataRepository.class);
        when(formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                eq("t1"), eq("inst1"), eq("F1"), eq(false)))
            .thenReturn(Optional.of(formData("{\"name\":\"张三\"}")));
        when(formDataRepository.findByTenantIdAndProcessInstanceIdAndFormDefIdAndIsSnapshot(
                eq("t1"), eq("instNoData"), eq("F1"), eq(false)))
            .thenReturn(Optional.empty());

        runtimeService = mock(RuntimeService.class);
        when(runtimeService.getVariable("inst1", "gatewayResult")).thenReturn("PASS");

        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("t1");

        merger = new FormDataMerger(resolver, formDataRepository, runtimeService, tenantProvider);
    }

    private FormData formData(String dataJson) {
        FormData fd = new FormData();
        fd.setDataJson(dataJson);
        return fd;
    }

    @Test
    void mergesFormAndVariableSources() {
        Map<String, Object> merged = merger.merge(PROC_DEF, "UserTask_1", "inst1");
        assertEquals("张三", merged.get("applicantName"));
        assertEquals("PASS", merged.get("auditResult"));
    }

    @Test
    void skipsMissingSource() {
        // 发起表单无数据 → merged 不含 applicantName，不抛异常
        Map<String, Object> merged = merger.merge(PROC_DEF, "UserTask_1", "instNoData");
        assertFalse(merged.containsKey("applicantName"));
    }

    @Test
    void emptyWhenNoMappings() {
        assertTrue(merger.merge(PROC_DEF, "Node_NoMapping", "inst1").isEmpty());
    }
}