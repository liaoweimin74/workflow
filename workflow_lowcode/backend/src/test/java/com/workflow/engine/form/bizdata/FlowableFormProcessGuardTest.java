package com.workflow.engine.form.bizdata;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.process.FlowableFormProcessGuard;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * FlowableFormProcessGuard 鍗曞厓娴嬭瘯锛氳繍琛屼腑/宸茬粨鏉熸祦绋嬪疄渚嬬殑 409 鎷掔粷璇箟銆? */
@ExtendWith(MockitoExtension.class)
class FlowableFormProcessGuardTest {

    private static final String TENANT_ID = "t1";
    private static final String FORM_KEY = "biz_leave";
    private static final String ROW_ID = "row-1";

    @Mock
    private RuntimeService runtimeService;

    @Mock
    private HistoryService historyService;

    @Mock
    private FormDefinitionService formDefService;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private ProcessInstanceQuery processQuery;

    @Mock
    private HistoricProcessInstanceQuery historicQuery;

    private FlowableFormProcessGuard guard;

    @BeforeEach
    void setUp() {
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);
        lenient().when(runtimeService.createProcessInstanceQuery()).thenReturn(processQuery);
        lenient().when(historyService.createHistoricProcessInstanceQuery()).thenReturn(historicQuery);
        guard = new FlowableFormProcessGuard(runtimeService, historyService, formDefService, tenantProvider);
    }

    private FormDefinition formDef(String processKey) {
        FormDefinition def = new FormDefinition();
        def.setKey(FORM_KEY);
        def.setProcessKey(processKey);
        return def;
    }

    @Test
    void checkBeforeUpdate_runningInstance_rejects409() {
        when(processQuery.processInstanceTenantId(TENANT_ID)).thenReturn(processQuery);
        when(processQuery.processInstanceBusinessKey(ROW_ID)).thenReturn(processQuery);
        when(processQuery.active()).thenReturn(processQuery);
        when(processQuery.count()).thenReturn(1L);

        assertThatThrownBy(() -> guard.checkBeforeUpdate(FORM_KEY, ROW_ID))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode())
                .isEqualTo(409);
    }

    @Test
    void checkBeforeUpdate_noInstance_allows() {
        when(processQuery.processInstanceTenantId(TENANT_ID)).thenReturn(processQuery);
        when(processQuery.processInstanceBusinessKey(ROW_ID)).thenReturn(processQuery);
        when(processQuery.active()).thenReturn(processQuery);
        when(processQuery.count()).thenReturn(0L);

        guard.checkBeforeUpdate(FORM_KEY, ROW_ID);
    }

    @Test
    void checkBeforeDelete_finishedInstance_rejects409() {
        when(historicQuery.processInstanceTenantId(TENANT_ID)).thenReturn(historicQuery);
        when(historicQuery.processInstanceBusinessKey(ROW_ID)).thenReturn(historicQuery);
        when(historicQuery.count()).thenReturn(1L);

        assertThatThrownBy(() -> guard.checkBeforeDelete(FORM_KEY, ROW_ID))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getCode())
                .isEqualTo(409);
    }

    @Test
    void checkBeforeDelete_noInstance_allows() {
        when(historicQuery.processInstanceTenantId(TENANT_ID)).thenReturn(historicQuery);
        when(historicQuery.processInstanceBusinessKey(ROW_ID)).thenReturn(historicQuery);
        when(historicQuery.count()).thenReturn(0L);

        guard.checkBeforeDelete(FORM_KEY, ROW_ID);
    }

    @Test
    void appliesTo_boundFormKey_true() {
        when(formDefService.getByKey(FORM_KEY)).thenReturn(formDef("leave_approval"));
        assertThat(guard.appliesTo(FORM_KEY)).isTrue();
    }

    @Test
    void appliesTo_unboundFormKey_false() {
        when(formDefService.getByKey(FORM_KEY)).thenReturn(formDef(null));
        assertThat(guard.appliesTo(FORM_KEY)).isFalse();
    }
}
