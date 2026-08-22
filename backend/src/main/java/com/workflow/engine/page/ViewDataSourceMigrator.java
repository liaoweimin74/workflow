package com.workflow.engine.page;

import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 存量视图自动迁移：启动时幂等执行。
 * 扫描 {@code type=VIEW AND formKey 非空 AND dataSourceId 为空} 的页面，
 * 按命名约定（{@code <表单名> 数据源}）复用或创建 FORM 数据源并直接置 ENABLED，
 * 随后回填页面 dataSourceId。
 * 前提：绑定表单存在 PUBLISHED 版本且类型为 BUSINESS（业务表单）。
 * 不满足条件的页面跳过并记警告日志；逐页面独立事务，单页失败不影响其他页面与应用启动。
 */
@Component
public class ViewDataSourceMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ViewDataSourceMigrator.class);

    private static final String TYPE_VIEW = "VIEW";
    private static final String TYPE_FORM = "FORM";
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String TYPE_BUSINESS = "BUSINESS";

    private final PageDefinitionRepository pageDefRepository;
    private final DataSourceDefinitionRepository dsRepository;
    private final FormDefinitionRepository formDefRepository;
    private final TransactionTemplate transactionTemplate;

    public ViewDataSourceMigrator(PageDefinitionRepository pageDefRepository,
                                  DataSourceDefinitionRepository dsRepository,
                                  FormDefinitionRepository formDefRepository,
                                  TransactionTemplate transactionTemplate) {
        this.pageDefRepository = pageDefRepository;
        this.dsRepository = dsRepository;
        this.formDefRepository = formDefRepository;
        this.transactionTemplate = transactionTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        migrate();
    }

    /** 幂等迁移：已回填 dataSourceId 的页面不会被扫描到；二次运行为空操作。 */
    public void migrate() {
        List<PageDefinition> pending = pageDefRepository.findByTypeAndFormKeyNotNullAndDataSourceIdNull(TYPE_VIEW);
        if (pending.isEmpty()) {
            return;
        }
        log.info("视图存量数据源迁移开始: 待迁移页面 {} 个", pending.size());

        // 启动期无租户上下文，按页面自身 tenantId 分组处理
        Map<String, List<PageDefinition>> byTenant = pending.stream()
                .collect(Collectors.groupingBy(PageDefinition::getTenantId));

        for (Map.Entry<String, List<PageDefinition>> entry : byTenant.entrySet()) {
            String tenantId = entry.getKey();
            for (PageDefinition page : entry.getValue()) {
                try {
                    transactionTemplate.execute(status -> {
                        migratePage(tenantId, page);
                        return null;
                    });
                } catch (Exception e) {
                    log.error("视图迁移失败 page={} formKey={}，不影响其他页面", page.getId(), page.getFormKey(), e);
                }
            }
        }
    }

    /** 单页迁移：复用或创建 FORM 数据源并回填 dataSourceId。 */
    private void migratePage(String tenantId, PageDefinition page) {
        String formKey = page.getFormKey();

        FormDefinition form = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED")
                .orElse(null);
        if (form == null) {
            log.warn("跳过页面 {}: 表单 {} 无已发布版本", page.getId(), formKey);
            return;
        }
        if (!TYPE_BUSINESS.equals(form.getType())) {
            log.warn("跳过页面 {}: 表单 {} 非业务表单（type={}），无法迁移为 FORM 数据源",
                    page.getId(), formKey, form.getType());
            return;
        }

        String dsName = form.getName() + " 数据源";
        DataSourceDefinition ds = dsRepository.findByTenantIdAndTypeAndName(tenantId, TYPE_FORM, dsName)
                .orElseGet(() -> createEnabledFormDataSource(tenantId, formKey, dsName));
        if (!STATUS_ENABLED.equals(ds.getStatus())) {
            ds.setStatus(STATUS_ENABLED);
            ds = dsRepository.save(ds);
        }

        page.setDataSourceId(ds.getId());
        pageDefRepository.save(page);
        log.info("页面 {} 已迁移到数据源 {}（{}）", page.getId(), dsName, ds.getId());
    }

    private DataSourceDefinition createEnabledFormDataSource(String tenantId, String formKey, String dsName) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString().replace("-", ""));
        ds.setTenantId(tenantId);
        ds.setName(dsName);
        ds.setType(TYPE_FORM);
        ds.setFormKey(formKey);
        ds.setStatus(STATUS_ENABLED);
        return dsRepository.save(ds);
    }
}
