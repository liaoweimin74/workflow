package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.controller.PageQueryController;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 页面发布-查询集成测试（真实组件装配）。
 *
 * 覆盖（对齐 Task 7）：
 * 1. 发布 BUSINESS 表单触发建表（真实 FormDefinitionService + mock DynamicTableManager）
 * 2. 发布 VIEW 页面成功且不执行 DDL（页面链路无 DynamicTableManager 触点）
 * 3. /pages/{key}/data 查询：filter 白名单（未知字段 400）、租户隔离
 * 4. 同 key 多稿发布 → 同一时刻仅一条 PUBLISHED（旧稿降 ARCHIVED、内容未变拒绝）
 * 5. 绑定表单 column_config 变化后，页面再次发布校验跟随（引用已删列 → 400）
 *
 * 说明：PageDefinitionRepository 使用内存实现（ConcurrentHashMap），
 * 发布读写临界区同步以模拟数据库行锁，验证"仅一条 PUBLISHED"不变量。
 */
@ExtendWith(MockitoExtension.class)
class PageDefinitionPublishIntegrationTest {

    @Mock
    private FormDefinitionRepository formDefRepository;

    @Mock
    private TenantProvider tenantProvider;

    @Mock
    private DynamicTableManager tableManager;

    @Mock
    private BizDataService bizDataService;

    @Mock
    private DataSourceDefinitionService dsService;

    private FormDefinitionService formDefService;
    private PageDefinitionService pageDefService;
    private PageQueryController queryController;
    private ObjectMapper objectMapper = new ObjectMapper();
    private InMemoryPageRepository pageRepo;

    private static final String TENANT_ID = "tenant-a";
    private static final String TENANT_B = "tenant-b";

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        lenient().when(tenantProvider.getTenantId()).thenReturn(TENANT_ID);

        // 真实业务表单服务：发布 BUSINESS 表单触发建表（受控 DDL）
        formDefService = new FormDefinitionService(formDefRepository, tenantProvider,
                tableManager, objectMapper, new org.springframework.context.ApplicationEventPublisher() {
            @Override
            public void publishEvent(Object event) {}
        });

        // 页面链路全真实：Validator/Compiler/Service + 内存仓库（发布临界区同步模拟行锁）
        pageRepo = new InMemoryPageRepository();
        PageValidator validator = new PageValidator(formDefRepository, objectMapper, tenantProvider, dsService);
        ViewCompiler compiler = new ViewCompiler(objectMapper);
        pageDefService = new PageDefinitionService(pageRepo, tenantProvider, validator, compiler, objectMapper);

        queryController = new PageQueryController(pageDefService, bizDataService, dsService, objectMapper);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ==================== 工具 ====================

    private FormDefinition businessFormDraft(String id, String key, String columnConfigJson) {
        FormDefinition fd = new FormDefinition();
        fd.setId(id);
        fd.setTenantId(TENANT_ID);
        fd.setKey(key);
        fd.setType("BUSINESS");
        fd.setSchema("[{\"type\":\"input\",\"field\":\"name\"}]");
        fd.setColumnConfig(columnConfigJson);
        fd.setVersion(1);
        fd.setStatus("DRAFT");
        return fd;
    }

    private String columnConfig(ColumnConfig... cols) {
        try {
            return objectMapper.writeValueAsString(List.of(cols));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private ColumnConfig col(String key, String type, boolean hidden) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(key);
        c.setColumnType(type);
        c.setHidden(hidden);
        c.setLength(255);
        return c;
    }

    /** 直接放置一条已有发布状态的表单（受控 DDL 之外的绑定目标）。 */
    private FormDefinition publishedBusinessForm(String key, String columnConfigJson) {
        FormDefinition fd = businessFormDraft("form-" + key, key, columnConfigJson);
        fd.setStatus("PUBLISHED");
        fd.setPublishedVersion(1);
        lenient().when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                eq(TENANT_ID), eq(key), eq("PUBLISHED"))).thenReturn(Optional.of(fd));
        return fd;
    }

    private void stubFormPublish(FormDefinition d) {
        lenient().when(formDefRepository.findByIdForUpdate(d.getId(), TENANT_ID)).thenReturn(Optional.of(d));
        lenient().when(formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                TENANT_ID, d.getKey(), "PUBLISHED")).thenReturn(Optional.empty());
        lenient().when(formDefRepository.save(any(FormDefinition.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ==================== 1. BUSINESS 表单发布触发建表 ====================

    @Test
    void publishBusinessForm_triggersDdl_createTable() {
        FormDefinition draft = businessFormDraft("f1", "biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        stubFormPublish(draft);

        FormDefinition result = formDefService.publish("f1");

        assertEquals("PUBLISHED", result.getStatus());
        verify(tableManager).ensureTable(eq("biz_leave"), anyList());
    }

    // ==================== 2. VIEW 发布成功且无 DDL ====================

    @Test
    void publishViewPage_success_withoutDdl() {
        // 绑定表单已发布（页面上游既有能力，非本次 DDL 来源）
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("apply_date", "DATE", false)));

        String id = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");

        PageDefinition result = pageDefService.publish(id);

        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
        assertTrue(result.getSchema().contains("\"rule\""));
        // 页面发布链路不产生任何 DDL：tableManager 仅被业务表单发布调用过（本测试未触发表单发布 → never）
        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    // ==================== 3. /pages/{key}/data：fiter 白名单 + 租户隔离 ====================

    @Test
    void queryData_filterWithUnknownField_rejected() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        pageRepo.findByIdAndTenantId(pageRepo.keys().get(0), TENANT_ID).ifPresent(p -> {
            pageDefService.publish(p.getId());
        });

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);
        req.setFilter("{\"name\":\"张\",\"hack\":\"x\"}");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> queryController.query("leave-query", req));
        assertTrue(ex.getMessage().contains("白名单"));
        verify(bizDataService, never()).query(anyString(), any());
    }

    @Test
    void queryData_whitelistFilter_passedToBizService() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        String id = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"},"
                        + "{\"key\":\"amount\",\"label\":\"金额\",\"matchType\":\"eq\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        pageDefService.publish(id);

        when(bizDataService.query(eq("biz_leave"), any())).thenReturn(
                new BizDataPageVO(List.of(mockBizRow()), 1, 0, 20));

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);
        req.setFilter("{\"name\":\"张\",\"amount\":100}");

        R<BizDataPageVO> result = queryController.query("leave-query", req);
        BizDataPageVO vo = result.getData();

        assertEquals(1, vo.getTotal());
        verify(bizDataService).query(eq("biz_leave"), any());
    }

    @Test
    void queryData_otherTenant_notFound() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        String id = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        pageDefService.publish(id);

        // 切换租户：TENANT_B 无该页面 → 404
        TenantContext.setTenantId(TENANT_B);
        when(tenantProvider.getTenantId()).thenReturn(TENANT_B);

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter(null);

        assertThrows(BusinessException.class, () -> queryController.query("leave-query", req));
    }

    private BizDataVO mockBizRow() {
        BizDataVO row = new BizDataVO();
        row.setId("row-1");
        row.setData(Map.of("name", "张三", "amount", 100));
        row.setVersion(1);
        return row;
    }

    // ==================== 4. 同 key 多稿发布：仅一条 PUBLISHED ====================

    @Test
    void publish_sameKeyMultipleDrafts_singlePublished() throws Exception {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));

        // 两篇草稿，内容不同，同 key
        String id1 = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        String id2 = pageRepo.create(TENANT_ID, "请假查询改", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"amount\",\"label\":\"金额\",\"matchType\":\"eq\"}],"
                        + "\"columns\":[{\"key\":\"amount\",\"label\":\"金额\"}]}");

        // 并发发布：两个线程同时发布（仓库临界区同步模拟行锁）
        AtomicReference<Exception> failure = new AtomicReference<>();
        Thread t1 = new Thread(() -> safePublish(id1, failure));
        Thread t2 = new Thread(() -> safePublish(id2, failure));
        t1.start();
        t2.start();
        t1.join(5000);
        t2.join(5000);

        assertNull(failure.get(), "并发发布不应失败: " + failure.get());

        // 不变量：同 key 同一时刻仅一条 PUBLISHED
        List<PageDefinition> published = pageRepo.all().stream()
                .filter(p -> "leave-query".equals(p.getKey()) && "PUBLISHED".equals(p.getStatus()))
                .collect(Collectors.toList());
        assertEquals(1, published.size(), "同一时刻应仅一条 PUBLISHED，实际: " + published.size());
        // 其余均为 ARCHIVED（旧稿降级）
        long archived = pageRepo.all().stream()
                .filter(p -> "leave-query".equals(p.getKey()) && "ARCHIVED".equals(p.getStatus()))
                .count();
        assertEquals(1, archived);
    }

    @Test
    void publish_sameContent_rejectedAsUnchanged() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));

        String id1 = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        // 第二稿与已发布内容相同 → 拒绝（同 key）
        String id2 = pageRepo.create(TENANT_ID, "请假查询副本", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}]}");
        pageDefService.publish(id1);

        BusinessException ex = assertThrows(BusinessException.class, () -> pageDefService.publish(id2));
        assertTrue(ex.getMessage().contains("未变化"));
    }

    // ==================== 5. 绑定表单列变更后发布校验跟随 ====================

    @Test
    void publish_afterFormColumnDeleted_rejected() {
        // 表单已发布：含 name、amount 两列
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));

        String id = pageRepo.create(TENANT_ID, "请假查询", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"amount\",\"label\":\"金额\",\"matchType\":\"eq\"}],"
                        + "\"columns\":[{\"key\":\"amount\",\"label\":\"金额\"}]}");
        pageDefService.publish(id); // 首次发布成功

        // 表单列变化：amount 列被删除（重新发布表单后的有效列集合）
        publishedBusinessForm("biz_leave", columnConfig(col("name", "VARCHAR", false)));
        // 新稿内容与已发布版本不同（新增 name 搜索条件），但仍引用已删列 amount → 校验跟随 → 400
        String id2 = pageRepo.create(TENANT_ID, "请假查询改", "leave-query", "VIEW", "biz_leave",
                "{\"searchFields\":[{\"key\":\"amount\",\"label\":\"金额\",\"matchType\":\"eq\"},"
                        + "{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"amount\",\"label\":\"金额\"}]}");

        BusinessException ex = assertThrows(BusinessException.class, () -> pageDefService.publish(id2));
        assertTrue(ex.getMessage().contains("列不存在") || ex.getMessage().contains("列"));
        // 已发布版本保持有效，未被破坏
        assertEquals(1, pageRepo.all().stream()
                .filter(p -> "leave-query".equals(p.getKey()) && "PUBLISHED".equals(p.getStatus()))
                .count());
    }

    private void safePublish(String id, AtomicReference<Exception> failure) {
        try {
            pageDefService.publish(id);
        } catch (Exception e) {
            failure.compareAndSet(null, e);
        }
    }

    // ==================== 内存 PageDefinitionRepository ====================

    /**
     * 内存仓库：id → 记录。发布相关读改写临界区加锁以模拟数据库行锁语义，
     * 保证"同 key 同一时刻仅一条 PUBLISHED"在并发下可断言。
     */
    private class InMemoryPageRepository implements PageDefinitionRepository {

        private final Map<String, PageDefinition> store = new ConcurrentHashMap<>();
        private final Object publishLock = new Object();

        String create(String tenantId, String name, String key, String type, String formKey, String schema) {
            PageDefinition p = new PageDefinition();
            String id = UUID.randomUUID().toString().replace("-", "");
            p.setId(id);
            p.setTenantId(tenantId);
            p.setName(name);
            p.setKey(key);
            p.setType(type);
            p.setFormKey(formKey);
            p.setSchema(schema);
            p.setVersion(1);
            p.setStatus("DRAFT");
            store.put(id, p);
            return id;
        }

        List<String> keys() {
            return new ArrayList<>(store.keySet());
        }

        List<PageDefinition> all() {
            return new ArrayList<>(store.values());
        }

        @Override
        public Optional<PageDefinition> findByIdAndTenantId(String id, String tenantId) {
            PageDefinition p = store.get(id);
            return p != null && p.getTenantId().equals(tenantId) ? Optional.of(p) : Optional.empty();
        }

        @Override
        public boolean existsByTenantIdAndKey(String tenantId, String key) {
            return store.values().stream()
                    .anyMatch(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                            && !"ARCHIVED".equals(p.getStatus()));
        }

        @Override
        public Optional<PageDefinition> findFirstByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key) {
            return store.values().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                            && !"ARCHIVED".equals(p.getStatus()))
                    .max(Comparator.comparing(PageDefinition::getVersion));
        }

        @Override
        public Optional<PageDefinition> findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                String tenantId, String key, String status, String excludeId) {
            return store.values().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                            && status.equals(p.getStatus()) && !excludeId.equals(p.getId()))
                    .max(Comparator.comparing(PageDefinition::getVersion));
        }

        @Override
        public Optional<PageDefinition> findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                String tenantId, String key, String status) {
            return store.values().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                            && status.equals(p.getStatus()))
                    .max(Comparator.comparing(PageDefinition::getVersion));
        }

        @Override
        public List<PageDefinition> findByTypeAndFormKeyNotNullAndDataSourceIdNull(String type) {
            return store.values().stream()
                    .filter(p -> type.equals(p.getType()) && p.getFormKey() != null
                            && p.getDataSourceId() == null)
                    .toList();
        }

        @Override
        public Optional<PageDefinition> findByIdForUpdate(String id, String tenantId) {
            synchronized (publishLock) {
                return findByIdAndTenantId(id, tenantId);
            }
        }

        @Override
        public List<PageDefinition> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key) {
            return store.values().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key))
                    .sorted(Comparator.comparing(PageDefinition::getVersion).reversed())
                    .collect(Collectors.toList());
        }

        @Override
        public Optional<PageDefinition> findByTenantIdAndKeyAndVersion(String tenantId, String key, Integer version) {
            return store.values().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                            && version.equals(p.getVersion()))
                    .findFirst();
        }

        @Override
        public Page<PageDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable) {
            return page(all().stream().filter(p -> p.getTenantId().equals(tenantId)).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(
                String tenantId, String name, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getName().contains(name)).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndStatusOrderByUpdatedAtDesc(
                String tenantId, String status, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && status.equals(p.getStatus())).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndTypeOrderByUpdatedAtDesc(
                String tenantId, String type, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && type.equals(p.getType())).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndStatusAndTypeOrderByUpdatedAtDesc(
                String tenantId, String status, String type, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && status.equals(p.getStatus())
                            && type.equals(p.getType())).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndNameContainingAndTypeOrderByUpdatedAtDesc(
                String tenantId, String name, String type, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getName().contains(name)
                            && type.equals(p.getType())).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndNameContainingAndStatusOrderByUpdatedAtDesc(
                String tenantId, String name, String status, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getName().contains(name)
                            && status.equals(p.getStatus())).toList(), pageable);
        }

        @Override
        public Page<PageDefinition> findByTenantIdAndNameContainingAndStatusAndTypeOrderByUpdatedAtDesc(
                String tenantId, String name, String status, String type, Pageable pageable) {
            return page(all().stream()
                    .filter(p -> p.getTenantId().equals(tenantId) && p.getName().contains(name)
                            && status.equals(p.getStatus()) && type.equals(p.getType())).toList(), pageable);
        }

        @Override
        public <S extends PageDefinition> S save(S entity) {
            synchronized (publishLock) {
                store.put(entity.getId(), entity);
                return entity;
            }
        }

        @Override
        public Optional<PageDefinition> findById(String id) {
            return Optional.ofNullable(store.get(id));
        }

        @Override
        public void delete(PageDefinition entity) {
            store.remove(entity.getId());
        }

        @Override
        public void deleteById(String id) {
            store.remove(id);
        }

        @Override
        public boolean existsById(String id) {
            return store.containsKey(id);
        }

        @Override
        public long count() {
            return store.size();
        }

        @Override
        public List<PageDefinition> findAll() {
            return all();
        }

        @Override
        public List<PageDefinition> findAllById(Iterable<String> ids) {
            List<PageDefinition> out = new ArrayList<>();
            for (String id : ids) {
                PageDefinition p = store.get(id);
                if (p != null) out.add(p);
            }
            return out;
        }

        @Override
        public void deleteAllById(Iterable<? extends String> ids) {
            for (String id : ids) store.remove(id);
        }

        @Override
        public void deleteAll(Iterable<? extends PageDefinition> entities) {
            for (PageDefinition e : entities) store.remove(e.getId());
        }

        @Override
        public void deleteAll() {
            store.clear();
        }

        @Override
        public void flush() {}

        @Override
        public <S extends PageDefinition> S saveAndFlush(S entity) {
            return save(entity);
        }

        @Override
        public <S extends PageDefinition> List<S> saveAll(Iterable<S> entities) {
            List<S> out = new ArrayList<>();
            for (S e : entities) {
                save(e);
                out.add(e);
            }
            return out;
        }

        @Override
        public <S extends PageDefinition> List<S> saveAllAndFlush(Iterable<S> entities) {
            return saveAll(entities);
        }

        @Override
        public void deleteAllInBatch(Iterable<PageDefinition> entities) {
            for (PageDefinition e : entities) store.remove(e.getId());
        }

        @Override
        public void deleteAllByIdInBatch(Iterable<String> ids) {
            for (String id : ids) store.remove(id);
        }

        @Override
        public void deleteAllInBatch() {
            store.clear();
        }

        @Override
        public PageDefinition getOne(String id) {
            return store.get(id);
        }

        @Override
        public PageDefinition getById(String id) {
            return store.get(id);
        }

        @Override
        public PageDefinition getReferenceById(String id) {
            return store.get(id);
        }

        @Override
        public Page<PageDefinition> findAll(Pageable pageable) {
            return page(all(), pageable);
        }

        @Override
        public List<PageDefinition> findAll(Sort sort) {
            return all();
        }

        // ============ QueryByExampleExecutor（JpaRepository 派生，测试不调用，空实现） ============

        @Override
        public <S extends PageDefinition> Optional<S> findOne(Example<S> example) {
            return Optional.empty();
        }

        @Override
        @SuppressWarnings("unchecked")
        public <S extends PageDefinition> List<S> findAll(Example<S> example) {
            return (List<S>) all();
        }

        @Override
        @SuppressWarnings("unchecked")
        public <S extends PageDefinition> List<S> findAll(Example<S> example, Sort sort) {
            return (List<S>) all();
        }

        @Override
        public <S extends PageDefinition> Page<S> findAll(Example<S> example, Pageable pageable) {
            return (Page<S>) page(all(), pageable);
        }

        @Override
        public <S extends PageDefinition> long count(Example<S> example) {
            return count();
        }

        @Override
        public <S extends PageDefinition> boolean exists(Example<S> example) {
            return count() > 0;
        }

        @Override
        public <S extends PageDefinition, R> R findBy(
                Example<S> example, Function<FetchableFluentQuery<S>, R> queryFunction) {
            throw new UnsupportedOperationException("FluentQuery 查询测试不涉及");
        }

        @SuppressWarnings("unchecked")
        private <S extends PageDefinition> Page<S> page(List<S> list, Pageable pageable) {
            int from = Math.min((int) pageable.getOffset(), list.size());
            int to = Math.min(from + pageable.getPageSize(), list.size());
            return new PageImpl<>(new ArrayList<>(list.subList(from, to)), pageable, list.size());
        }
    }
}