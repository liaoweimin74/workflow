package com.workflow.engine.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysClientRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 页面定义服务。
 * 管理页面（视图 VIEW / 自定义页面 PAGE）的 CRUD 与版本管理。
 *
 * 版本管理策略（对齐 FormDefinitionService）：
 * - create: 创建 version=1, status=DRAFT 的记录
 * - update: 原地更新（不创建新版本，不改变状态）
 * - publish: DRAFT → PUBLISHED，旧 PUBLISHED 降 ARCHIVED，不建表；
 *   PageValidator.validateForPublish 校验页面 schema（自定义页面 PAGE 的数据源/组件/动作绑定），
 *   通过后直接持久化（VIEW 视图编译已废弃，不再编译）
 * - delete: 软删除，PUBLISHED 拒绝，状态改为 ARCHIVED
 */
@Service
public class PageDefinitionService {

    private final PageDefinitionRepository pageDefRepository;
    private final TenantProvider tenantProvider;
    private final PageValidator validator;
    private final ObjectMapper objectMapper;
    private final SysClientRepository clientRepository;

    /**
     * 同 key 发布串行化锁（进程内）：findByIdForUpdate 仅锁单行，
     * 同 key 不同 id 的并发发布需要按 key 粒度互斥，防止双 PUBLISHED。
     */
    private final ConcurrentHashMap<String, Object> publishLocks = new ConcurrentHashMap<>();

    public PageDefinitionService(PageDefinitionRepository pageDefRepository,
                                 TenantProvider tenantProvider,
                                 PageValidator validator,
                                 ObjectMapper objectMapper,
                                 SysClientRepository clientRepository) {
        this.pageDefRepository = pageDefRepository;
        this.tenantProvider = tenantProvider;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.clientRepository = clientRepository;
    }

    /**
     * 创建页面定义（默认 status=DRAFT, version=1）。
     *
     * @param name    页面名称
     * @param key     页面标识（租户内唯一）
     * @param type    页面类型（VIEW 已废弃 / PAGE，null 或空白默认 PAGE）
     * @param formKey 绑定的业务表单 key（VIEW 用，可空，遗留字段）
     * @param dataSourceId 绑定的数据源 ID（新协议，可空）
     * @param schema  页面 schema（模板实例化可直接带入；空则待设计器保存）
     * @return 创建的页面定义
     * @throws BusinessException 如果 key 已存在
     */
    @Transactional
    public PageDefinition create(String name, String key, String type, String formKey, String dataSourceId, String schema) {
        String tenantId = tenantProvider.getTenantId();

        if (pageDefRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new BusinessException(400, "页面 key 已存在: " + key);
        }

        PageDefinition pageDef = new PageDefinition();
        pageDef.setId(UUID.randomUUID().toString().replace("-", ""));
        pageDef.setTenantId(tenantId);
        pageDef.setName(name);
        pageDef.setKey(key);
        pageDef.setType(type == null || type.isBlank() ? "PAGE" : type);
        pageDef.setFormKey(formKey);
        pageDef.setDataSourceId(dataSourceId);
        pageDef.setSchema(schema == null || schema.isBlank() ? null : schema);
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
     * 预览：按 key 获取最新定义（VIEW 视图编译已废弃，PAGE 的 schema 即渲染配置，无需编译）。
     */
    public PageDefinition getPreviewByKey(String key) {
        return getByKey(key);
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
     * @param dataSourceId 绑定数据源 ID（null 表示不更新）
     * @return 更新后的页面定义
     */
    @Transactional
    public PageDefinition update(String id, String name, String key, String schema, String formKey, String dataSourceId) {
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
        if (dataSourceId != null) {
            current.setDataSourceId(dataSourceId);
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

    /**
     * 按 key 获取已发布版本（数据查询/渲染入口）。
     * pageKey 未发布或不存在 → 404。
     */
    public PageDefinition getPublishedByKey(String key) {
        String tenantId = tenantProvider.getTenantId();
        return pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, key, "PUBLISHED")
                .orElseThrow(() -> new BusinessException(404, "页面未发布或不存在: " + key));
    }

    /**
     * 发布页面（不建表）。
     * 流程：findByIdForUpdate 悲观锁 → 状态校验（DRAFT/PUBLISHED 可重发，ARCHIVED 拒绝）
     * → 同 key 进程内锁内：内容未变化拒绝（对比同 key 排除自身的最新 PUBLISHED）
     * → validateForPublish 校验 schema 绑定（VIEW 编译已废弃，PAGE 无编译）
     * → 旧 PUBLISHED 降 ARCHIVED → 当前 status=PUBLISHED、publishedVersion=version → save。
     *
     * 并发保证：findByIdForUpdate 仅锁单行，同 key 不同 id 的并发发布需按 key 粒度
     * 串行化（publishLocks），确保同一时刻仅一条 PUBLISHED。锁内第一次普通读
     * （oldPublished 查询）才建立事务快照，可读到先完成者已提交的状态。
     *
     * @param id 页面定义 ID
     * @return 发布后的页面定义
     * @throws BusinessException 页面不存在 / 已归档 / 内容未变化 / 校验或编译失败
     */
    @Transactional
    public PageDefinition publish(String id) {
        return publish(id, null);
    }

    /**
     * 发布页面并落发布目标端（A5，designs 2026-10-25 §4）。
     * clientIds null/空 = 缺省 portal(1)（与存量 target_clients NULL 语义同轨）；
     * 目标端不存在 → 400 拒绝（与「已归档不能发布」同文案族），且校验发生在锁临界区之前——
     * 非法目标端不产生任何发布副作用。
     */
    @Transactional
    public PageDefinition publish(String id, List<Long> clientIds) {
        List<Long> targets = PageTargetClients.normalize(clientIds);
        for (Long clientId : targets) {
            if (!clientRepository.existsById(clientId)) {
                throw new BusinessException(400, "客户端不存在: " + clientId);
            }
        }
        String targetCsv = PageTargetClients.toCsv(targets);

        String tenantId = tenantProvider.getTenantId();
        PageDefinition current = pageDefRepository.findByIdForUpdate(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "页面不存在: " + id));

        if ("ARCHIVED".equals(current.getStatus())) {
            throw new BusinessException(400, "已归档页面不能发布");
        }

        Object lock = publishLocks.computeIfAbsent(tenantId + ":" + current.getKey(), k -> new Object());
        synchronized (lock) {
            // 内容未变化拒绝：与同 key 最新已发布版本（排除自身）比较 schema
            Optional<PageDefinition> oldPublishedOpt = pageDefRepository
                    .findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                            tenantId, current.getKey(), "PUBLISHED", id);
            if (oldPublishedOpt.isPresent()
                    && schemaEquals(current.getSchema(), oldPublishedOpt.get().getSchema())) {
                throw new BusinessException(400, "页面内容与已发布版本未变化，无需发布");
            }

            // 校验（VIEW 视图编译已废弃，PAGE 仅校验 schema 绑定，无编译产物）
            validator.validateForPublish(current);

            // 旧 PUBLISHED 降 ARCHIVED
            oldPublishedOpt.ifPresent(old -> {
                old.setStatus("ARCHIVED");
                pageDefRepository.save(old);
            });

            current.setStatus("PUBLISHED");
            current.setPublishedVersion(current.getVersion());
            current.setTargetClients(targetCsv);
            return pageDefRepository.save(current);
        }
    }

    /**
     * schema 语义比较：JSON 规范化后比对（VIEW 视图编译已废弃，schema 全为用户声明内容）。
     */
    private boolean schemaEquals(String a, String b) {
        try {
            JsonNode na = objectMapper.readTree(a == null || a.isBlank() ? "{}" : a);
            JsonNode nb = objectMapper.readTree(b == null || b.isBlank() ? "{}" : b);
            return na.equals(nb);
        } catch (JsonProcessingException e) {
            return false;
        }
    }
}