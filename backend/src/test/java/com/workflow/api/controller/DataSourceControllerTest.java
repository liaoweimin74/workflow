package com.workflow.api.controller;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.domain.R;
import com.workflow.engine.datasource.DataSourceDefinitionService;
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
    private DataSourceController controller;

    @BeforeEach
    void setUp() {
        dsService = mock(DataSourceDefinitionService.class);
        controller = new DataSourceController(dsService);
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
}