package com.workflow.engine.logic.executor;

import org.flowable.engine.delegate.DelegateExecution;
import org.junit.jupiter.api.Test;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GroovyScriptLogicTest {

    private final GroovyScriptLogic logic = new GroovyScriptLogic();

    @Test
    void execute_scriptReadsVariables() {
        DelegateExecution execution = mock(DelegateExecution.class);
        Map<String, Object> vars = Map.of("name", "World", "greeting", "Hello");

        Object result = logic.execute("greeting + ' ' + name + '!'", execution, vars);

        assertEquals("Hello World!", result);
    }

    @Test
    void execute_scriptReturnsLastExpressionValue() {
        DelegateExecution execution = mock(DelegateExecution.class);
        Map<String, Object> vars = Map.of("a", 3, "b", 4);

        Object result = logic.execute("a + b", execution, vars);

        assertEquals(7, result);
    }

    @Test
    void execute_scriptExceptionPropagates() {
        DelegateExecution execution = mock(DelegateExecution.class);
        Map<String, Object> vars = Map.of();

        Exception ex = assertThrows(RuntimeException.class, () ->
                logic.execute("throw new RuntimeException('boom')", execution, vars));

        assertEquals("boom", ex.getCause().getMessage());
    }
}