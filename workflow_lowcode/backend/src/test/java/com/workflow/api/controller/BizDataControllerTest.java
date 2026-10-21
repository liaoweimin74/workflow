package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.scope.BizDataScopeGuard;
import com.workflow.engine.form.bizdata.BizDataService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 底表 Controller 的接线验证：哪些入口过闸门、哪些明确不过。
 *
 * <p>这一笔补的是「同一张物理表第二条通道绕过数据权限」的洞，所以最有价值的一条断言是
 * 「闸门收到了同一个请求对象」——范围注入一旦在 controller 层漏接，服务本身仍是正确的、
 * 单测全绿，线上却是全量可见。
 */
class BizDataControllerTest {

    private static final String FORM_KEY = "supplier_quote";
    private static final String ROW = "row-1";

    private BizDataService bizDataService;
    private BizDataScopeGuard scopeGuard;
    private BizDataController controller;

    @BeforeEach
    void setUp() {
        bizDataService = mock(BizDataService.class);
        scopeGuard = mock(BizDataScopeGuard.class);
        controller = new BizDataController(bizDataService, scopeGuard);
    }

    /** 列表：注入必须落在随后交给服务执行的那个请求对象上。 */
    @Test
    void query_injects_scope_into_the_request_that_is_executed() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");
        when(bizDataService.query(FORM_KEY, req)).thenReturn(new BizDataPageVO(List.of(), 0, 1, 20));

        controller.query(FORM_KEY, req);

        verify(scopeGuard).apply(FORM_KEY, req);
        verify(bizDataService).query(FORM_KEY, req);
    }

    @Test
    void get_by_id_checks_readability_before_hitting_the_table() {
        when(bizDataService.getById(FORM_KEY, ROW))
                .thenReturn(new BizDataVO(ROW, Map.of("supplier", "南方铝业"), 1, null, null));

        assertEquals(ROW, controller.getById(FORM_KEY, ROW).getData().getId());

        verify(scopeGuard).requireReadable(FORM_KEY, ROW);
    }

    @Test
    void update_checks_writability_and_propagates_403() {
        doAnswer(inv -> {
            throw new BusinessException(403, "无权修改或删除该记录（不在数据权限范围内）: " + ROW);
        }).when(scopeGuard).requireWritable(FORM_KEY, ROW);

        assertThrows(BusinessException.class,
                () -> controller.update(FORM_KEY, ROW, Map.of("supplier", "北方钢铁")));

        verify(bizDataService, never()).update(anyString(), anyString(), any(), any());
    }

    @Test
    void delete_checks_writability() {
        controller.delete(FORM_KEY, ROW);

        verify(scopeGuard).requireWritable(FORM_KEY, ROW);
        verify(bizDataService).delete(FORM_KEY, ROW);
    }

    /** 新增不按行校验（v3 不变量四：新行还没有归属可比）。 */
    @Test
    void create_is_not_row_gated() {
        when(bizDataService.create(eq(FORM_KEY), any()))
                .thenReturn(new BizDataVO("row-9", Map.of(), 1, null, null));

        controller.create(FORM_KEY, Map.of("supplier", "南方铝业"));

        verify(scopeGuard, never()).requireWritable(anyString(), anyString());
        verify(scopeGuard, never()).requireReadable(anyString(), anyString());
    }

    /** 引用显示文本解析与独立子表行不参与范围判定（产品决定：收死会让标签整体空掉）。 */
    @Test
    void resolve_and_sub_rows_stay_out_of_the_scope_channel() {
        when(bizDataService.resolveByFormKey(anyString(), anyList(), any())).thenReturn(Map.of(ROW, "南方铝业"));
        when(bizDataService.listSubRows(FORM_KEY, ROW, "items")).thenReturn(List.of(Map.of("qty", 1)));

        controller.resolve(FORM_KEY, List.of(ROW), null);
        controller.listSubRows(FORM_KEY, ROW, "items");
        controller.addSubRow(FORM_KEY, ROW, "items", Map.of("qty", 2));
        controller.deleteSubRow(FORM_KEY, ROW, "items", "sub-1");

        verify(scopeGuard, never()).apply(any(), any());
        verify(scopeGuard, never()).requireReadable(any(), anyString());
        verify(scopeGuard, never()).requireWritable(any(), anyString());
    }
}
