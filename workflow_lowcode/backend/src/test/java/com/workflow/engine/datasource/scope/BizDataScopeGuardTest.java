package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.BizDataService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 底表通道闸门：收紧时机（只在受控时反查）、越权码（读 404 / 改删 403）、
 * 以及反查请求确实带着保留键（漏掉注入就等于放行）。
 */
class BizDataScopeGuardTest {

    private static final String FORM_KEY = "supplier_quote";
    private static final String ROW = "row-1";

    private DataScopeService dataScopeService;
    private BizDataService bizDataService;
    private BizDataScopeGuard guard;

    @BeforeEach
    void setUp() {
        dataScopeService = mock(DataScopeService.class);
        bizDataService = mock(BizDataService.class);
        guard = new BizDataScopeGuard(dataScopeService, bizDataService, new ObjectMapper());
    }

    /** 受控时把可见集合交给 DataScopeService（条件构造出口仍在它那里）。 */
    @Test
    void apply_delegates_to_the_form_key_channel() {
        BizDataQueryRequest req = new BizDataQueryRequest();

        guard.apply(FORM_KEY, req);

        verify(dataScopeService).applyByFormKey(FORM_KEY, req);
    }

    @Test
    void requireReadable_outside_visible_set_is_404_not_an_existence_probe() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        when(bizDataService.query(eq(FORM_KEY), any())).thenReturn(new BizDataPageVO(List.of(), 0, 1, 1));

        BusinessException e = assertThrows(BusinessException.class,
                () -> guard.requireReadable(FORM_KEY, ROW));

        assertEquals(404, e.getCode());
    }

    @Test
    void requireWritable_outside_visible_set_is_403() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        when(bizDataService.query(eq(FORM_KEY), any())).thenReturn(new BizDataPageVO(List.of(), 0, 1, 1));

        BusinessException e = assertThrows(BusinessException.class,
                () -> guard.requireWritable(FORM_KEY, ROW));

        assertEquals(403, e.getCode());
    }

    @Test
    void in_scope_row_passes_both_gates() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        when(bizDataService.query(eq(FORM_KEY), any()))
                .thenReturn(new BizDataPageVO(List.of(new BizDataVO(ROW, Map.of(), 1, null, null)), 1, 1, 1));

        assertDoesNotThrow(() -> guard.requireReadable(FORM_KEY, ROW));
        assertDoesNotThrow(() -> guard.requireWritable(FORM_KEY, ROW));
    }

    /** 不受控的表单不付反查成本：连一次多余查询都不发。 */
    @Test
    void unscoped_form_skips_the_probe_entirely() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(false);

        guard.requireReadable(FORM_KEY, ROW);
        guard.requireWritable(FORM_KEY, ROW);

        verify(bizDataService, never()).query(eq(FORM_KEY), any());
    }

    /** 反查只要一行，且必须带着服务端写入的可见集合——丢了注入等于放行。 */
    @Test
    void probe_carries_the_id_filter_and_the_reserved_scope_key() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        // 桩替身照真实语义把保留键写进 filter（真实实现由 DataScopeService 构造）
        doAnswer(inv -> {
            FilterAware target = inv.getArgument(1);
            target.setFilter(target.getFilter() + ",\"__row_scope\":[]");
            return null;
        }).when(dataScopeService).applyByFormKey(eq(FORM_KEY), any());
        when(bizDataService.query(eq(FORM_KEY), any())).thenReturn(new BizDataPageVO(List.of(), 0, 1, 1));

        assertThrows(BusinessException.class, () -> guard.requireWritable(FORM_KEY, ROW));

        ArgumentCaptor<BizDataQueryRequest> captor = ArgumentCaptor.forClass(BizDataQueryRequest.class);
        verify(bizDataService).query(eq(FORM_KEY), captor.capture());
        BizDataQueryRequest probe = captor.getValue();
        assertEquals(1, probe.getSize());
        assertTrue(probe.getFilter().contains("\"id\":\"" + ROW + "\""), probe.getFilter());
        assertTrue(probe.getFilter().contains(FilterAware.ROW_SCOPE_KEY), probe.getFilter());
    }

    /** rowId 来自路径参数，可能含引号：条件走序列化而不是字符串拼接。 */
    @Test
    void hostile_row_id_is_serialised_not_interpolated() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        when(bizDataService.query(eq(FORM_KEY), any())).thenReturn(new BizDataPageVO(List.of(), 0, 1, 1));

        assertThrows(BusinessException.class, () -> guard.requireReadable(FORM_KEY, "a\"}b"));

        ArgumentCaptor<BizDataQueryRequest> captor = ArgumentCaptor.forClass(BizDataQueryRequest.class);
        verify(bizDataService).query(eq(FORM_KEY), captor.capture());
        Map<String, Object> filter = parseFilter(captor.getValue().getFilter());
        assertEquals("a\"}b", filter.get("id"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFilter(String json) {
        try {
            return new ObjectMapper().readValue(json, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 可见集合为空数组（受控未授权）时反查自然取不到行，两个闸门各自给出语义码。 */
    @Test
    void denied_scope_reuses_the_same_probe_as_the_list() {
        when(dataScopeService.hasScopeByFormKey(FORM_KEY)).thenReturn(true);
        BizDataPageVO empty = new BizDataPageVO(List.of(), 0, 1, 1);
        when(bizDataService.query(eq(FORM_KEY), any())).thenReturn(empty);

        assertThrows(BusinessException.class, () -> guard.requireReadable(FORM_KEY, ROW));

        ArgumentCaptor<FilterAware> applied = ArgumentCaptor.forClass(FilterAware.class);
        verify(dataScopeService).applyByFormKey(eq(FORM_KEY), applied.capture());
        ArgumentCaptor<BizDataQueryRequest> probed = ArgumentCaptor.forClass(BizDataQueryRequest.class);
        verify(bizDataService).query(eq(FORM_KEY), probed.capture());
        assertSame(applied.getValue(), probed.getValue());
    }
}
