package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceDTO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.api.dto.DataSourceSaveRequest;
import com.workflow.common.domain.R;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.form.column.ColumnConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DataSourceController 统一数据访问端点测试：
 * 六端点（metadata / data / data/{rowId} 的 GET+POST+PUT+DELETE）直接委托
 * DataSourceDefinitionService 分发，响应统一 R 封装。
 */
class DataSourceControllerTest {

    private DataSourceDefinitionService dsService;
    private BizDataSupport bizDataSupport;
    private DataSourceController controller;

    @BeforeEach
    void setUp() {
        dsService = mock(DataSourceDefinitionService.class);
        bizDataSupport = mock(BizDataSupport.class);
        controller = new DataSourceController(dsService, bizDataSupport);
    }

    @Test
    void metadata_delegatesAndWraps() {
        ColumnConfig col = new ColumnConfig();
        col.setKey("name");
        col.setLabel("商品名称");
        when(dsService.metadata("ds-1"))
                .thenReturn(new DataSourceMetadata(List.of(col), true));

        R<DataSourceMetadata> result = controller.metadata("ds-1");

        assertThat(result.getData().getColumns()).hasSize(1);
        assertThat(result.getData().getColumns().get(0).getKey()).isEqualTo("name");
        assertThat(result.getData().isWritable()).isTrue();
    }

    @Test
    void queryData_delegates() {
        BizDataPageVO vo = new BizDataPageVO(List.of(), 0, 0, 20);
        when(dsService.queryData(eq("ds-1"), any(BizDataQueryRequest.class))).thenReturn(vo);

        R<BizDataPageVO> result = controller.queryData("ds-1", new BizDataQueryRequest());

        assertThat(result.getData()).isSameAs(vo);
        verify(dsService).queryData(eq("ds-1"), any(BizDataQueryRequest.class));
    }

    @Test
    void getData_delegates() {
        BizDataVO row = new BizDataVO("42", Map.of("name", "苹果"), null, null, null);
        when(dsService.getData("ds-1", "42")).thenReturn(row);

        R<BizDataVO> result = controller.getData("ds-1", "42");

        assertThat(result.getData().getId()).isEqualTo("42");
        assertThat(result.getData().getData().get("name")).isEqualTo("苹果");
    }

    @Test
    void createData_delegatesAndReturnsId() {
        when(dsService.createData(eq("ds-1"), any(Map.class))).thenReturn("100");

        R<String> result = controller.createData("ds-1", Map.of("name", "新商品"));

        assertThat(result.getData()).isEqualTo("100");
        verify(dsService).createData(eq("ds-1"), any(Map.class));
    }

    @Test
    void updateData_delegatesWithVersion() {
        R<Void> result = controller.updateData("ds-1", "42", 1, Map.of("price", 9.9));

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).updateData("ds-1", "42", Map.of("price", 9.9), 1);
    }

    @Test
    void updateData_versionOptional() {
        R<Void> result = controller.updateData("ds-1", "42", null, Map.of("price", 9.9));

        verify(dsService).updateData("ds-1", "42", Map.of("price", 9.9), null);
    }

    @Test
    void deleteData_delegates() {
        R<Void> result = controller.deleteData("ds-1", "42");

        verify(dsService).deleteData("ds-1", "42");
    }

    // ==================== 数据源定义管理端点（create/update/delete/enable/disable） ====================

    private DataSourceSaveRequest saveReq(String name, String type, String formKey, String sourceKey, String params) {
        DataSourceSaveRequest req = new DataSourceSaveRequest();
        req.setName(name);
        req.setType(type);
        req.setFormKey(formKey);
        req.setSourceKey(sourceKey);
        req.setParams(params);
        return req;
    }

    private DataSourceDefinition ds(String id, String name, String type, String status) {
        DataSourceDefinition d = new DataSourceDefinition();
        d.setId(id);
        d.setName(name);
        d.setType(type);
        d.setStatus(status);
        return d;
    }

    @Test
    void create_delegatesAndWraps() {
        DataSourceDefinition created = ds("ds-new", "报表", "SQL", "DRAFT");
        created.setSourceKey("orders-report");
        when(dsService.create("报表", "SQL", null, "orders-report", "{}")).thenReturn(created);

        R<DataSourceDTO> result = controller.create(saveReq("报表", "SQL", null, "orders-report", "{}"));

        assertThat(result.getData().getId()).isEqualTo("ds-new");
        assertThat(result.getData().getType()).isEqualTo("SQL");
        assertThat(result.getData().getSourceKey()).isEqualTo("orders-report");
    }

    @Test
    void update_delegatesAndWraps() {
        DataSourceDefinition updated = ds("ds-1", "改名", "API", "DRAFT");
        updated.setSourceKey("external-stock");
        when(dsService.update("ds-1", "改名", "API", null, "external-stock", null)).thenReturn(updated);

        R<DataSourceDTO> result = controller.update("ds-1", saveReq("改名", "API", null, "external-stock", null));

        assertThat(result.getData().getName()).isEqualTo("改名");
    }

    @Test
    void delete_delegates() {
        R<Void> result = controller.delete("ds-1");

        assertThat(result.getCode()).isEqualTo(200);
        verify(dsService).delete("ds-1");
    }

    @Test
    void enable_delegatesAndWraps() {
        DataSourceDefinition enabled = ds("ds-1", "报表", "SQL", "ENABLED");
        when(dsService.enable("ds-1")).thenReturn(enabled);

        R<DataSourceDTO> result = controller.enable("ds-1");

        assertThat(result.getData().getStatus()).isEqualTo("ENABLED");
    }

    @Test
    void disable_delegatesAndWraps() {
        DataSourceDefinition disabled = ds("ds-1", "报表", "SQL", "DISABLED");
        when(dsService.disable("ds-1")).thenReturn(disabled);

        R<DataSourceDTO> result = controller.disable("ds-1");

        assertThat(result.getData().getStatus()).isEqualTo("DISABLED");
    }
}