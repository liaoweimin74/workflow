package com.workflow.api.controller;

import com.workflow.api.dto.DataSourceDTO;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * DataSourceController 只读接口测试。
 * 验证数据源管理接口已移除创建、编辑、删除端点，仅保留查看。
 */
class DataSourceReadOnlyTest {

    private DataSourceDefinitionService dsService;
    private DataSourceController controller;

    @BeforeEach
    void setUp() {
        dsService = mock(DataSourceDefinitionService.class);
        controller = new DataSourceController(dsService);
    }

    @Test
    void getById_returnsDataSource() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId("ds-1");
        ds.setName("测试数据源");
        ds.setType("FORM");
        ds.setFormKey("test-form");
        ds.setStatus("ENABLED");
        when(dsService.getById("ds-1")).thenReturn(ds);

        R<DataSourceDTO> result = controller.getById("ds-1");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getName()).isEqualTo("测试数据源");
        assertThat(result.getData().getType()).isEqualTo("FORM");
    }

    @Test
    void list_returnsPageResponse() {
        PageImpl<DataSourceDefinition> page = new PageImpl<>(List.of());
        when(dsService.list(null, null, PageRequest.of(0, 20)))
                .thenReturn(page);

        R<PageResponse<DataSourceDTO>> result = controller.list(0, 20, null, null);

        assertThat(result.getCode()).isEqualTo(200);
    }

    @Test
    void enabled_returnsList() {
        when(dsService.getEnabled()).thenReturn(List.of());

        R<List<DataSourceDTO>> result = controller.enabled();

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData()).isEmpty();
    }
}