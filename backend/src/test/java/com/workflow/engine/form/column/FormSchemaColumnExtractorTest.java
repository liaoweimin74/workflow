package com.workflow.engine.form.column;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * FormSchemaColumnExtractor 单元测试。
 * 输入为前端设计器生成并随表单持久化的 columnConfig JSON（用户确认过的列映射），解析为列定义列表。
 * 同时测试从表单 schema（form-create rule 数组）解析列定义。
 */
class FormSchemaColumnExtractorTest {

    private final FormSchemaColumnExtractor extractor = new FormSchemaColumnExtractor(new ObjectMapper());

    @Test
    void 标准数组解析_字段完整透传() {
        String cc = "[{\"key\":\"days\",\"label\":\"天数\",\"columnType\":\"INT\",\"componentType\":\"inputNumber\"}]";
        List<ColumnConfig> cols = extractor.extract(cc);
        assertEquals(1, cols.size());
        ColumnConfig c = cols.get(0);
        assertEquals("days", c.getKey());
        assertEquals("天数", c.getLabel());
        assertEquals("INT", c.getColumnType());
        assertEquals("inputNumber", c.getComponentType());
    }

    @Test
    void 多列解析保持原有顺序() {
        String cc = "[{\"key\":\"name\",\"columnType\":\"VARCHAR\"},"
                + "{\"key\":\"age\",\"columnType\":\"INT\"},"
                + "{\"key\":\"birthday\",\"columnType\":\"DATE\"}]";
        List<ColumnConfig> cols = extractor.extract(cc);
        assertEquals(3, cols.size());
        assertEquals("name", cols.get(0).getKey());
        assertEquals("age", cols.get(1).getKey());
        assertEquals("birthday", cols.get(2).getKey());
    }

    @Test
    void 空白输入返回空列表() {
        assertTrue(extractor.extract(null).isEmpty());
        assertTrue(extractor.extract("").isEmpty());
        assertTrue(extractor.extract("   ").isEmpty());
    }

    @Test
    void 非法或非数组JSON返回空列表() {
        assertTrue(extractor.extract("not-json").isEmpty());
        assertTrue(extractor.extract("{\"key\":\"x\"}").isEmpty());
    }

    @Test
    void 空数组返回空列表() {
        assertTrue(extractor.extract("[]").isEmpty());
    }

    @Test
    void 子表列的subColumns透传() {
        String cc = "[{\"key\":\"items\",\"columnType\":\"JSON\",\"componentType\":\"subForm\","
                + "\"subColumns\":[{\"key\":\"name\",\"columnType\":\"VARCHAR\"}]}]";
        List<ColumnConfig> cols = extractor.extract(cc);
        assertEquals(1, cols.size());
        assertNotNull(cols.get(0).getSubColumns());
        assertEquals(1, cols.get(0).getSubColumns().size());
        assertEquals("name", cols.get(0).getSubColumns().get(0).getKey());
    }

    // ===== extractFromSchema tests =====

    @Test
    void schema对象格式解析_带rule数组() {
        // form-create 规则中中文标签存储在 title 属性
        String schema = "{\"rule\":[{\"field\":\"reason\",\"title\":\"事由\",\"type\":\"input\"},"
                + "{\"field\":\"leaveDate\",\"title\":\"请假时间\",\"type\":\"date\"}]"
                + ",\"option\":{}}";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(2, cols.size());
        assertEquals("reason", cols.get(0).getKey());
        assertEquals("事由", cols.get(0).getLabel());
        assertEquals("VARCHAR", cols.get(0).getColumnType());
        assertEquals("input", cols.get(0).getComponentType());
        assertEquals("leaveDate", cols.get(1).getKey());
        assertEquals("请假时间", cols.get(1).getLabel());
        assertEquals("DATETIME", cols.get(1).getColumnType());
    }

    @Test
    void schema纯数组格式解析() {
        String schema = "[{\"field\":\"name\",\"title\":\"姓名\",\"type\":\"input\"},"
                + "{\"field\":\"age\",\"title\":\"年龄\",\"type\":\"inputNumber\"}]";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(2, cols.size());
        assertEquals("name", cols.get(0).getKey());
        assertEquals("姓名", cols.get(0).getLabel());
        assertEquals("age", cols.get(1).getKey());
        assertEquals("INT", cols.get(1).getColumnType());
    }

    @Test
    void schema跳过不支持的组件类型() {
        String schema = "[{\"field\":\"reason\",\"title\":\"事由\",\"type\":\"input\"},"
                + "{\"field\":\"picker\",\"title\":\"选择器\",\"type\":\"userPicker\"},"
                + "{\"field\":\"divider\",\"type\":\"divider\"}]";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(1, cols.size());
        assertEquals("reason", cols.get(0).getKey());
    }

    @Test
    void schema跳过数据表格组件page_table不生成列() {
        String schema = "[{\"field\":\"reason\",\"title\":\"事由\",\"type\":\"input\"},"
                + "{\"field\":\"tbl\",\"title\":\"数据表格\",\"type\":\"page-table\","
                + " \"props\":{\"dataSourceId\":\"ds_1\",\"columns\":[]}}]";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(1, cols.size());
        assertEquals("reason", cols.get(0).getKey());
    }

    @Test
    void schema跳过非法字段名() {
        String schema = "[{\"field\":\"123bad\",\"title\":\"坏字段\",\"type\":\"input\"},"
                + "{\"field\":\"good\",\"title\":\"好字段\",\"type\":\"input\"}]";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(1, cols.size());
        assertEquals("good", cols.get(0).getKey());
    }

    @Test
    void schema空白输入返回空列表() {
        assertTrue(extractor.extractFromSchema(null).isEmpty());
        assertTrue(extractor.extractFromSchema("").isEmpty());
        assertTrue(extractor.extractFromSchema("   ").isEmpty());
    }

    @Test
    void schema非法JSON返回空列表() {
        assertTrue(extractor.extractFromSchema("not-json").isEmpty());
        assertTrue(extractor.extractFromSchema("{}").isEmpty());
        assertTrue(extractor.extractFromSchema("{\"rule\":{}}").isEmpty());
    }

    @Test
    void schema嵌套布局容器_递归提取字段() {
        // form-create 布局容器（row/col）内部字段在 children 中
        String schema = "{\"rule\":["
                + "{\"type\":\"row\",\"children\":["
                + "  {\"type\":\"col\",\"children\":["
                + "    {\"field\":\"name\",\"title\":\"姓名\",\"type\":\"input\"}"
                + "  ]}"
                + "]},"
                + "{\"field\":\"age\",\"title\":\"年龄\",\"type\":\"inputNumber\"}"
                + "]}";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(2, cols.size());
        assertEquals("name", cols.get(0).getKey());
        assertEquals("姓名", cols.get(0).getLabel());
        assertEquals("age", cols.get(1).getKey());
        assertEquals("年龄", cols.get(1).getLabel());
    }

    @Test
    void schema子表单组件_递归提取props_rule字段() {
        // 子表单组件（group/subForm）内部字段在 props.rule 中
        String schema = "{\"rule\":["
                + "{\"field\":\"items\",\"title\":\"明细\",\"type\":\"group\","
                + " \"props\":{\"rule\":["
                + "   {\"field\":\"itemName\",\"title\":\"项目名称\",\"type\":\"input\"},"
                + "   {\"field\":\"quantity\",\"title\":\"数量\",\"type\":\"inputNumber\"}"
                + "]}}"
                + "]}";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(2, cols.size());
        assertEquals("itemName", cols.get(0).getKey());
        assertEquals("项目名称", cols.get(0).getLabel());
        assertEquals("quantity", cols.get(1).getKey());
        assertEquals("数量", cols.get(1).getLabel());
    }

    @Test
    void schema子表组件_递归提取props_columns_rule字段() {
        // 子表组件（tableForm）内部字段在 props.columns[].rule 中
        String schema = "{\"rule\":["
                + "{\"field\":\"table\",\"title\":\"表格\",\"type\":\"tableForm\","
                + " \"props\":{\"columns\":["
                + "   {\"rule\":[{\"field\":\"col1\",\"title\":\"列1\",\"type\":\"input\"}]},"
                + "   {\"rule\":[{\"field\":\"col2\",\"title\":\"列2\",\"type\":\"inputNumber\"}]}"
                + "]}}"
                + "]}";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(2, cols.size());
        assertEquals("col1", cols.get(0).getKey());
        assertEquals("列1", cols.get(0).getLabel());
        assertEquals("col2", cols.get(1).getKey());
        assertEquals("列2", cols.get(1).getLabel());
    }

    @Test
    void schema回退到label属性_当title不存在时() {
        // 兼容：如果 title 不存在，回退到 label 属性
        String schema = "[{\"field\":\"reason\",\"label\":\"事由\",\"type\":\"input\"}]";
        List<ColumnConfig> cols = extractor.extractFromSchema(schema);
        assertEquals(1, cols.size());
        assertEquals("reason", cols.get(0).getKey());
        assertEquals("事由", cols.get(0).getLabel());
    }
}
