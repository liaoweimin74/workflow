package com.workflow.engine.page;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.controller.PageQueryController;
import com.workflow.api.controller.PageViewQuerySupport;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.repository.SysClientRepository;
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
 * 页面发布-查询集成测试（真实组件装配，自定义页面 PAGE）。
 * VIEW 视图编译/查询已废弃，本测试以 PAGE 数据源绑定验证发布链路与白名单查询。
 *
 * 覆盖：
 * 1. 发布 BUSINESS 表单触发建表（真实 FormDefinitionService + mock DynamicTableManager）
 * 2. 发布 PAGE 页面成功且不执行 DDL（页面链路无 DynamicTableManager 触点、无编译）
 * 3. /pages/{key}/ds/{dsId}/data 查询：filter 白名单（未知字段 400）、租户隔离
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
    private DataSourceDefinitionService dsService;

    @Mock
    private PageAccessGuard pageAccessGuard;

    private FormDefinitionService formDefService;
    private PageDefinitionService pageDefService;
    private PageQueryController queryController;
    private ObjectMapper objectMapper = new ObjectMapper();
    private InMemoryPageRepository pageRepo;

    private static final String TENANT_ID = "tenant-a";
    private static final String TENANT_B = "tenant-b";
    private static final String DS_REF = "ds_ref_1";

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

        // 页面链路全真实：Validator/Service + 内存仓库（发布临界区同步模拟行锁）
        pageRepo = new InMemoryPageRepository();
        PageValidator validator = new PageValidator(formDefRepository, objectMapper, tenantProvider, dsService);
        // A5：发布链存在性校验——本测试不测目标端语义，客户端存在性恒放行
        SysClientRepository clientRepository = mock(SysClientRepository.class);
        lenient().when(clientRepository.existsById(anyLong())).thenReturn(true);
        pageDefService = new PageDefinitionService(pageRepo, tenantProvider, validator,
                objectMapper, clientRepository);

        // PAGE 引用的全局数据源（FORM 型，绑定 biz_leave）
        lenient().when(dsService.getEnabled()).thenReturn(List.of(enabledFormDs(DS_REF, "biz_leave")));

        // 访问守卫 mock 为放行（本测试聚焦发布/查询链路，不测权限）
        queryController = new PageQueryController(pageDefService, dsService, pageAccessGuard,
                new PageViewQuerySupport(objectMapper));
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

    private DataSourceDefinition enabledFormDs(String id, String formKey) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(id);
        ds.setTenantId(TENANT_ID);
        ds.setName("ds-" + id);
        ds.setType("FORM");
        ds.setFormKey(formKey);
        ds.setStatus("ENABLED");
        return ds;
    }

    /** PAGE schema：page-table 绑定 ds-main→DS_REF，数据源 searchFields 由参数给定 */
    private String pageSchema(String searchFieldsJson, String propsColumns) {
        return """
                {"rule":[{"type":"page-table","field":"t","props":{"dataSourceId":"ds-main","columns":%s}}],
                 "option":{},
                 "dataSources":[{"id":"ds-main","refId":"%s","searchFields":%s}],
                 "actions":[]}
                """.formatted(propsColumns, DS_REF, searchFieldsJson);
    }

    private static final String COLS_NAME = "[{\"prop\":\"name\",\"label\":\"姓名\"}]";

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

    // ==================== 2. PAGE 发布成功且无 DDL/编译 ====================

    @Test
    void publishPage_success_withoutDdl() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("apply_date", "DATE", false)));

        String id = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"name\"]", COLS_NAME));

        PageDefinition result = pageDefService.publish(id);

        assertEquals("PUBLISHED", result.getStatus());
        assertEquals(1, result.getPublishedVersion());
        // schema 原样持久化（无编译产物注入）
        assertTrue(result.getSchema().contains("ds-main"));
        // 页面发布链路不产生任何 DDL
        verify(tableManager, never()).ensureTable(anyString(), anyList());
    }

    // ==================== 3. /pages/{key}/ds/{dsId}/data：filter 白名单 + 租户隔离 ====================

    @Test
    void queryData_filterWithUnknownField_rejected() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        String id = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"name\"]", COLS_NAME));
        pageDefService.publish(id);

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);
        req.setFilter("{\"name\":\"张\",\"hack\":\"x\"}");

        BusinessException ex = assertThrows(BusinessException.class,
                () -> queryController.queryPageDataSource("leave-page", "ds-main", req));
        assertTrue(ex.getMessage().contains("白名单"));
        verify(dsService, never()).queryData(anyString(), any());
    }

    @Test
    void queryData_whitelistFilter_passedToDataSourceService() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        String id = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"name\",\"amount\"]", COLS_NAME));
        pageDefService.publish(id);

        when(dsService.queryData(eq(DS_REF), any())).thenReturn(
                new BizDataPageVO(List.of(mockBizRow()), 1, 0, 20));

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(0);
        req.setSize(20);
        req.setFilter("{\"name\":\"张\",\"amount\":100}");

        R<BizDataPageVO> result = queryController.queryPageDataSource("leave-page", "ds-main", req);
        BizDataPageVO vo = result.getData();

        assertEquals(1, vo.getTotal());
        verify(dsService).queryData(eq(DS_REF), any());
    }

    @Test
    void queryData_otherTenant_notFound() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));
        String id = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"name\"]", COLS_NAME));
        pageDefService.publish(id);

        // 切换租户：TENANT_B 无该页面 → 404
        TenantContext.setTenantId(TENANT_B);
        when(tenantProvider.getTenantId()).thenReturn(TENANT_B);

        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter(null);

        assertThrows(BusinessException.class,
                () -> queryController.queryPageDataSource("leave-page", "ds-main", req));
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

        String id1 = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"name\"]", COLS_NAME));
        String id2 = pageRepo.create(TENANT_ID, "请假页面改", "leave-page", "PAGE",
                pageSchema("[\"amount\"]", "[{\"prop\":\"amount\",\"label\":\"金额\"}]"));

        AtomicReference<Exception> failure = new AtomicReference<>();
        Thread t1 = new Thread(() -> safePublish(id1, failure));
        Thread t2 = new Thread(() -> safePublish(id2, failure));
        t1.start();
        t2.start();
        t1.join(5000);
        t2.join(5000);

        assertNull(failure.get(), "并发发布不应失败: " + failure.get());

        List<PageDefinition> published = pageRepo.all().stream()
                .filter(p -> "leave-page".equals(p.getKey()) && "PUBLISHED".equals(p.getStatus()))
                .collect(Collectors.toList());
        assertEquals(1, published.size(), "同一时刻应仅一条 PUBLISHED，实际: " + published.size());
        long archived = pageRepo.all().stream()
                .filter(p -> "leave-page".equals(p.getKey()) && "ARCHIVED".equals(p.getStatus()))
                .count();
        assertEquals(1, archived);
    }

    @Test
    void publish_sameContent_rejectedAsUnchanged() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));

        String schema = pageSchema("[\"name\"]", COLS_NAME);
        String id1 = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE", schema);
        // 第二稿与已发布内容相同 → 拒绝（同 key）
        String id2 = pageRepo.create(TENANT_ID, "请假页面副本", "leave-page", "PAGE", schema);
        pageDefService.publish(id1);

        BusinessException ex = assertThrows(BusinessException.class, () -> pageDefService.publish(id2));
        assertTrue(ex.getMessage().contains("未变化"));
    }

    // ==================== 5. 绑定表单列变更后发布校验跟随 ====================

    @Test
    void publish_afterFormColumnDeleted_rejected() {
        publishedBusinessForm("biz_leave",
                columnConfig(col("name", "VARCHAR", false), col("amount", "DECIMAL", false)));

        String id = pageRepo.create(TENANT_ID, "请假页面", "leave-page", "PAGE",
                pageSchema("[\"amount\"]", "[{\"prop\":\"amount\",\"label\":\"金额\"}]"));
        pageDefService.publish(id); // 首次发布成功

        // 表单列变化：amount 列被删除
        publishedBusinessForm("biz_leave", columnConfig(col("name", "VARCHAR", false)));
        // 新稿引用已删列 amount → 校验跟随 → 400
        String id2 = pageRepo.create(TENANT_ID, "请假页面改", "leave-page", "PAGE",
                pageSchema("[\"amount\",\"name\"]", COLS_NAME));

        BusinessException ex = assertThrows(BusinessException.class, () -> pageDefService.publish(id2));
        assertTrue(ex.getMessage().contains("列不存在"));
        assertEquals(1, pageRepo.all().stream()
                .filter(p -> "leave-page".equals(p.getKey()) && "PUBLISHED".equals(p.getStatus()))
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

    private class InMemoryPageRepository implements PageDefinitionRepository {

        private final Map<String, PageDefinition> store = new ConcurrentHashMap<>();
        private final Object publishLock = new Object();

        String create(String tenantId, String name, String key, String type, String schema) {
            PageDefinition p = new PageDefinition();
            String id = UUID.randomUUID().toString().replace("-", "");
            p.setId(id);
            p.setTenantId(tenantId);
            p.setName(name);
            p.setKey(key);
            p.setType(type);
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
            synchronized (publishLock) {
                return store.values().stream()
                        .filter(p -> p.getTenantId().equals(tenantId) && p.getKey().equals(key)
                                && status.equals(p.getStatus()) && !excludeId.equals(p.getId()))
                        .max(Comparator.comparing(PageDefinition::getVersion));
            }
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
        public long countByTenantIdAndDataSourceId(String tenantId, String dataSourceId) {
            return store.values().stream()
                    .filter(p -> tenantId.equals(p.getTenantId()) && dataSourceId.equals(p.getDataSourceId()))
                    .count();
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
        @SuppressWarnings("unchecked")
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
        private Page<PageDefinition> page(List<PageDefinition> content, Pageable pageable) {
            return new PageImpl<>(content, pageable, content.size());
        }
    }
}
