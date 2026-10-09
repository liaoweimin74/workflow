package com.workflow.engine.logicflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.entity.FormData;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDataRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.logicflow.entity.FormLogicBinding;
import com.workflow.engine.logicflow.repository.FormLogicBindingRepository;
import com.workflow.engine.logicflow.service.FormFieldSchemaService.FormFieldGroupVO;
import com.workflow.engine.logicflow.service.FormFieldSchemaService.FormFieldVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 设计期表单字段发现服务单测：三路来源（columnConfig 直读 / form-create rule 树 /
 * 实例采样）、绑定聚合、版本选择与解析容错。
 */
class FormFieldSchemaServiceTest {

    private static final String TENANT = "default";
    private static final String FLOW_KEY = "lf_demo";

    private final ObjectMapper objectMapper = new ObjectMapper();

    private FormLogicBindingRepository bindings;
    private FormDefinitionRepository formDefs;
    private FormDataRepository formDataRepo;
    private FormFieldSchemaService service;

    @BeforeEach
    void setUp() {
        bindings = mock(FormLogicBindingRepository.class);
        formDefs = mock(FormDefinitionRepository.class);
        formDataRepo = mock(FormDataRepository.class);
        service = new FormFieldSchemaService(bindings, formDefs, formDataRepo, objectMapper);
    }

    private FormLogicBinding binding(String formType, String formKey, String trigger) {
        FormLogicBinding b = new FormLogicBinding();
        b.setFormType(formType);
        b.setFormKey(formKey);
        b.setTriggerType(trigger);
        return b;
    }

    private FormDefinition def(String type, String key, String columnConfig, String schema) {
        FormDefinition d = new FormDefinition();
        d.setId("fd-" + key);
        d.setTenantId(TENANT);
        d.setType(type);
        d.setKey(key);
        d.setName(key + " 名称");
        d.setColumnConfig(columnConfig);
        d.setSchema(schema);
        return d;
    }

    @Test
    void businessColumnConfigDirectRead() {
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("BUSINESS", "bill_test", "BEFORE_CREATE"),
                        binding("BUSINESS", "bill_test", "AFTER_CREATE")));
        String cc = "[{\"key\":\"person_name\",\"label\":\"请假人姓名\",\"columnType\":\"VARCHAR\"},"
                + "{\"key\":\"leave_days\",\"label\":\"请假天数\",\"columnType\":\"INT\"},"
                + "{\"key\":\"flag\",\"label\":\"标志\",\"columnType\":\"BOOLEAN\"},"
                + "{\"key\":\"extra\",\"label\":\"扩展\",\"columnType\":\"JSON\"}]";
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "bill_test", "PUBLISHED"))
                .thenReturn(Optional.of(def("BUSINESS", "bill_test", cc, null)));

        List<FormFieldGroupVO> groups = service.listFieldsForFlow(TENANT, FLOW_KEY);

        assertThat(groups).hasSize(1);
        FormFieldGroupVO g = groups.get(0);
        assertThat(g.source()).isEqualTo("columnConfig");
        assertThat(g.triggerTypes()).containsExactly("BEFORE_CREATE", "AFTER_CREATE");
        assertThat(g.fields()).extracting(FormFieldVO::path)
                .containsExactly("person_name", "leave_days", "flag", "extra");
        assertThat(g.fields()).extracting(FormFieldVO::type)
                .containsExactly("string", "number", "boolean", "json");
        assertThat(g.fields().get(0).label()).isEqualTo("请假人姓名");
    }

    @Test
    void workflowRuleTreeFlattenAndColumnsChildren() {
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("WORKFLOW", "baoxiao", "AFTER_SNAPSHOT")));
        String schema = "{\"rule\":["
                + "{\"type\":\"fcRow\",\"children\":["
                + "  {\"type\":\"col\",\"children\":["
                + "    {\"type\":\"input\",\"field\":\"person_name\",\"title\":\"姓名\"},"
                + "    {\"type\":\"inputNumber\",\"field\":\"amount\",\"title\":\"金额\"}]}"
                + "]},"
                + "{\"type\":\"LookupPicker\",\"field\":\"person\",\"title\":\"人员\","
                + "  \"props\":{\"columns\":[{\"prop\":\"username\",\"label\":\"用户名\"},"
                + "                          {\"prop\":\"dept\",\"label\":\"部门\"}]}},"
                + "{\"type\":\"switch\",\"field\":\"urgent\",\"title\":\"加急\"}]}";
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "baoxiao", "PUBLISHED"))
                .thenReturn(Optional.of(def("WORKFLOW", "baoxiao", null, schema)));

        List<FormFieldGroupVO> groups = service.listFieldsForFlow(TENANT, FLOW_KEY);

        assertThat(groups).hasSize(1);
        FormFieldGroupVO g = groups.get(0);
        assertThat(g.source()).isEqualTo("schema");
        // 布局容器 children 并列平铺（不加前缀）
        assertThat(g.fields()).extracting(FormFieldVO::path)
                .containsExactly("person_name", "amount", "person", "urgent");
        assertThat(g.fields()).extracting(FormFieldVO::type)
                .containsExactly("string", "number", "string", "boolean");
        // props.columns 生成父字段 children（完整点路径）
        FormFieldVO person = g.fields().get(2);
        assertThat(person.children()).extracting(FormFieldVO::path)
                .containsExactly("person.username", "person.dept");
        assertThat(person.children().get(0).label()).isEqualTo("用户名");
    }

    @Test
    void emptySchemaFallsBackToSampledData() {
        FormDefinition d = def("WORKFLOW", "dyn_form", null, "");
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("WORKFLOW", "dyn_form", "AFTER_PROCESS_START")));
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "dyn_form", "PUBLISHED"))
                .thenReturn(Optional.of(d));

        FormData row = new FormData();
        row.setDataJson("{\"city\":\"北京\",\"pop\":2100,\"tags\":[\"a\"],"
                + "\"order\":{\"no\":\"A1\",\"qty\":2}}");
        when(formDataRepo.findTop10ByTenantIdAndFormDefIdAndIsSnapshotOrderByUpdatedAtDesc(
                TENANT, d.getId(), false)).thenReturn(List.of(row));

        List<FormFieldGroupVO> groups = service.listFieldsForFlow(TENANT, FLOW_KEY);

        assertThat(groups).hasSize(1);
        FormFieldGroupVO g = groups.get(0);
        assertThat(g.source()).isEqualTo("sampled");
        assertThat(g.fields()).extracting(FormFieldVO::path)
                .containsExactly("city", "pop", "tags", "order");
        assertThat(g.fields()).extracting(FormFieldVO::type)
                .containsExactly("string", "number", "array", "object");
        FormFieldVO order = g.fields().get(3);
        assertThat(order.children()).extracting(FormFieldVO::path)
                .containsExactly("order.no", "order.qty");
    }

    @Test
    void publishedPreferredFallbackToLatestVersion() {
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("BUSINESS", "bill", "AFTER_CREATE")));
        String cc = "[{\"key\":\"amount\",\"label\":\"金额\",\"columnType\":\"DECIMAL\"}]";
        FormDefinition published = def("BUSINESS", "bill", cc, null);
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "bill", "PUBLISHED"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(published));

        // 第一次：PUBLISHED 缺失 → 回退最新版本
        FormDefinition latest = def("BUSINESS", "bill", cc, null);
        when(formDefs.findFirstByTenantIdAndKeyOrderByVersionDesc(TENANT, "bill"))
                .thenReturn(Optional.of(latest));
        List<FormFieldGroupVO> first = service.listFieldsForFlow(TENANT, FLOW_KEY);
        assertThat(first).hasSize(1);
        assertThat(first.get(0).fields()).extracting(FormFieldVO::path).containsExactly("amount");

        // 第二次：PUBLISHED 命中
        List<FormFieldGroupVO> second = service.listFieldsForFlow(TENANT, FLOW_KEY);
        assertThat(second).hasSize(1);
        assertThat(second.get(0).fields()).extracting(FormFieldVO::path).containsExactly("amount");
    }

    @Test
    void noBindingOrBadJsonYieldsEmptyGracefully() {
        // 无绑定
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of());
        assertThat(service.listFieldsForFlow(TENANT, FLOW_KEY)).isEmpty();

        // 绑定存在但表单定义缺失
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("BUSINESS", "ghost", "AFTER_CREATE")));
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "ghost", "PUBLISHED"))
                .thenReturn(Optional.empty());
        when(formDefs.findFirstByTenantIdAndKeyOrderByVersionDesc(TENANT, "ghost"))
                .thenReturn(Optional.empty());
        assertThat(service.listFieldsForFlow(TENANT, FLOW_KEY)).isEmpty();

        // columnConfig 坏 JSON → 回落 schema（也坏）→ 采样（空）→ empty 组
        FormDefinition broken = def("BUSINESS", "bad", "{not-json", "{also-bad");
        when(bindings.findByTenantIdAndFlowKeyAndEnabledTrueOrderByCreatedAtAsc(TENANT, FLOW_KEY))
                .thenReturn(List.of(binding("BUSINESS", "bad", "BEFORE_CREATE")));
        when(formDefs.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(TENANT, "bad", "PUBLISHED"))
                .thenReturn(Optional.of(broken));
        List<FormFieldGroupVO> groups = service.listFieldsForFlow(TENANT, FLOW_KEY);
        assertThat(groups).hasSize(1);
        assertThat(groups.get(0).source()).isEqualTo("empty");
        assertThat(groups.get(0).fields()).isEmpty();
    }
}
