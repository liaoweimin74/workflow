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
 * - update: 原地更新（不创建新版本，不改变状态）
 * - publish: 草稿直接发布（同一记录改 status=PUBLISHED），旧 PUBLISHED 降为 ARCHIVED
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
     * 更新表单定义（原地更新，不创建新版本）。
     * 直接在当前记录上更新 name、key、schema，无论 DRAFT 还是 PUBLISHED 状态。
     *
     * @param id     表单定义 ID
     * @param name   表单名称（null 表示不更新）
     * @param key    表单 key（null 表示不更新）
     * @param schema 新的 schema JSON（null 表示不更新）
     * @return 更新后的表单定义
     */
    @Transactional
    public FormDefinition update(String id, String name, String key, String schema) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition current = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (name != null) {
            current.setName(name);
        }
        if (key != null) {
            current.setKey(key);
        }
        if (schema != null) {
            current.setSchema(schema);
        }
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

        if ("PUBLISHED".equals(formDef.getStatus())) {
            throw new BusinessException(400, "已发布的表单不能删除");
        }

        formDef.setStatus("ARCHIVED");
        formDefRepository.save(formDef);
    }

    /**
     * 发布表单定义（草稿直接发布，不创建新记录）。
     * 将当前 DRAFT 记录状态改为 PUBLISHED，旧 PUBLISHED 降为 ARCHIVED。
     * 发布前校验 schema 是否与上次发布相同，相同则拒绝发布。
     *
     * @param id 表单定义 ID（DRAFT 版本）
     * @return 发布后的表单定义（同一条记录，状态改为 PUBLISHED）
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

        // 旧 PUBLISHED 降为 ARCHIVED
        lastPublished.ifPresent(old -> {
            old.setStatus("ARCHIVED");
            formDefRepository.save(old);
        });

        // 草稿直接发布：同一记录改状态，不创建新记录
        draft.setStatus("PUBLISHED");
        draft.setPublishedVersion(draft.getVersion());
        return formDefRepository.save(draft);
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
