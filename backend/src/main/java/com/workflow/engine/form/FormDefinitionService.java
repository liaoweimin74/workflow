package com.workflow.engine.form;

import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 表单定义服务。
 * 管理表单定义的 CRUD、版本管理和发布流程。
 *
 * 版本管理策略：
 * - create: 创建 version=1, status=DRAFT 的记录
 * - update: 创建新版本记录（version+1, status=DRAFT）
 * - publish: 将当前 DRAFT 版本状态改为 PUBLISHED, 记录 published_version
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
     * 更新表单定义 schema（创建新版本）。
     *
     * @param id     表单定义 ID（当前最新版本）
     * @param schema 新的 schema JSON
     * @return 新版本的表单定义
     */
    @Transactional
    public FormDefinition update(String id, String schema) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition current = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        // 查找该 key 的最大版本号
        Integer maxVersion = formDefRepository.findMaxVersionByTenantIdAndKey(tenantId, current.getKey());
        int newVersion = (maxVersion != null ? maxVersion : 0) + 1;

        FormDefinition newDef = new FormDefinition();
        newDef.setId(UUID.randomUUID().toString().replace("-", ""));
        newDef.setTenantId(tenantId);
        newDef.setName(current.getName());
        newDef.setKey(current.getKey());
        newDef.setSchema(schema);
        newDef.setVersion(newVersion);
        newDef.setStatus("DRAFT");
        newDef.setCreatedBy(current.getCreatedBy());

        return formDefRepository.save(newDef);
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
     * 将当前 DRAFT 版本状态改为 PUBLISHED，并记录 published_version。
     *
     * @param id 表单定义 ID（DRAFT 版本）
     * @return 发布后的表单定义
     */
    @Transactional
    public FormDefinition publish(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (!"DRAFT".equals(formDef.getStatus())) {
            throw new RuntimeException("Only DRAFT forms can be published, current status: " + formDef.getStatus());
        }

        formDef.setStatus("PUBLISHED");
        formDef.setPublishedVersion(formDef.getVersion());

        return formDefRepository.save(formDef);
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
