package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageQueryController 单元测试。
 *
 * <p>验证视图数据查询的 filter 白名单校验：
 * - 扁平格式 {@code {"col":"value"}} 按列名校验（既有行为）
 * - 结构化格式 {@code {"logic":"AND","conditions":[{"column","op","value"}]}}
 *   按 conditions[].column 校验（与前端 PageRenderer.buildFilter 输出对齐）
 */
class PageQueryControllerTest {

    private PageDefinitionService pageDefService;
    private BizDataService bizDataService;
    private PageQueryController controller;

    /** 视图 schema：声明 name/dept 两个可查询字段 */
    private static final String SCHEMA = """
            {"searchFields":[
              {"key":"name","label":"姓名","matchType":"like"},
              {"key":"dept","label":"部门","matchType":"eq"}
            ],"columns":[]}
            """;

    @BeforeEach
    void setUp() {
        pageDefService = mock(PageDefinitionService.class);
        bizDataService = mock(BizDataService.class);
        controller = new PageQueryController(pageDefService, bizDataService, new ObjectMapper());

        PageDefinition view = new PageDefinition();
        view.setType("VIEW");
        view.setFormKey("emp_profile");
        view.setSchema(SCHEMA);
        when(pageDefService.getPublishedByKey("emp_view")).thenReturn(view);
        when(bizDataService.query(anyString(), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO());
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

    private BizDataQueryRequest req(String filter) {
        BizDataQueryRequest r = new BizDataQueryRequest();
        r.setFilter(filter);
        return r;
    }
}
