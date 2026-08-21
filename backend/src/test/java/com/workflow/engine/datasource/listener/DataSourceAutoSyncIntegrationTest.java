package com.workflow.engine.datasource.listener;

import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.entity.FormDefinition;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 数据源自动同步集成测试。
 * 测试业务表单创建时自动创建数据源的完整流程。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DataSourceAutoSyncIntegrationTest {

    @Autowired
    private FormDefinitionService formDefinitionService;

    @Autowired
    private DataSourceDefinitionRepository dsRepository;

    @Test
    void createBusinessForm_autoCreatesDataSource() {
        // Given
        String formName = "测试业务表单";
        String formKey = "test-biz-form";

        // When
        FormDefinition form = formDefinitionService.create(formName, formKey, "BUSINESS");

        // Then
        assertThat(form.getId()).isNotNull();
        assertThat(form.getName()).isEqualTo(formName);
        assertThat(form.getKey()).isEqualTo(formKey);
        assertThat(form.getType()).isEqualTo("BUSINESS");

        // 验证数据源已自动创建
        var dataSource = dsRepository.findByTenantIdAndFormKey(form.getTenantId(), formKey);
        assertThat(dataSource).isPresent();

        DataSourceDefinition ds = dataSource.get();
        assertThat(ds.getName()).isEqualTo(formName + " 数据源");
        assertThat(ds.getType()).isEqualTo("FORM");
        assertThat(ds.getFormKey()).isEqualTo(formKey);
        assertThat(ds.getFormId()).isEqualTo(form.getId());
        assertThat(ds.getStatus()).isEqualTo("ENABLED");
        assertThat(ds.getCreatedBy()).isEqualTo("system");
    }

    @Test
    void updateBusinessForm_updatesDataSourceName() {
        // Given
        String formName = "原始表单名称";
        String formKey = "update-test-form";
        FormDefinition form = formDefinitionService.create(formName, formKey, "BUSINESS");

        // When
        String newName = "更新后的表单名称";
        formDefinitionService.update(form.getId(), newName, null, null, null);

        // Then
        var dataSource = dsRepository.findByTenantIdAndFormKey(form.getTenantId(), formKey);
        assertThat(dataSource).isPresent();
        assertThat(dataSource.get().getName()).isEqualTo(newName + " 数据源");
    }

    @Test
    void deleteBusinessForm_deletesDataSource() {
        // Given
        String formName = "待删除表单";
        String formKey = "delete-test-form";
        FormDefinition form = formDefinitionService.create(formName, formKey, "BUSINESS");

        // 确认数据源已创建
        var dataSourceBefore = dsRepository.findByTenantIdAndFormKey(form.getTenantId(), formKey);
        assertThat(dataSourceBefore).isPresent();

        // When
        formDefinitionService.delete(form.getId());

        // Then
        var dataSourceAfter = dsRepository.findByTenantIdAndFormKey(form.getTenantId(), formKey);
        assertThat(dataSourceAfter).isEmpty();
    }
}