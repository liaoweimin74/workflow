package com.workflow.engine.page;

import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * ViewDataSourceMigrator 单元测试（对齐 Task 6）：
 * 同名 FORM 数据源复用；无同名创建并直接 ENABLED（命名 {@code <表单名> 数据源}）；
 * 表单无 PUBLISHED 版本或非 BUSINESS → 跳过记日志不影响其他页；
 * 幂等（已回填不处理）；逐页面独立事务（单页异常不影响其他页）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ViewDataSourceMigratorTest {

    private static final String TENANT_ID = "tenant-a";

    @Mock private PageDefinitionRepository pageDefRepository;
    @Mock private DataSourceDefinitionRepository dsRepository;
    @Mock private FormDefinitionRepository formDefRepository;
    @Mock private TransactionTemplate transactionTemplate;
    @Mock private TransactionStatus txStatus;

    private ViewDataSourceMigrator migrator;

    @BeforeEach
    void setUp() {
        // TransactionTemplate 直接执行回调，模拟独立事务边界
        when(transactionTemplate.execute(any())).thenAnswer(inv -> {
            TransactionCallback<?> cb = inv.getArgument(0);
            return cb.doInTransaction(txStatus);
        });
        migrator = new ViewDataSourceMigrator(pageDefRepository, dsRepository,
                formDefRepository, transactionTemplate);
    }

    private PageDefinition viewPage(String id, String formKey) {
        PageDefinition p = new PageDefinition();
        p.setId(id);
        p.setTenantId(TENANT_ID);
        p.setType("VIEW");
        p.setFormKey(formKey);
        return p;
    }

    private FormDefinition businessForm(String key, String name) {
        FormDefinition f = new FormDefinition();
        f.setId("form-" + key);
        f.setTenantId(TENANT_ID);
        f.setKey(key);
        f.setName(name);
        f.setType("BUSINESS");
        f.setStatus("PUBLISHED");
        return f;
    }

    private DataSourceDefinition formDs(String id, String name, String status) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(id);
        ds.setTenantId(TENANT_ID);
        ds.setName(name);
        ds.setType("FORM");
        ds.setStatus(status);
        return ds;
    }

    private void stubPublished(String key, FormDefinition form) {
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, key, "PUBLISHED")).thenReturn(Optional.ofNullable(form));
    }

    // ==================== 场景 1：存在同名 FORM 数据源 → 复用，不新建 ====================

    @Test
    void migrate_reusesExistingFormDataSource_withoutCreatingNew() {
        PageDefinition page = viewPage("p1", "leave");
        when(pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull("VIEW"))
                .thenReturn(List.of(page));
        stubPublished("leave", businessForm("leave", "请假"));
        DataSourceDefinition existing = formDs("ds-1", "请假 数据源", "ENABLED");
        when(dsRepository.findByTenantIdAndTypeAndName(TENANT_ID, "FORM", "请假 数据源"))
                .thenReturn(Optional.of(existing));

        migrator.migrate();

        assertEquals("ds-1", page.getDataSourceId());
        verify(dsRepository, never()).save(any(DataSourceDefinition.class));
        verify(pageDefRepository).save(page);
    }

    // ==================== 场景 2：无同名 → 创建 FORM 数据源，命名 <表单名> 数据源，直接 ENABLED ====================

    @Test
    void migrate_createsNewFormDataSource_whenNoSameName() {
        PageDefinition page = viewPage("p1", "leave");
        when(pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull("VIEW"))
                .thenReturn(List.of(page));
        stubPublished("leave", businessForm("leave", "请假"));
        when(dsRepository.findByTenantIdAndTypeAndName(TENANT_ID, "FORM", "请假 数据源"))
                .thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        migrator.migrate();

        ArgumentCaptor<DataSourceDefinition> captor = ArgumentCaptor.forClass(DataSourceDefinition.class);
        verify(dsRepository).save(captor.capture());
        DataSourceDefinition created = captor.getValue();
        assertEquals("FORM", created.getType());
        assertEquals("leave", created.getFormKey());
        assertEquals("ENABLED", created.getStatus());
        assertEquals("请假 数据源", created.getName());
        assertEquals(TENANT_ID, created.getTenantId());
        assertNotNull(created.getId());
        assertEquals(created.getId(), page.getDataSourceId());
        verify(pageDefRepository).save(page);
    }

    // ==================== 场景 3：表单无 PUBLISHED 版本 → 跳过该页记日志，不影响其他页 ====================

    @Test
    void migrate_skipsUnpublishedForm_withoutBlockingOthers() {
        PageDefinition draftPage = viewPage("p1", "draft-form");
        PageDefinition okPage = viewPage("p2", "leave");
        when(pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull("VIEW"))
                .thenReturn(List.of(draftPage, okPage));
        stubPublished("draft-form", null);
        stubPublished("leave", businessForm("leave", "请假"));
        when(dsRepository.findByTenantIdAndTypeAndName(TENANT_ID, "FORM", "请假 数据源"))
                .thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        migrator.migrate();

        assertNull(draftPage.getDataSourceId(), "未发布表单对应页面必须跳过");
        assertNotNull(okPage.getDataSourceId());
        verify(pageDefRepository).save(okPage);
        verify(pageDefRepository, never()).save(draftPage);
    }

    // ==================== 场景 4：幂等——dataSourceId 已填充的页不再处理 ====================

    @Test
    void migrate_isIdempotent_secondRunNoOp() {
        when(pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull("VIEW"))
                .thenReturn(List.of());

        migrator.migrate();
        migrator.migrate();

        verify(dsRepository, never()).save(any(DataSourceDefinition.class));
        verify(pageDefRepository, never()).save(any(PageDefinition.class));
    }

    // ==================== 场景 5：逐页独立事务——一页异常不影响其他页 ====================

    @Test
    void migrate_isolatesPageFailures_perPageTransaction() {
        PageDefinition badPage = viewPage("p1", "boom");
        PageDefinition okPage = viewPage("p2", "leave");
        when(pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull("VIEW"))
                .thenReturn(List.of(badPage, okPage));
        when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, "boom", "PUBLISHED")).thenThrow(new RuntimeException("db down"));
        stubPublished("leave", businessForm("leave", "请假"));
        when(dsRepository.findByTenantIdAndTypeAndName(TENANT_ID, "FORM", "请假 数据源"))
                .thenReturn(Optional.empty());
        when(dsRepository.save(any(DataSourceDefinition.class))).thenAnswer(inv -> inv.getArgument(0));

        migrator.migrate();

        assertNull(badPage.getDataSourceId(), "失败页保持未迁移");
        assertNotNull(okPage.getDataSourceId(), "正常页必须完成迁移");
        verify(transactionTemplate, times(2)).execute(any());
    }
}
