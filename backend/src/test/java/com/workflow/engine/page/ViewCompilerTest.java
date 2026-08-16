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

    // ==================== actions placement / style（操作列 + 按钮形态） ====================

    @Test
    void actions_defaultPlacementColumn_andDefaultStyleButton() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"create\":true,\"edit\":true,\"delete\":true,\"view\":true}}"), columns()));
        // 未显式配置时：行操作默认操作列（column），按钮形态默认 button
        JsonNode actionsNode = findRuleByType(compiled, "__page_actions");
        assertNotNull(actionsNode, "编译产物应含 __page_actions");
        JsonNode props = actionsNode.path("props");
        assertEquals("column", props.path("placement").asText());
        assertEquals("button", props.path("style").asText());
    }

    // ==================== actions 按钮数组（每按钮独立配置 + 自定义按钮） ====================

    @Test
    void actions_buttonsArray_compilesEachButtonWithPlacementAndStyle() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":["
                        + "{\"key\":\"create\",\"label\":\"新增\",\"placement\":\"toolbar\",\"style\":\"button\"},"
                        + "{\"key\":\"edit\",\"label\":\"编辑\",\"placement\":\"column\",\"style\":\"icon\"},"
                        + "{\"key\":\"delete\",\"label\":\"删除\",\"placement\":\"column\",\"style\":\"text\"}"
                        + "]}}"), columns()));
        JsonNode actionsNode = findRuleByType(compiled, "__page_actions");
        assertNotNull(actionsNode, "编译产物应含 __page_actions");
        JsonNode buttons = actionsNode.path("props").path("buttons");
        assertTrue(buttons.isArray() && buttons.size() == 3);
        assertEquals("create", buttons.get(0).path("key").asText());
        assertEquals("toolbar", buttons.get(0).path("placement").asText());
        assertEquals("button", buttons.get(0).path("style").asText());
        assertEquals("edit", buttons.get(1).path("key").asText());
        assertEquals("column", buttons.get(1).path("placement").asText());
        assertEquals("icon", buttons.get(1).path("style").asText());
        assertEquals("delete", buttons.get(2).path("key").asText());
        assertEquals("text", buttons.get(2).path("style").asText());
    }

    @Test
    void actions_customButtonWithEvents_compiledWithEvents() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":["
                        + "{\"key\":\"approve\",\"label\":\"审批\",\"placement\":\"column\",\"style\":\"text\","
                        + "\"events\":[{\"trigger\":\"click\",\"actions\":[{\"type\":\"message\",\"params\":[{\"key\":\"text\",\"value\":\"已审批\"}]}]}]}"
                        + "]}}"), columns()));
        JsonNode buttons = findRuleByType(compiled, "__page_actions").path("props").path("buttons");
        JsonNode custom = buttons.get(0);
        assertEquals("approve", custom.path("key").asText());
        assertTrue(custom.path("events").isArray());
        assertEquals("click", custom.path("events").get(0).path("trigger").asText());
        assertEquals("message", custom.path("events").get(0).path("actions").get(0).path("type").asText());
    }

    @Test
    void actions_customButtonWithIcon_iconPassedThrough() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":["
                        + "{\"key\":\"approve\",\"label\":\"审批\",\"placement\":\"column\",\"style\":\"icon\",\"icon\":\"Search\"}"
                        + "]}}"), columns()));
        JsonNode buttons = findRuleByType(compiled, "__page_actions").path("props").path("buttons");
        JsonNode custom = buttons.get(0);
        assertEquals("Search", custom.path("icon").asText());
    }

    @Test
    void actions_builtinButtonWithoutIcon_iconAbsent() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":["
                        + "{\"key\":\"create\",\"label\":\"新增\",\"placement\":\"toolbar\",\"style\":\"button\"}"
                        + "]}}"), columns()));
        JsonNode buttons = findRuleByType(compiled, "__page_actions").path("props").path("buttons");
        assertFalse(buttons.get(0).has("icon"));
    }

    @Test
    void actions_buttonArrayMissingRequiredFields_rejected() {
        PageDefinition page = viewPage(
                "{\"actions\":{\"buttons\":[{\"key\":\"\"}]}}");
        assertThrows(BusinessException.class, () -> compiler.compile(page, columns()));
    }

    // ==================== detail 由 view 按钮启用（并入操作） ====================

    @Test
    void detail_viewButtonEnabled_compilesDetailRule() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":[{\"key\":\"view\",\"label\":\"查看\",\"placement\":\"column\",\"style\":\"button\"}]},"
                        + "\"detail\":{\"width\":\"900px\",\"type\":\"form\"}}"), columns()));
        JsonNode detailNode = findRuleByType(compiled, "__page_detail");
        assertNotNull(detailNode, "view 按钮启用时应编译 __page_detail");
        assertEquals("900px", detailNode.path("props").path("width").asText());
    }

    @Test
    void detail_viewButtonDisabled_detailNotCompiled() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"编辑\",\"placement\":\"column\",\"style\":\"button\"}]},"
                        + "\"detail\":{\"width\":\"900px\",\"type\":\"form\"}}"), columns()));
        JsonNode detailNode = findRuleByType(compiled, "__page_detail");
        assertNull(detailNode, "未启用 view 按钮时不应编译 __page_detail");
    }

    @Test
    void actions_explicitPlacementAndStyle_passedThrough() throws Exception {
        JsonNode compiled = parse(compiler.compile(viewPage(
                "{\"actions\":{\"create\":true,\"edit\":true,\"delete\":true,\"view\":true,"
                        + "\"placement\":\"toolbar\",\"style\":\"icon\"}}"), columns()));
        JsonNode props = findRuleByType(compiled, "__page_actions").path("props");
        assertEquals("toolbar", props.path("placement").asText());
        assertEquals("icon", props.path("style").asText());
    }

    @Test
    void actions_invalidPlacementOrStyle_rejected() {
        PageDefinition page = viewPage(
                "{\"actions\":{\"create\":true,\"edit\":true,\"delete\":true,\"view\":true,"
                        + "\"placement\":\"popup\",\"style\":\"icon\"}}");
        assertThrows(BusinessException.class, () -> compiler.compile(page, columns()));
    }

    /** 按 rule.type 查找编译产物节点 */
    private JsonNode findRuleByType(JsonNode compiled, String type) {
        JsonNode rule = compiled.path("rule");
        for (JsonNode node : rule) {
            if (type.equals(node.path("type").asText())) {
                return node;
            }
        }
        return null;
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