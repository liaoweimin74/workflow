package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 页面定义服务。
 * 管理页面（视图 VIEW / 自定义页面 PAGE）的 CRUD 与版本管理。
 *
 * 版本管理策略（对齐 FormDefinitionService）：
 * - create: 创建 version=1, status=DRAFT 的记录
 * - update: 原地更新（不创建新版本，不改变状态）
 * - publish: 由 Task 5 实现（DRAFT → PUBLISHED，旧 PUBLISHED 降 ARCHIVED，不建表）
 * - delete: 软删除，PUBLISHED 拒绝，状态改为 ARCHIVED
 */
@Service
public class PageDefinitionService {

    private final PageDefinitionRepository pageDefRepository;
    private final TenantProvider tenantProvider;

    public PageDefinitionService(PageDefinitionRepository pageDefRepository,
                                 TenantProvider tenantProvider) {
        this.pageDefRepository = pageDefRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 创建页面定义（默认 status=DRAFT, version=1）。
     *
     * @param name    页面名称
     * @param key     页面标识（租户内唯一）
     * @param type    页面类型（VIEW/PAGE，null 或空白默认 VIEW）
     * @param formKey 绑定的业务表单 key（VIEW 用，可空）
     * @return 创建的页面定义
     * @throws BusinessException 如果 key 已存在
     */
    @Transactional
    public PageDefinition create(String name, String key, String type, String formKey) {
        String tenantId = tenantProvider.getTenantId();

        if (pageDefRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new BusinessException(400, "页面 key 已存在: " + key);
        }

        PageDefinition pageDef = new PageDefinition();
        pageDef.setId(UUID.randomUUID().toString().replace("-", ""));
        pageDef.setTenantId(tenantId);
        pageDef.setName(name);
        pageDef.setKey(key);
        pageDef.setType(type == null || type.isBlank() ? "VIEW" : type);
        pageDef.setFormKey(formKey);
        pageDef.setSchema(null);
        pageDef.setVersion(1);
        pageDef.setStatus("DRAFT");

        return pageDefRepository.save(pageDef);
    }

    /**
     * 获取页面定义详情。
     */
    public PageDefinition getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return pageDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));
    }

    /**
     * 按 key 获取页面定义（最新版本记录，用于渲染页加载）。
     */
    public PageDefinition getByKey(String key) {
        String tenantId = tenantProvider.getTenantId();
        return pageDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, key)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + key));
    }

    /**
     * 分页查询页面定义列表。
     *
     * @param status 状态过滤（可选）
     * @param name   名称模糊搜索（可选）
     * @param type   类型过滤（可选：VIEW/PAGE）
     */
    public Page<PageDefinition> list(String status, String name, String type, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        boolean hasType = type != null && !type.isBlank();
        boolean hasName = name != null && !name.isBlank();
        boolean hasStatus = status != null && !status.isBlank();

        if (hasName) {
            if (hasStatus && hasType) {
                return pageDefRepository.findByTenantIdAndNameContainingAndStatusAndTypeOrderByUpdatedAtDesc(tenantId, name, status, type, pageable);
            } else if (hasStatus) {
                return pageDefRepository.findByTenantIdAndNameContainingAndStatusOrderByUpdatedAtDesc(tenantId, name, status, pageable);
            } else if (hasType) {
                return pageDefRepository.findByTenantIdAndNameContainingAndTypeOrderByUpdatedAtDesc(tenantId, name, type, pageable);
            } else {
                return pageDefRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, name, pageable);
            }
        } else if (hasStatus && hasType) {
            return pageDefRepository.findByTenantIdAndStatusAndTypeOrderByUpdatedAtDesc(tenantId, status, type, pageable);
        } else if (hasStatus) {
            return pageDefRepository.findByTenantIdAndStatusOrderByUpdatedAtDesc(tenantId, status, pageable);
        } else if (hasType) {
            return pageDefRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(tenantId, type, pageable);
        } else {
            return pageDefRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
        }
    }

    /**
     * 更新页面定义（原地更新，不创建新版本）。
     * 直接在当前记录上更新 name、key、schema、formKey，无论 DRAFT 还是 PUBLISHED 状态。
     *
     * @param id      页面定义 ID
     * @param name    页面名称（null 表示不更新）
     * @param key     页面 key（null 表示不更新）
     * @param schema  页面 schema JSON（null 表示不更新）
     * @param formKey 绑定表单 key（null 表示不更新）
     * @return 更新后的页面定义
     */
    @Transactional
    public PageDefinition update(String id, String name, String key, String schema, String formKey) {
        String tenantId = tenantProvider.getTenantId();
        PageDefinition current = pageDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));

        if (name != null) {
            current.setName(name);
        }
        if (key != null) {
            current.setKey(key);
        }
        if (schema != null) {
            current.setSchema(schema);
        }
        if (formKey != null) {
            current.setFormKey(formKey);
        }
        return pageDefRepository.save(current);
    }

    /**
     * 删除页面定义（软删除，状态改为 ARCHIVED；已发布页面拒绝删除）。
     */
    @Transactional
    public void delete(String id) {
        String tenantId = tenantProvider.getTenantId();
        PageDefinition pageDef = pageDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));

        if ("PUBLISHED".equals(pageDef.getStatus())) {
            throw new BusinessException(400, "已发布的页面不能删除");
        }

        pageDef.setStatus("ARCHIVED");
        pageDefRepository.save(pageDef);
    }

    /**
     * 获取页面定义的所有版本列表。
     */
    public List<PageDefinition> getVersions(String id) {
        String tenantId = tenantProvider.getTenantId();
        PageDefinition pageDef = pageDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));

        return pageDefRepository.findByTenantIdAndKeyOrderByVersionDesc(tenantId, pageDef.getKey());
    }

    /**
     * 获取已发布版本（按最新 PUBLISHED 记录查找）。
     * 渲染页通过 /pages/{key}/definition 加载已发布配置时使用。
     */
    public PageDefinition getPublishedVersion(String id) {
        String tenantId = tenantProvider.getTenantId();
        PageDefinition pageDef = pageDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));

        return pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, pageDef.getKey(), "PUBLISHED")
                .orElseThrow(() -> new BusinessException(404, "页面未发布: " + pageDef.getKey()));
    }
}