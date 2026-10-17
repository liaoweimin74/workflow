package com.workflow.engine.page;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageTemplate;
import com.workflow.engine.page.repository.PageTemplateRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * 页面模板服务。
 * 模板为页面 schema 的只读快照：创建后仅可覆盖更新（save-upsert 语义）与改名/改 key，
 * 无版本、无发布状态；删除为硬删除（模板不参与运行时引用）。
 */
@Service
public class PageTemplateService {

    private final PageTemplateRepository templateRepository;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;

    public PageTemplateService(PageTemplateRepository templateRepository,
                               TenantProvider tenantProvider,
                               ObjectMapper objectMapper) {
        this.templateRepository = templateRepository;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
    }

    /** 模板形态常量 */
    public static final String KIND_FULL = "full";
    public static final String KIND_SKELETON = "skeleton";

    /** kind 合法性归一：null → full（存量兼容），非法值拒绝 */
    private String normalizeKind(String kind) {
        if (kind == null || kind.isBlank()) {
            return KIND_FULL;
        }
        if (!kind.equals(KIND_FULL) && !kind.equals(KIND_SKELETON)) {
            throw new BusinessException(400, "模板形态非法: " + kind);
        }
        return kind;
    }

    /**
     * 创建模板。
     *
     * @throws BusinessException key 已存在 / schema 不是合法页面 schema JSON / kind 非法
     */
    @Transactional
    public PageTemplate create(String name, String key, String schema, String kind, String createdBy) {
        String tenantId = tenantProvider.getTenantId();
        if (templateRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new BusinessException(400, "模板 key 已存在: " + key);
        }
        validateSchemaJson(schema);

        PageTemplate template = new PageTemplate();
        template.setId(UUID.randomUUID().toString().replace("-", ""));
        template.setTenantId(tenantId);
        template.setName(name);
        template.setKey(key);
        template.setSchema(schema);
        template.setSchemaVersion(1);
        template.setKind(normalizeKind(kind));
        template.setCreatedBy(createdBy);
        return templateRepository.save(template);
    }

    /**
     * 按 key upsert：存在则覆盖 schema/name/kind（另存为模板的「覆盖更新」路径），不存在则创建。
     */
    @Transactional
    public PageTemplate saveByKey(String name, String key, String schema, String kind, String createdBy) {
        String tenantId = tenantProvider.getTenantId();
        validateSchemaJson(schema);
        Optional<PageTemplate> existing = templateRepository.findByTenantIdAndKey(tenantId, key);
        if (existing.isEmpty()) {
            return create(name, key, schema, kind, createdBy);
        }
        PageTemplate template = existing.get();
        template.setName(name);
        template.setSchema(schema);
        template.setKind(normalizeKind(kind));
        return templateRepository.save(template);
    }

    /**
     * 按 key upsert 并报告是否新建（bundle 导入用）。
     * 导入不做 refId 环境校验：模板是资产库里的骨架/快照，未绑定条目（骨架槽位 refId 为空、
     * 或全量模板携带目标环境不存在的 refId）允许入库；数据源到位的强制点在「用模板新建页面」实例化环节。
     */
    @Transactional
    public UpsertResult upsertByKey(String name, String key, String schema, String kind, String createdBy) {
        String tenantId = tenantProvider.getTenantId();
        Optional<PageTemplate> existing = templateRepository.findByTenantIdAndKey(tenantId, key);
        validateSchemaJson(schema);
        if (existing.isPresent()) {
            PageTemplate template = existing.get();
            template.setName(name);
            template.setSchema(schema);
            template.setKind(normalizeKind(kind));
            templateRepository.save(template);
            return new UpsertResult(template, false);
        }
        return new UpsertResult(create(name, key, schema, kind, createdBy), true);
    }

    /** upsert 结果：实体 + 是否新建 */
    public record UpsertResult(PageTemplate template, boolean created) {}

    /**
     * 更新模板（name/key/schema/kind，null 字段不更新）。
     */
    @Transactional
    public PageTemplate update(String id, String name, String key, String schema, String kind) {
        String tenantId = tenantProvider.getTenantId();
        PageTemplate current = templateRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "模板不存在: " + id));
        if (key != null && !key.equals(current.getKey())
                && templateRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new BusinessException(400, "模板 key 已存在: " + key);
        }
        if (schema != null) {
            validateSchemaJson(schema);
            current.setSchema(schema);
        }
        if (name != null) {
            current.setName(name);
        }
        if (key != null) {
            current.setKey(key);
        }
        if (kind != null) {
            current.setKind(normalizeKind(kind));
        }
        return templateRepository.save(current);
    }

    public PageTemplate getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return templateRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "模板不存在: " + id));
    }

    public Page<PageTemplate> list(String name, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        if (name != null && !name.isBlank()) {
            return templateRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, name, pageable);
        }
        return templateRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
    }

    /**
     * 删除模板（硬删除）。
     */
    @Transactional
    public void delete(String id) {
        String tenantId = tenantProvider.getTenantId();
        PageTemplate template = templateRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "模板不存在: " + id));
        templateRepository.delete(template);
    }

    /** 模板 schema 必须是可解析的 JSON 对象（rule/option/dataSources/actions 由前端实例化时校验） */
    private void validateSchemaJson(String schema) {
        if (schema == null || schema.isBlank()) {
            throw new BusinessException(400, "模板 schema 不能为空");
        }
        try {
            JsonNode root = objectMapper.readTree(schema);
            if (!root.isObject()) {
                throw new BusinessException(400, "模板 schema 必须为 JSON 对象");
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(400, "模板 schema JSON 解析失败");
        }
    }
}
