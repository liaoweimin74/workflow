package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageQueryController 单元测试。
 *
 * <p>验证视图数据查询的 filter 白名单校验：
 * - 扁平格式 {@code {"col":"value"}} 按列名校验（既有行为）
 * - 结构化格式 {@code {"logic":"AND","conditions":[{"column","op","value"}]}}
 *   按 conditions[].column 校验（与前端 PageRenderer.buildFilter 输出对齐）
 * <p>PAGE 自定义页面数据源查询：
 * - 按 dataSourceId 解析 refId 后委托 DataSourceDefinitionService.queryData
 * - 未声明的 dataSourceId / 非 PAGE 页面 → 400
 */
class PageQueryControllerTest {

    private PageDefinitionService pageDefService;
    private BizDataService bizDataService;
    private DataSourceDefinitionService dsService;
    private PageQueryController controller;

    /** 视图 schema：声明 name/dept 两个可查询字段 */
    private static final String SCHEMA = """
            {"searchFields":[
              {"key":"name","label":"姓名","matchType":"like"},
              {"key":"dept","label":"部门","matchType":"eq"}
            ],"columns":[]}
            """;

    /** PAGE schema：两个数据源绑定 */
    private static final String PAGE_SCHEMA = """
            {"rule":[{"type":"el-tree","field":"tree1","props":{"dataSourceId":"ds-cats"}},
              {"type":"el-table","field":"table1","props":{"dataSourceId":"ds-products"}}],
             "option":{},
             "dataSources":[
               {"id":"ds-cats","refId":"ds_ref_002"},
               {"id":"ds-products","refId":"ds_ref_001"}],
             "actions":[]}
            """;

    @BeforeEach
    void setUp() {
        pageDefService = mock(PageDefinitionService.class);
        bizDataService = mock(BizDataService.class);
        dsService = mock(DataSourceDefinitionService.class);
        controller = new PageQueryController(pageDefService, bizDataService, dsService, new ObjectMapper());

        PageDefinition view = new PageDefinition();
        view.setType("VIEW");
        view.setFormKey("emp_profile");
        view.setSchema(SCHEMA);
        when(pageDefService.getPublishedByKey("emp_view")).thenReturn(view);

        PageDefinition dsView = new PageDefinition();
        dsView.setType("VIEW");
        dsView.setDataSourceId("ds_workflow_001");
        dsView.setSchema(SCHEMA);
        when(pageDefService.getPublishedByKey("wf_view")).thenReturn(dsView);

        PageDefinition nakedView = new PageDefinition();
        nakedView.setType("VIEW");
        nakedView.setSchema(SCHEMA);
        when(pageDefService.getPublishedByKey("naked_view")).thenReturn(nakedView);

        PageDefinition page = new PageDefinition();
        page.setType("PAGE");
        page.setFormKey(null);
        page.setSchema(PAGE_SCHEMA);
        when(pageDefService.getPublishedByKey("product-page")).thenReturn(page);

        when(bizDataService.query(anyString(), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO());
        when(dsService.queryData(anyString(), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO());
    }

    // ---------- PAGE 数据源查询 ----------

    @Test
    void pageQuery_resolvesDataSourceIdToRefId_delegates() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);

        R<BizDataPageVO> result = controller.queryPageDataSource("product-page", "ds-products", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).queryData(eq("ds_ref_001"), eq(req));
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
    void pageQuery_onViewPage_rejected400() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);

        assertThatThrownBy(() -> controller.queryPageDataSource("emp_view", "ds-products", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不是自定义页面");
    }

    // ---------- 扁平格式（既有行为回归） ----------

    @Test
    void flatFilter_withinWhitelist_passesThrough() {
        BizDataQueryRequest req = req("{\"dept\":\"IT\"}");

        R<BizDataPageVO> result = controller.query("emp_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(bizDataService).query(eq("emp_profile"), eq(req));
    }

    @Test
    void flatFilter_outsideWhitelist_rejected400() {
        BizDataQueryRequest req = req("{\"hack\":\"x\"}");

        assertThatThrownBy(() -> controller.query("emp_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: hack");
    }

    // ---------- 结构化格式（前端 PageRenderer.buildFilter 输出） ----------

    @Test
    void structuredFilter_columnsWithinWhitelist_passesThrough() {
        BizDataQueryRequest req = req(
                "{\"logic\":\"AND\",\"conditions\":[{\"column\":\"dept\",\"op\":\"eq\",\"value\":\"IT\"}]}");

        R<BizDataPageVO> result = controller.query("emp_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(bizDataService).query(eq("emp_profile"), eq(req));
    }

    @Test
    void structuredFilter_withLikeOp_passesThrough() {
        BizDataQueryRequest req = req(
                "{\"logic\":\"AND\",\"conditions\":[{\"column\":\"name\",\"op\":\"like\",\"value\":\"张\"}]}");

        R<BizDataPageVO> result = controller.query("emp_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(bizDataService).query(eq("emp_profile"), eq(req));
    }

    @Test
    void structuredFilter_columnOutsideWhitelist_rejected400() {
        BizDataQueryRequest req = req(
                "{\"logic\":\"AND\",\"conditions\":[{\"column\":\"hack\",\"op\":\"eq\",\"value\":\"x\"}]}");

        assertThatThrownBy(() -> controller.query("emp_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: hack");
    }

    @Test
    void structuredFilter_mixedColumns_partialReject() {
        BizDataQueryRequest req = req(
                "{\"logic\":\"AND\",\"conditions\":[{\"column\":\"dept\",\"op\":\"eq\",\"value\":\"IT\"},"
                        + "{\"column\":\"evil\",\"op\":\"eq\",\"value\":\"x\"}]}");

        assertThatThrownBy(() -> controller.query("emp_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("筛选字段不在页面声明白名单: evil");
    }

    // ---------- 边界 ----------

    @Test
    void blankFilter_passesNull() {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("");

        R<BizDataPageVO> result = controller.query("emp_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(bizDataService).query(eq("emp_profile"), eq(req));
    }

    // ---------- VIEW 数据源协议（dataSourceId） ----------

    @Test
    void viewQuery_withDataSourceId_delegatesToSpi() {
        BizDataQueryRequest req = req("{\"dept\":\"IT\"}");

        R<BizDataPageVO> result = controller.query("wf_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).queryData(eq("ds_workflow_001"), eq(req));
        verify(bizDataService, never()).query(anyString(), any());
    }

    @Test
    void viewQuery_legacyFormKey_fallsBackToBizDataService() {
        BizDataQueryRequest req = req("{\"dept\":\"IT\"}");

        R<BizDataPageVO> result = controller.query("emp_view", req);

        assertThat(result.getCode()).isEqualTo(200);
        verify(bizDataService).query(eq("emp_profile"), eq(req));
        verify(dsService, never()).queryData(anyString(), any());
    }

    @Test
    void viewQuery_noBinding_rejected400() {
        BizDataQueryRequest req = new BizDataQueryRequest();

        assertThatThrownBy(() -> controller.query("naked_view", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未绑定数据源");
    }

    private BizDataQueryRequest req(String filter) {
        BizDataQueryRequest r = new BizDataQueryRequest();
        r.setFilter(filter);
        return r;
    }
}
