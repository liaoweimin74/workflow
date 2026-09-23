package com.workflow.engine.datasource.listener;

import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * 系统结构数据源初始化器。
 * 在系统启动时自动创建 SYSTEM 类型数据源（dept-tree、user-tree）。
 */
@Component
public class SystemDataSourceInitializer {

    private static final Logger log = LoggerFactory.getLogger(SystemDataSourceInitializer.class);
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String TYPE_SYSTEM = "SYSTEM";

    private final DataSourceDefinitionRepository dsRepository;

    public SystemDataSourceInitializer(DataSourceDefinitionRepository dsRepository) {
        this.dsRepository = dsRepository;
    }

    /**
     * 系统启动时初始化 SYSTEM 类型数据源。
     */
    @PostConstruct
    public void init() {
        log.info("开始初始化系统结构数据源...");
        
        initSystemDataSource("dept-tree", "部门树数据源");
        initSystemDataSource("user-tree", "用户树数据源");
        
        log.info("系统结构数据源初始化完成");
    }

    /**
     * 初始化单个系统数据源。
     * 如果已存在则跳过，否则创建新的。
     */
    private void initSystemDataSource(String sourceKey, String name) {
        // 使用默认租户ID（系统数据源对所有租户可用）
        String defaultTenantId = "system";
        
        Optional<DataSourceDefinition> existing = dsRepository
                .findByTenantIdAndSourceKey(defaultTenantId, sourceKey);
        
        if (existing.isPresent()) {
            log.info("系统数据源已存在，跳过创建: sourceKey={}", sourceKey);
            return;
        }

        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString().replace("-", ""));
        ds.setTenantId(defaultTenantId);
        ds.setName(name);
        ds.setType(TYPE_SYSTEM);
        ds.setSourceKey(sourceKey);
        ds.setStatus(STATUS_ENABLED);
        ds.setCreatedBy("system");

        dsRepository.save(ds);
        log.info("创建系统数据源成功: sourceKey={}, name={}", sourceKey, name);
    }
}