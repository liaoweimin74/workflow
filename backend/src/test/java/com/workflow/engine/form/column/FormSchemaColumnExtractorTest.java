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
}
