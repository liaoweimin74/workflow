package com.workflow.api.controller;

import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * DataSourceController 接口测试。
 * 验证数据源管理接口的只读限制。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DataSourceReadOnlyIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DataSourceDefinitionService dataSourceService;

    @MockBean
    private TenantProvider tenantProvider;

    @BeforeEach
    void setUp() {
        // Mock tenant provider to return a default tenant
        org.mockito.Mockito.when(tenantProvider.getTenantId()).thenReturn("test-tenant");
    }

    @Test
    void createDataSource_shouldReturn404() throws Exception {
        // When & Then - POST method should not exist (returns 404)
        mockMvc.perform(post("/api/v1/data-sources")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Test\",\"type\":\"FORM\",\"formKey\":\"test\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void updateDataSource_shouldReturn404() throws Exception {
        // When & Then - PUT method should not exist (returns 404)
        mockMvc.perform(put("/api/v1/data-sources/test-id")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Updated\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteDataSource_shouldReturn404() throws Exception {
        // When & Then - DELETE method should not exist (returns 404)
        mockMvc.perform(delete("/api/v1/data-sources/test-id"))
                .andExpect(status().isNotFound());
    }

    @Test
    void listDataSources_shouldReturn200() throws Exception {
        // When & Then - GET method should work
        mockMvc.perform(get("/api/v1/data-sources"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void getDataSourceById_shouldReturn200() throws Exception {
        // Given - Create a data source through service (simulating system auto-creation)
        DataSourceDefinition ds = dataSourceService.create(
                "测试数据源", "FORM", "test-form", null, null);
        dataSourceService.enable(ds.getId());

        // When & Then - GET by ID should work
        mockMvc.perform(get("/api/v1/data-sources/" + ds.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.name").value("测试数据源 数据源"));
    }

    @Test
    void enableDataSource_shouldReturn404() throws Exception {
        // When & Then - POST /{id}/enable should not exist (returns 404)
        mockMvc.perform(post("/api/v1/data-sources/test-id/enable"))
                .andExpect(status().isNotFound());
    }

    @Test
    void disableDataSource_shouldReturn404() throws Exception {
        // When & Then - POST /{id}/disable should not exist (returns 404)
        mockMvc.perform(post("/api/v1/data-sources/test-id/disable"))
                .andExpect(status().isNotFound());
    }
}