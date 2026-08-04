package com.workflow.engine.form;

import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.common.exception.BusinessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * 表单定义服务。
 * 管理表单定义的 CRUD、版本管理和发布流程。
 *
 * 版本管理策略：
 * - create: 创建 version=1, status=DRAFT 的记录
 * - update: 原地更新 DRAFT（不创建新版本）；若为 PUBLISHED 则创建 DRAFT 副本
 * - publish: 创建新版本记录（version+1, status=PUBLISHED），旧 PUBLISHED 降为 ARCHIVED
 * - delete: 软删除，状态改为 ARCHIVED
 */
@Service
public class FormDefinitionService {

    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;

    public FormDefinitionService(FormDefinitionRepository formDefRepository,
                                 TenantProvider tenantProvider) {
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 创建表单定义。
     *
     * @param name 表单名称
     * @param key  表单唯一标识（同租户内不可重复）
     * @return 创建的表单定义
     * @throws RuntimeException 如果 key 已存在
     */
    @Transactional
    public FormDefinition create(String name, String key) {
        String tenantId = tenantProvider.getTenantId();

        if (formDefRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new RuntimeException("Form key already exists: " + key);
        }

        FormDefinition formDef = new FormDefinition();
        formDef.setId(UUID.randomUUID().toString().replace("-", ""));
        formDef.setTenantId(tenantId);
        formDef.setName(name);
        formDef.setKey(key);
        formDef.setSchema("[]");
        formDef.setVersion(1);
        formDef.setStatus("DRAFT");

        return formDefRepository.save(formDef);
    }

    /**
     * 获取表单定义详情。
     */
    public FormDefinition getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));
    }

    /**
     * 分页查询表单定义列表。
     *
     * @param status 状态过滤（可选）
     * @param name   名称模糊搜索（可选）
     */
    public Page<FormDefinition> list(String status, String name, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();

        if (name != null && !name.isBlank()) {
            return formDefRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, name, pageable);
        } else if (status != null && !status.isBlank()) {
            return formDefRepository.findByTenantIdAndStatusOrderByUpdatedAtDesc(tenantId, status, pageable);
        } else {
            return formDefRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
        }
    }

    /**
     * 更新表单定义 schema（原地更新 DRAFT，不创建新版本）。
     * 如果当前表单为 DRAFT 状态，直接原地更新 schema。
     * 如果当前表单为 PUBLISHED 状态，创建一份 DRAFT 副本（版本号不变）供编辑。
     *
     * @param id     表单定义 ID
     * @param schema 新的 schema JSON
     * @return 更新后的表单定义（DRAFT 状态）
     */
    @Transactional
    public FormDefinition update(String id, String schema) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition current = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if ("PUBLISHED".equals(current.getStatus())) {
            FormDefinition draft = new FormDefinition();
            draft.setId(UUID.randomUUID().toString().replace("-", ""));
            draft.setTenantId(tenantId);
            draft.setName(current.getName());
            draft.setKey(current.getKey());
            draft.setSchema(schema);
            draft.setVersion(current.getVersion());
            draft.setStatus("DRAFT");
            draft.setCreatedBy(current.getCreatedBy());
            return formDefRepository.save(draft);
        }

        current.setSchema(schema);
        return formDefRepository.save(current);
    }

    /**
     * 删除表单定义（软删除，状态改为 ARCHIVED）。
     */
    @Transactional
    public void delete(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        formDef.setStatus("ARCHIVED");
        formDefRepository.save(formDef);
    }

    /**
     * 发布表单定义。
     * 创建新的 PUBLISHED 版本记录（version+1），旧 PUBLISHED 降为 ARCHIVED。
     * 发布前校验 schema 是否与上一已发布版本相同，相同则抛出 BusinessException。
     *
     * @param id 表单定义 ID（DRAFT 版本）
     * @return 发布后的表单定义（新 PUBLISHED 记录）
     * @throws BusinessException 如果 schema 与上一已发布版本相同
     */
    @Transactional
    public FormDefinition publish(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition draft = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (!"DRAFT".equals(draft.getStatus())) {
            throw new RuntimeException("Only DRAFT forms can be published, current status: " + draft.getStatus());
        }

        Optional<FormDefinition> lastPublished = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, draft.getKey(), "PUBLISHED");

        if (lastPublished.isPresent() && Objects.equals(lastPublished.get().getSchema(), draft.getSchema())) {
            throw new BusinessException(400, "表单内容未变化，无需发布");
        }

        Integer maxVersion = formDefRepository.findMaxVersionByTenantIdAndKey(tenantId, draft.getKey());
        int newVersion = (maxVersion != null ? maxVersion : 0) + 1;

        FormDefinition newPublished = new FormDefinition();
        newPublished.setId(UUID.randomUUID().toString().replace("-", ""));
        newPublished.setTenantId(tenantId);
        newPublished.setName(draft.getName());
        newPublished.setKey(draft.getKey());
        newPublished.setSchema(draft.getSchema());
        newPublished.setVersion(newVersion);
        newPublished.setStatus("PUBLISHED");
        newPublished.setPublishedVersion(newVersion);
        newPublished.setCreatedBy(draft.getCreatedBy());

        lastPublished.ifPresent(old -> {
            old.setStatus("ARCHIVED");
            formDefRepository.save(old);
        });

        return formDefRepository.save(newPublished);
    }

    /**
     * 获取表单定义的所有版本列表。
     */
    public List<FormDefinition> getVersions(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        return formDefRepository.findByTenantIdAndKeyOrderByVersionDesc(tenantId, formDef.getKey());
    }

    /**
     * 获取特定版本的表单定义。
     */
    public FormDefinition getByVersion(String id, Integer version) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        return formDefRepository.findByTenantIdAndKeyAndVersion(tenantId, formDef.getKey(), version)
                .orElseThrow(() -> new RuntimeException("Form version not found: " + formDef.getKey() + " v" + version));
    }

    /**
     * 获取已发布版本的表单定义。
     * 如果有多个版本，返回 published_version 对应的版本。
     */
    public FormDefinition getPublishedVersion(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (formDef.getPublishedVersion() == null) {
            throw new RuntimeException("Form definition has no published version: " + id);
        }

        return formDefRepository.findByTenantIdAndKeyAndVersion(tenantId, formDef.getKey(), formDef.getPublishedVersion())
                .orElseThrow(() -> new RuntimeException("Published version not found: " + formDef.getKey() + " v" + formDef.getPublishedVersion()));
    }
}
