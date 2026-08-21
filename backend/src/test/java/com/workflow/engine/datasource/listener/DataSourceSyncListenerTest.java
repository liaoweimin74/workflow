package com.workflow.engine.datasource.listener;

import com.workflow.engine.datasource.event.FormCreatedEvent;
import com.workflow.engine.datasource.event.FormDeletedEvent;
import com.workflow.engine.datasource.event.FormUpdatedEvent;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * DataSourceSyncListener 单元测试。
 * 测试业务表单事件触发数据源自动同步的逻辑。
 */
@ExtendWith(MockitoExtension.class)
class DataSourceSyncListenerTest {

    @Mock
    private DataSourceDefinitionRepository dsRepository;

    @InjectMocks
    private DataSourceSyncListener listener;

    private static final String TENANT_ID = "tenant-1";
    private static final String FORM_ID = "form-123";
    private static final String FORM_NAME = "商品表单";
    private static final String FORM_KEY = "product";

    @BeforeEach
    void setUp() {
        reset(dsRepository);
    }

    @Test
    void handleFormCreated_createsNewDataSource() {
        // Given
        FormCreatedEvent event = new FormCreatedEvent(this, FORM_ID, FORM_NAME, FORM_KEY, TENANT_ID);
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(invocation -> {
            DataSourceDefinition ds = invocation.getArgument(0);
            ds.setId("generated-id");
            return ds;
        });

        // When
        listener.handleFormCreated(event);

        // Then
        ArgumentCaptor<DataSourceDefinition> captor = ArgumentCaptor.forClass(DataSourceDefinition.class);
        verify(dsRepository).save(captor.capture());

        DataSourceDefinition saved = captor.getValue();
        assertThat(saved.getTenantId()).isEqualTo(TENANT_ID);
        assertThat(saved.getName()).isEqualTo(FORM_NAME + " 数据源");
        assertThat(saved.getType()).isEqualTo("FORM");
        assertThat(saved.getFormKey()).isEqualTo(FORM_KEY);
        assertThat(saved.getFormId()).isEqualTo(FORM_ID);
        assertThat(saved.getStatus()).isEqualTo("ENABLED");
        assertThat(saved.getCreatedBy()).isEqualTo("system");
    }

    @Test
    void handleFormCreated_skipsIfDataSourceExists() {
        // Given
        FormCreatedEvent event = new FormCreatedEvent(this, FORM_ID, FORM_NAME, FORM_KEY, TENANT_ID);
        DataSourceDefinition existing = new DataSourceDefinition();
        existing.setId("existing-id");
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.of(existing));

        // When
        listener.handleFormCreated(event);

        // Then
        verify(dsRepository, never()).save(any());
    }

    @Test
    void handleFormUpdated_updatesDataSourceName() {
        // Given
        FormUpdatedEvent event = new FormUpdatedEvent(this, FORM_ID, "新商品表单", FORM_KEY, TENANT_ID);
        DataSourceDefinition existing = new DataSourceDefinition();
        existing.setId("existing-id");
        existing.setName("旧商品表单 数据源");
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.of(existing));
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // When
        listener.handleFormUpdated(event);

        // Then
        ArgumentCaptor<DataSourceDefinition> captor = ArgumentCaptor.forClass(DataSourceDefinition.class);
        verify(dsRepository).save(captor.capture());

        DataSourceDefinition saved = captor.getValue();
        assertThat(saved.getName()).isEqualTo("新商品表单 数据源");
    }

    @Test
    void handleFormUpdated_skipsIfNoDataSource() {
        // Given
        FormUpdatedEvent event = new FormUpdatedEvent(this, FORM_ID, FORM_NAME, FORM_KEY, TENANT_ID);
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.empty());

        // When
        listener.handleFormUpdated(event);

        // Then
        verify(dsRepository, never()).save(any());
    }

    @Test
    void handleFormDeleted_deletesDataSource() {
        // Given
        FormDeletedEvent event = new FormDeletedEvent(this, FORM_ID, FORM_KEY, TENANT_ID);
        DataSourceDefinition existing = new DataSourceDefinition();
        existing.setId("existing-id");
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.of(existing));

        // When
        listener.handleFormDeleted(event);

        // Then
        verify(dsRepository).delete(existing);
    }

    @Test
    void handleFormDeleted_skipsIfNoDataSource() {
        // Given
        FormDeletedEvent event = new FormDeletedEvent(this, FORM_ID, FORM_KEY, TENANT_ID);
        when(dsRepository.findByTenantIdAndFormKey(TENANT_ID, FORM_KEY)).thenReturn(Optional.empty());

        // When
        listener.handleFormDeleted(event);

        // Then
        verify(dsRepository, never()).delete(any());
    }
}