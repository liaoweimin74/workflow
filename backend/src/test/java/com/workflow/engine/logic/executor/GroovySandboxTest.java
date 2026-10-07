package com.workflow.engine.logic.executor;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GroovySandboxTest {

    private final GroovyScriptLogic logic = new GroovyScriptLogic(3000);

    // ---------- 既有行为保持（原 GroovyScriptLogicTest 全量语义） ----------

    @Test
    void execute_scriptReadsVariables() {
        Object result = logic.execute("greeting + ' ' + name + '!'",
                null, Map.of("name", "World", "greeting", "Hello"));
        assertEquals("Hello World!", result);
    }

    @Test
    void execute_scriptReturnsLastExpressionValue() {
        Object result = logic.execute("a + b", null, Map.of("a", 3, "b", 4));
        assertEquals(7, result);
    }

    @Test
    void execute_scriptExceptionPropagates() {
        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> logic.execute("throw new RuntimeException('boom')", null, Map.of()));
        assertEquals("boom", ex.getCause().getMessage());
    }

    // ---------- 沙箱拦截：危险 API 不可达 ----------

    @Test
    void sandbox_blocksSystemExit() {
        assertThrows(SecurityException.class,
                () -> logic.execute("System.exit(1)", null, Map.of()));
    }

    @Test
    void sandbox_blocksRuntime() {
        assertThrows(Exception.class,
                () -> logic.execute("Runtime.getRuntime().availableProcessors()", null, Map.of()));
    }

    @Test
    void sandbox_blocksFileConstruction() {
        assertThrows(SecurityException.class,
                () -> logic.execute("new File('/etc/passwd').text", null, Map.of()));
    }

    @Test
    void sandbox_blocksFullQualifiedNameBypass() {
        // indirectImportCheckEnabled：全限定名绕过同样被拦
        assertThrows(SecurityException.class,
                () -> logic.execute("java.lang.Runtime.getRuntime()", null, Map.of()));
    }

    @Test
    void sandbox_blocksMethodDefinition() {
        // 禁止脚本内定义方法（防递归/隐藏入口）
        assertThrows(Exception.class,
                () -> logic.execute("def evil() { return 1 }\nevil()", null, Map.of()));
    }

    @Test
    void sandbox_blocksThreadSpawn() {
        assertThrows(SecurityException.class,
                () -> logic.execute("new Thread({}).start()", null, Map.of()));
    }

    // ---------- 安全能力不受限时仍可用 ----------

    @Test
    void sandbox_allowsCommonCollectionsAndMath() {
        Object result = logic.execute(
                "def list = new ArrayList(); list.add(a); list.add(b); [list.size(), list[0] + list[1]]",
                null, Map.of("a", 1, "b", 2));
        assertEquals("[2, 3]", String.valueOf(result));
    }

    @Test
    void sandbox_conditionStyleBooleanExpression() {
        Object result = logic.execute("amount > 100 && level == 'VIP'",
                null, Map.of("amount", 200, "level", "VIP"));
        assertEquals(Boolean.TRUE, result);
    }
}
