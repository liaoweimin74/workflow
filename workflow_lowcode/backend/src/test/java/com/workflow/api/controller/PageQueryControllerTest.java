package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageQueryController 单元测试（自定义页面 PAGE 数据源查询）。
 *
 * <p>验证 {@code /{pageKey}/ds/{dataSourceId}/data}：
 * - 按 dataSourceId 在已发布 schema 的 dataSources 中解析 refId 后委托 DataSourceDefinitionService.queryData
 * - filter 白名单：仅放行数据源条目声明的 searchFields（扁平/结构化两种格式）
 * - 未声明的 dataSourceId / 非 PAGE 页面 → 400
 * <p>VIEW 视图查询接口（/{pageKey}/data）已随视图编译废弃移除。
 */
class PageQueryControllerTest {

    private PageDefinitionService pageDefService;
    private DataSourceDefinitionService dsService;
    private PageAccessGuard pageAccessGuard;
    private PageQueryController controller;

    /** PAGE schema：ds-products 声明 searchFields=[name,dept]，ds-open 未声明（不限制） */
    private static final String PAGE_SCHEMA = """
            {"rule":[{"type":"page-table","field":"table1","props":{"dataSourceId":"ds-products"}}],
             "option":{},
             "dataSources":[
               {"id":"ds-products","refId":"ds_ref_001","searchFields":["name","dept"]},
               {"id":"ds-open","refId":"ds_ref_002"}],
             "actions":[]}
            """;

    @BeforeEach
    void setUp() {
        pageDefService = mock(PageDefinitionService.class);
        dsService = mock(DataSourceDefinitionService.class);
        pageAccessGuard = mock(PageAccessGuard.class);
        controller = new PageQueryController(pageDefService, dsService, pageAccessGuard,
                new PageViewQuerySupport(new ObjectMapper()));

        PageDefinition page = new PageDefinition();
        page.setType("PAGE");
        page.setSchema(PAGE_SCHEMA);
        when(pageDefService.getPublishedByKey("product-page")).thenReturn(page);

        PageDefinition legacyView = new PageDefinition();
        legacyView.setType("VIEW");
        legacyView.setSchema(PAGE_SCHEMA);
        when(pageDefService.getPublishedByKey("emp_view")).thenReturn(legacyView);

        when(dsService.queryData(anyString(), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO());
    }

    @Test
    void pageQuery_resolvesDataSourceIdToRefId_delegates() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);

        R<BizDataPageVO> result = controller.queryPageDataSource("product-page", "ds-products", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).queryData(eq("ds_ref_001"), any(BizDataQueryRequest.class));
    }

    @Test
    void pageQuery_unknownDataSourceId_rejected400() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);

        assertThatThrownBy(() -> controller.queryPageDataSource("product-page", "ds-ghost", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未声明数据源");
    }

    @Test
    void pageQuery_onNonPage_rejected400() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);

        assertThatThrownBy(() -> controller.queryPageDataSource("emp_view", "ds-products", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不是自定义页面");
    }

    // ---------- filter 白名单 ----------

    @Test
    void flatFilter_withinWhitelist_passesThrough() {
        BizDataQueryRequest req = req("{\"dept\":\"IT\"}");

        R<BizDataPageVO> result = controller.queryPageDataSource("product-page", "ds-products", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).queryData(eq("ds_ref_001"), eq(req));
    }

    @Test
    void flatFilter_outsideWhitelist_rejected400() {
        BizDataQueryRequest req = req("{\"hack\":\"x\"}");

        assertThatThrownBy(() -> controller.queryPageDataSource("product-page", "ds-products", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: hack");
    }

    @Test
    void structuredFilter_columnsOutsideWhitelist_rejected400() {
        BizDataQueryRequest req = req(
                "{\"logic\":\"AND\",\"conditions\":[{\"column\":\"evil\",\"op\":\"eq\",\"value\":\"x\"}]}");

        assertThatThrownBy(() -> controller.queryPageDataSource("product-page", "ds-products", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: evil");
    }

    @Test
    void dataSourceWithoutSearchFields_filterUnrestricted() {
        BizDataQueryRequest req = req("{\"anything\":\"x\"}");

        R<BizDataPageVO> result = controller.queryPageDataSource("product-page", "ds-open", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).queryData(eq("ds_ref_002"), eq(req));
    }

    private BizDataQueryRequest req(String filter) {
        BizDataQueryRequest r = new BizDataQueryRequest();
        r.setFilter(filter);
        return r;
    }
}
