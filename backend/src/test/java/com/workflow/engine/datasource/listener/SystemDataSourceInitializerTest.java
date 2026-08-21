package com.workflow.engine.datasource.listener;

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
 * SystemDataSourceInitializer 单元测试。
 * 测试系统启动时自动创建 SYSTEM 类型数据源的逻辑。
 */
@ExtendWith(MockitoExtension.class)
class SystemDataSourceInitializerTest {

    @Mock
    private DataSourceDefinitionRepository dsRepository;

    @InjectMocks
    private SystemDataSourceInitializer initializer;

    @BeforeEach
    void setUp() {
        reset(dsRepository);
    }

    @Test
    void init_createsDeptTreeAndUserTreeDataSources() {
        // Given
        when(dsRepository.findByTenantIdAndSourceKey("system", "dept-tree")).thenReturn(Optional.empty());
        when(dsRepository.findByTenantIdAndSourceKey("system", "user-tree")).thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(invocation -> {
            DataSourceDefinition ds = invocation.getArgument(0);
            ds.setId("generated-id");
            return ds;
        });

        // When
        initializer.init();

        // Then
        ArgumentCaptor<DataSourceDefinition> captor = ArgumentCaptor.forClass(DataSourceDefinition.class);
        verify(dsRepository, times(2)).save(captor.capture());

        assertThat(captor.getAllValues()).hasSize(2);

        DataSourceDefinition deptDs = captor.getAllValues().get(0);
        assertThat(deptDs.getTenantId()).isEqualTo("system");
        assertThat(deptDs.getName()).isEqualTo("部门树数据源");
        assertThat(deptDs.getType()).isEqualTo("SYSTEM");
        assertThat(deptDs.getSourceKey()).isEqualTo("dept-tree");
        assertThat(deptDs.getStatus()).isEqualTo("ENABLED");

        DataSourceDefinition userDs = captor.getAllValues().get(1);
        assertThat(userDs.getTenantId()).isEqualTo("system");
        assertThat(userDs.getName()).isEqualTo("用户树数据源");
        assertThat(userDs.getType()).isEqualTo("SYSTEM");
        assertThat(userDs.getSourceKey()).isEqualTo("user-tree");
        assertThat(userDs.getStatus()).isEqualTo("ENABLED");
    }

    @Test
    void init_skipsIfDataSourcesExist() {
        // Given
        DataSourceDefinition existingDept = new DataSourceDefinition();
        existingDept.setId("existing-dept");
        DataSourceDefinition existingUser = new DataSourceDefinition();
        existingUser.setId("existing-user");

        when(dsRepository.findByTenantIdAndSourceKey("system", "dept-tree")).thenReturn(Optional.of(existingDept));
        when(dsRepository.findByTenantIdAndSourceKey("system", "user-tree")).thenReturn(Optional.of(existingUser));

        // When
        initializer.init();

        // Then
        verify(dsRepository, never()).save(any());
    }

    @Test
    void init_createsOnlyMissingDataSources() {
        // Given
        DataSourceDefinition existingDept = new DataSourceDefinition();
        existingDept.setId("existing-dept");
        when(dsRepository.findByTenantIdAndSourceKey("system", "dept-tree")).thenReturn(Optional.of(existingDept));
        when(dsRepository.findByTenantIdAndSourceKey("system", "user-tree")).thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(invocation -> {
            DataSourceDefinition ds = invocation.getArgument(0);
            ds.setId("generated-id");
            return ds;
        });

        // When
        initializer.init();

        // Then
        ArgumentCaptor<DataSourceDefinition> captor = ArgumentCaptor.forClass(DataSourceDefinition.class);
        verify(dsRepository, times(1)).save(captor.capture());

        DataSourceDefinition userDs = captor.getValue();
        assertThat(userDs.getSourceKey()).isEqualTo("user-tree");
        assertThat(userDs.getName()).isEqualTo("用户树数据源");
    }
}