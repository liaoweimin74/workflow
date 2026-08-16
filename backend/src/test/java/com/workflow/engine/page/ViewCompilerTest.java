package com.workflow.engine.page;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.page.entity.PageDefinition;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ViewCompiler 单元测试（TDD）。
 * 视图配置 {searchFields, columns, actions, detail, events} → 编译产物 {rule, option}。
 */
class ViewCompilerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ViewCompiler compiler = new ViewCompiler(objectMapper);

    private ColumnConfig col(String key, String columnType, boolean hidden) {
        ColumnConfig c = new ColumnConfig();
        c.setKey(key);
        c.setLabel(key);
        c.setColumnType(columnType);
        c.setHidden(hidden);
        return c;
    }

    private PageDefinition viewPage(String schema) {
        PageDefinition page = new PageDefinition();
        page.setType("VIEW");
        page.setFormKey("leave");
        page.setSchema(schema);
        return page;
    }

    private List<ColumnConfig> columns() {
        return List.of(
                col("name", "VARCHAR", false),
                col("apply_date", "DATE", false),
                col("amount", "DECIMAL", false),
                col("secret", "VARCHAR", true));
    }

    // ==================== matchType 校验 ====================

    @Test
    void unknownMatchType_rejected() {
        PageDefinition page = viewPage(
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"fuzzy-unknown\"}]}");
        assertThrows(BusinessException.class, () -> compiler.compile(page, columns()));
    }

    // ==================== searchFields → 查询条件 rule ====================

    @Test
    void searchFieldEq_compilesToInput() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"eq\"}]}"), columns()));
        JsonNode rule = compiled.path("rule");
        assertTrue(rule.isArray() && rule.size() > 0);
        String ruleJson = rule.toString();
        assertTrue(ruleJson.contains("\"field\":\"name\""));
        assertTrue(ruleJson.contains("\"type\":\"input\""));
    }

    @Test
    void searchFieldRangeDate_compilesToDateRange() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"searchFields\":[{\"key\":\"apply_date\",\"label\":\"申请日期\",\"matchType\":\"range\"}]}"), columns()));
        String ruleJson = compiled.path("rule").toString();
        assertTrue(ruleJson.contains("\"field\":\"apply_date\""));
        assertTrue(ruleJson.contains("\"type\":\"datePicker\""));
    }

    // ==================== columns → 表格列 rule ====================

    @Test
    void columns_compileTableColumnRules() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"},{\"key\":\"apply_date\",\"label\":\"日期\"}]}"), columns()));
        JsonNode rule = compiled.path("rule");
        String ruleJson = rule.toString();
        assertTrue(ruleJson.contains("\"type\":\"table\""));
        assertTrue(ruleJson.contains("\"prop\":\"name\""));
        assertTrue(ruleJson.contains("\"label\":\"姓名\""));
        assertTrue(ruleJson.contains("\"prop\":\"apply_date\""));
    }

    // ==================== actions / detail / events ====================

    @Test
    void actions_compileButtonRules() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"create\":true,\"edit\":true,\"delete\":false,\"view\":true}}"), columns()));
        String ruleJson = compiled.path("rule").toString();
        assertTrue(ruleJson.contains("\"create\""));
        assertTrue(ruleJson.contains("\"edit\""));
        assertFalse(ruleJson.contains("\"delete\""));
    }

    @Test
    void detail_whenDisabled_notIncluded() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"detail\":{\"enabled\":false}}"), columns()));
        assertFalse(compiled.path("rule").toString().contains("\"detail\""));
    }

    @Test
    void events_attachedToRule() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"events\":[{\"trigger\":{\"componentId\":\"table\",\"event\":\"row-click\"},\"steps\":[{\"action\":\"openDetail\"}]}]}"), columns()));
        String ruleJson = compiled.path("rule").toString();
        assertTrue(ruleJson.contains("\"events\""));
        assertTrue(ruleJson.contains("\"openDetail\""));
    }

    // ==================== 合法配置 ====================

    @Test
    void validViewConfig_compilesToRuleAndOption() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"searchFields\":[{\"key\":\"name\",\"label\":\"姓名\",\"matchType\":\"like\"}],"
                        + "\"columns\":[{\"key\":\"name\",\"label\":\"姓名\"}],"
                        + "\"actions\":{\"view\":true},\"detail\":{\"enabled\":true,\"width\":\"800px\"}}"), columns()));
        assertTrue(compiled.has("rule"));
        assertTrue(compiled.has("option"));
        assertTrue(compiled.path("rule").isArray() && compiled.path("rule").size() > 0);
    }

    private JsonNode parse(String json) throws Exception {
        return objectMapper.readTree(json);
    }
}