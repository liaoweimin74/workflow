package com.workflow.engine.module;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.repository.FormLogicBindingRepository;
import com.workflow.engine.logicflow.repository.LogicFlowDefRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * 模块导出→导入全链路集成测试（H2 真实库）：
 * 租户 t1 建五类实体（含 SUBFLOW/触发绑定/页面 refId 引用）→ 导出 → t2 导入 →
 * 断言 id 重映射（数据源 form_id、页面 data_source_id 与 schema refId、SUBFLOW flowId）、
 * 物理表同步调用、版本语义、源租户数据不受影响。
 *
 * <p>说明：DdlBuilder 生成 MySQL 方言 DDL，H2 无法执行 → @MockitoBean 屏蔽
 * {@link DynamicTableManager}，物理表同步用 Mockito verify 断言调用参数。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ModuleExportImportIntegrationTest {

    private static final String T1 = "t1";
    private static final String T2 = "t2";

    @Autowired
    private ModuleExportService exportService;
    @Autowired
    private ModuleInspectService inspectService;
    @Autowired
    private ModuleImportService importService;
    @Autowired
    private FormDefinitionRepository formDefRepository;
    @Autowired
    private PageDefinitionRepository pageDefRepository;
    @Autowired
    private DataSourceDefinitionRepository dataSourceRepository;
    @Autowired
    private LogicFlowDefRepository logicFlowRepository;
    @Autowired
    private FormLogicBindingRepository bindingRepository;
    @Autowired
    private ObjectMapper objectMapper;
    @MockitoBean
    private DynamicTableManager tableManager;

    // ------------------------------------------------------------------
    // 源租户数据装配
    // ------------------------------------------------------------------

    private FormDefinition newForm(String tenantId, String key, String name, String columnConfig) {
        FormDefinition f = new FormDefinition();
        f.setId(UUID.randomUUID().toString());
        f.setTenantId(tenantId);
        f.setKey(key);
        f.setName(name);
        f.setType("BUSINESS");
        f.setSchema("{\"rule\":[]}");
        f.setColumnConfig(columnConfig);
        f.setVersion(1);
        f.setStatus("PUBLISHED");
        f.setPublishedVersion(1);
        return formDefRepository.save(f);
    }

    /** 装配 t1 全量依赖链：leave_form ← DS ← PAGE；audit_form ← LF(sub_flow)；LF(main_flow) 引用全部。 */
    private ModuleTypes.ElementRef seedSourceTenant() {
        FormDefinition leaveForm = newForm(T1, "leave_form", "请假申请",
                "[{\"key\":\"days\",\"label\":\"天数\",\"columnType\":\"INT\",\"length\":null,"
                        + "\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false}]");
        FormDefinition auditForm = newForm(T1, "audit_form", "审计登记",
                "[{\"key\":\"memo\",\"label\":\"备注\",\"columnType\":\"VARCHAR\",\"length\":255,"
                        + "\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false}]");

        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString());
        ds.setTenantId(T1);
        ds.setName("请假数据源");
        ds.setType("FORM");
        ds.setFormKey("leave_form");
        ds.setSourceKey("leave_form");
        ds.setFormId(leaveForm.getId());
        ds.setStatus("ENABLED");
        ds = dataSourceRepository.save(ds);

        PageDefinition page = new PageDefinition();
        page.setId(UUID.randomUUID().toString());
        page.setTenantId(T1);
        page.setKey("leave_page");
        page.setName("请假页面");
        page.setType("PAGE");
        page.setFormKey("leave_form");
        page.setDataSourceId(ds.getId());
        page.setSchema("{\"rule\":[],\"dataSources\":[{\"id\":\"local\",\"refId\":\"" + ds.getId()
                + "\",\"searchFields\":[],\"columns\":[]}],\"actions\":[]}");
        page.setVersion(1);
        page.setStatus("PUBLISHED");
        page.setPublishedVersion(1);
        pageDefRepository.save(page);

        LogicFlowDef subFlow = new LogicFlowDef();
        subFlow.setId(UUID.randomUUID().toString());
        subFlow.setTenantId(T1);
        subFlow.setFlowKey("sub_flow");
        subFlow.setName("子流程");
        subFlow.setDslJson("{\"nodes\":[{\"id\":\"s1\",\"type\":\"START\"}],\"edges\":[]}");
        subFlow.setStatus("PUBLISHED");
        subFlow.setVersion(1);
        subFlow = logicFlowRepository.save(subFlow);

        LogicFlowDef mainFlow = new LogicFlowDef();
        mainFlow.setId(UUID.randomUUID().toString());
        mainFlow.setTenantId(T1);
        mainFlow.setFlowKey("main_flow");
        mainFlow.setName("主流程");
        mainFlow.setDslJson("{\"nodes\":["
                + "{\"id\":\"n1\",\"type\":\"DATA_QUERY\",\"config\":{\"formKey\":\"leave_form\"}},"
                + "{\"id\":\"n2\",\"type\":\"SUBFLOW\",\"config\":{\"flowId\":\"" + subFlow.getId() + "\"}}],"
                + "\"edges\":[]}");
        mainFlow.setStatus("PUBLISHED");
        mainFlow.setVersion(2);
        mainFlow = logicFlowRepository.save(mainFlow);

        FormLogicBinding binding = new FormLogicBinding();
        binding.setId(UUID.randomUUID().toString());
        binding.setTenantId(T1);
        binding.setFormType("BUSINESS");
        binding.setFormKey("audit_form");
        binding.setTriggerType("AFTER_CREATE");
        binding.setFlowKey("main_flow");
        binding.setExecutionMode("SYNC_IN_TX");
        binding.setEnabled(true);
        bindingRepository.save(binding);

        return new ModuleTypes.ElementRef("LOGIC_FLOW", "main_flow");
    }

    // ------------------------------------------------------------------
    // 用例
    // ------------------------------------------------------------------

    @Test
    void exportAnalyzeImportAcrossTenantsWithIdRemap() throws IOException {
        ModuleTypes.ElementRef entry = seedSourceTenant();

        // 1. 导出（入口=触发方表单 + 页面）：闭包 = audit_form + main_flow + leave_form
        //    + sub_flow + leave_page + 其依赖的 leave_form 数据源（6 元素，覆盖全部 id 引用形态）
        ModuleExportService.ExportResult exported = exportService.export(T1, "admin",
                new ModuleExportService.ExportRequest("测试模块", "集成测试",
                        List.of(new ModuleTypes.ElementRef("FORM", "audit_form"),
                                new ModuleTypes.ElementRef("PAGE", "leave_page")),
                        null));
        assertThat(exported.elementCount()).isEqualTo(6);

        // 2. 预检 t2：全部不存在、无缺口
        ModuleInspectService.InspectResult inspect = inspectService.inspect(T2, exported.zipBytes());
        assertThat(inspect.elements()).hasSize(6);
        assertThat(inspect.elements()).allSatisfy(e -> {
            assertThat(e.exists()).isFalse();
            assertThat(e.missingDeps()).isEmpty();
        });

        // 3. 预检 t1：全部同名冲突
        ModuleInspectService.InspectResult inspectT1 = inspectService.inspect(T1, exported.zipBytes());
        assertThat(inspectT1.elements()).allSatisfy(e -> assertThat(e.exists()).isTrue());

        // 4. 全量覆盖导入 t2
        List<ModuleImportService.ImportAction> actions = inspect.elements().stream()
                .map(e -> new ModuleImportService.ImportAction(e.type(), e.key(), "OVERWRITE"))
                .toList();
        ModuleImportService.ImportResult result = importService.importModule(T2, "admin",
                exported.zipBytes(), actions);
        assertThat(result.results()).allSatisfy(r -> assertThat(r.status()).isEqualTo("IMPORTED"));

        // 5. t2 行已建且 PUBLISHED
        FormDefinition t2Leave = formDefRepository
                .findFirstByTenantIdAndKeyOrderByVersionDesc(T2, "leave_form").orElseThrow();
        assertThat(t2Leave.getStatus()).isEqualTo("PUBLISHED");
        assertThat(t2Leave.getVersion()).isEqualTo(1);
        assertThat(t2Leave.getId()).isNotEqualTo(
                formDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(T1, "leave_form").orElseThrow().getId());

        // 6. 物理表同步：ensureTable 按导入的 columnConfig 调用（包内两个 BUSINESS 表单）
        verify(tableManager).ensureTable(eq("leave_form"), anyList());
        verify(tableManager).ensureTable(eq("audit_form"), anyList());

        // 7. id 重映射：数据源 form_id → t2 表单 id
        DataSourceDefinition t2Ds = dataSourceRepository.findByTenantIdAndSourceKey(T2, "leave_form").orElseThrow();
        assertThat(t2Ds.getFormId()).isEqualTo(t2Leave.getId());

        // 8. id 重映射：页面 data_source_id 与 schema refId → t2 数据源 id
        PageDefinition t2Page = pageDefRepository
                .findFirstByTenantIdAndKeyOrderByVersionDesc(T2, "leave_page").orElseThrow();
        assertThat(t2Page.getDataSourceId()).isEqualTo(t2Ds.getId());
        JsonNode schema = objectMapper.readTree(t2Page.getSchema());
        assertThat(schema.path("dataSources").get(0).path("refId").asText()).isEqualTo(t2Ds.getId());

        // 9. id 重映射：SUBFLOW flowId → t2 子流程 id
        LogicFlowDef t2Sub = logicFlowRepository.findByTenantIdAndFlowKey(T2, "sub_flow").orElseThrow();
        LogicFlowDef t2Main = logicFlowRepository.findByTenantIdAndFlowKey(T2, "main_flow").orElseThrow();
        JsonNode dsl = objectMapper.readTree(t2Main.getDslJson());
        assertThat(dsl.path("nodes").get(1).path("config").path("flowId").asText()).isEqualTo(t2Sub.getId());

        // 10. 触发绑定随 audit_form 导入（upsert）
        assertThat(bindingRepository
                .findByTenantIdAndFormTypeAndFormKeyOrderByCreatedAtAsc(T2, "BUSINESS", "audit_form"))
                .hasSize(1)
                .first()
                .satisfies(b -> {
                    assertThat(b.getFlowKey()).isEqualTo("main_flow");
                    assertThat(b.getTriggerType()).isEqualTo("AFTER_CREATE");
                    assertThat(b.getEnabled()).isTrue();
                });

        // 11. 源租户数据不受影响（版本/行均未变）
        FormDefinition t1Leave = formDefRepository
                .findFirstByTenantIdAndKeyOrderByVersionDesc(T1, "leave_form").orElseThrow();
        assertThat(t1Leave.getVersion()).isEqualTo(1);
        assertThat(logicFlowRepository.findByTenantIdAndFlowKey(T1, "main_flow").orElseThrow().getVersion())
                .isEqualTo(2);
    }

    @Test
    void importSkippedElementsWriteNothing() throws IOException {
        seedSourceTenant();
        ModuleExportService.ExportResult exported = exportService.export(T1, "admin",
                new ModuleExportService.ExportRequest("模块", null,
                        List.of(new ModuleTypes.ElementRef("LOGIC_FLOW", "main_flow")),
                        null));

        ModuleInspectService.InspectResult inspect = inspectService.inspect(T2, exported.zipBytes());
        List<ModuleImportService.ImportAction> allSkip = inspect.elements().stream()
                .map(e -> new ModuleImportService.ImportAction(e.type(), e.key(), "SKIP"))
                .toList();
        ModuleImportService.ImportResult result = importService.importModule(T2, "admin",
                exported.zipBytes(), allSkip);
        assertThat(result.results()).allSatisfy(r -> assertThat(r.status()).isEqualTo("SKIPPED"));

        // t2 无任何写入
        assertThat(formDefRepository.existsByTenantIdAndKey(T2, "leave_form")).isFalse();
        assertThat(logicFlowRepository.existsByTenantIdAndFlowKey(T2, "main_flow")).isFalse();
        assertThat(dataSourceRepository.findByTenantIdAndSourceKey(T2, "leave_form")).isEmpty();
    }

    @Test
    void analyzeClosureIncludesBindingChain() {
        seedSourceTenant();
        ModuleDependencyAnalyzer.Graph graph = analyzer.scan(T1);
        // 绑定方向为 FORM → LOGIC_FLOW（audit_form 触发 main_flow = audit_form 依赖 main_flow），
        // 正向 BFS 从 main_flow 出发不带出触发方 audit_form（导流不带触发方是正确语义）；
        // 反向（导 audit_form）才必须带出 main_flow，否则绑定断链。
        ModuleDependencyAnalyzer.Closure closure = analyzer.closure(graph, List.of("LOGIC_FLOW:main_flow"));
        assertThat(closure.refs()).containsExactlyInAnyOrder(
                "LOGIC_FLOW:main_flow", "FORM:leave_form", "LOGIC_FLOW:sub_flow");

        ModuleDependencyAnalyzer.Closure reverse = analyzer.closure(graph, List.of("FORM:audit_form"));
        assertThat(reverse.refs()).containsExactlyInAnyOrder("FORM:audit_form", "LOGIC_FLOW:main_flow",
                "FORM:leave_form", "LOGIC_FLOW:sub_flow");
    }

    @Autowired
    private ModuleDependencyAnalyzer analyzer;
}
