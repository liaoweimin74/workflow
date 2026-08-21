package com.workflow.engine.datasource.listener;

import com.workflow.engine.datasource.event.FormCreatedEvent;
import com.workflow.engine.datasource.event.FormDeletedEvent;
import com.workflow.engine.datasource.event.FormUpdatedEvent;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * 数据源同步监听器。
 * 监听业务表单事件，自动创建、更新、删除对应的数据源。
 */
@Component
public class DataSourceSyncListener {

    private static final Logger log = LoggerFactory.getLogger(DataSourceSyncListener.class);
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String TYPE_FORM = "FORM";

    private final DataSourceDefinitionRepository dsRepository;

    public DataSourceSyncListener(DataSourceDefinitionRepository dsRepository) {
        this.dsRepository = dsRepository;
    }

    /**
     * 监听业务表单创建事件，自动创建 FORM 类型数据源。
     */
    @EventListener
    @Transactional
    public void handleFormCreated(FormCreatedEvent event) {
        log.info("收到业务表单创建事件，自动创建数据源: formKey={}, formName={}", 
                event.getFormKey(), event.getFormName());

        // 检查是否已存在关联的数据源
        Optional<DataSourceDefinition> existing = dsRepository
                .findByTenantIdAndFormKey(event.getTenantId(), event.getFormKey());
        
        if (existing.isPresent()) {
            log.info("数据源已存在，跳过创建: formKey={}", event.getFormKey());
            return;
        }

        // 创建新的 FORM 类型数据源
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString().replace("-", ""));
        ds.setTenantId(event.getTenantId());
        ds.setName(event.getFormName() + " 数据源");
        ds.setType(TYPE_FORM);
        ds.setFormKey(event.getFormKey());
        ds.setFormId(event.getFormId());
        ds.setStatus(STATUS_ENABLED);
        ds.setCreatedBy("system");

        dsRepository.save(ds);
        log.info("自动创建数据源成功: id={}, formKey={}", ds.getId(), event.getFormKey());
    }

    /**
     * 监听业务表单更新事件，更新关联的数据源名称。
     */
    @EventListener
    @Transactional
    public void handleFormUpdated(FormUpdatedEvent event) {
        log.info("收到业务表单更新事件，更新数据源: formKey={}, formName={}", 
                event.getFormKey(), event.getFormName());

        Optional<DataSourceDefinition> existing = dsRepository
                .findByTenantIdAndFormKey(event.getTenantId(), event.getFormKey());
        
        if (existing.isPresent()) {
            DataSourceDefinition ds = existing.get();
            ds.setName(event.getFormName() + " 数据源");
            dsRepository.save(ds);
            log.info("更新数据源名称成功: id={}, formKey={}", ds.getId(), event.getFormKey());
        } else {
            log.warn("未找到关联的数据源，无法更新: formKey={}", event.getFormKey());
        }
    }

    /**
     * 监听业务表单删除事件，删除关联的数据源。
     */
    @EventListener
    @Transactional
    public void handleFormDeleted(FormDeletedEvent event) {
        log.info("收到业务表单删除事件，删除数据源: formKey={}", event.getFormKey());

        Optional<DataSourceDefinition> existing = dsRepository
                .findByTenantIdAndFormKey(event.getTenantId(), event.getFormKey());
        
        if (existing.isPresent()) {
            DataSourceDefinition ds = existing.get();
            dsRepository.delete(ds);
            log.info("删除数据源成功: id={}, formKey={}", ds.getId(), event.getFormKey());
        } else {
            log.warn("未找到关联的数据源，无需删除: formKey={}", event.getFormKey());
        }
    }
}