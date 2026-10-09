package com.workflow.engine.logic.executor;

import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendLogicBeanConfig;
import com.workflow.engine.logic.config.BackendLogicHttpConfig;
import com.workflow.engine.logic.config.BackendLogicItemConfig;
import com.workflow.engine.logic.config.BackendLogicScriptConfig;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.resolver.ProcessConfigResolver;
import org.flowable.engine.RuntimeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackendLogicExecutorTest {

    private ProcessConfigResolver resolver;
    private HttpLogicExecutor httpExecutor;
    private GroovyScriptLogic scriptLogic;
    private BackendBeanRegistry beanRegistry;
    private RuntimeService runtimeService;
    private BackendLogicExecutor executor;

    @BeforeEach
    void setUp() {
        resolver = mock(ProcessConfigResolver.class);
        httpExecutor = mock(HttpLogicExecutor.class);
        scriptLogic = mock(GroovyScriptLogic.class);
        beanRegistry = mock(BackendBeanRegistry.class);
        runtimeService = mock(RuntimeService.class);
        executor = new BackendLogicExecutor(resolver, httpExecutor, scriptLogic, beanRegistry, runtimeService);
        when(runtimeService.getVariables("exec-1")).thenReturn(Map.of("v", "val"));
    }

    @Test
    void disabledItemIsSkipped() {
        BackendLogicItemConfig item = httpItem("ENTER", false);
        withConfig(item);

        executor.execute("d1", "n1", "ENTER", "exec-1");

        verify(httpExecutor, never()).execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void triggerMismatchIsSkipped() {
        BackendLogicItemConfig item = httpItem("ENTER", true);
        withConfig(item);

        executor.execute("d1", "n1", "COMPLETE", "exec-1");

        verify(httpExecutor, never()).execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void triggerMatchDispatchesHttp() {
        BackendLogicItemConfig item = httpItem("svc", true);
        withConfig(item);
        when(httpExecutor.execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenReturn("http-result");

        executor.execute("d1", "n1", "ENTER", "exec-1");

        verify(httpExecutor).execute(
                eq("http://svc"), eq("GET"), eq(Map.of("h", "1")),
                eq(List.of(new ParamMapping("src", "q"))), eq(List.of(new ParamMapping("src", "b"))),
                any(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void multiItemExecutesInOrder() {
        BackendLogicItemConfig first = httpItem("first", true);
        BackendLogicItemConfig second = httpItem("second", true);
        withConfig(first, second);

        executor.execute("d1", "n1", "ENTER", "exec-1");

        org.mockito.ArgumentCaptor<String> urlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(httpExecutor, times(2)).execute(urlCaptor.capture(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt());
        List<String> urls = urlCaptor.getAllValues();
        assertEquals("http://first", urls.get(0));
        assertEquals("http://second", urls.get(1));
    }

    @Test
    void failFlowPropagatesException() {
        BackendLogicItemConfig item = httpItem("boom", true);
        item.setErrorAction("FAIL_FLOW");
        withConfig(item);
        when(httpExecutor.execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenThrow(new RuntimeException("http down"));

        assertThrows(RuntimeException.class, () -> executor.execute("d1", "n1", "ENTER", "exec-1"));
    }

    @Test
    void ignoreContinueLogsAndContinues() {
        BackendLogicItemConfig failing = httpItem("fail", true);
        failing.setErrorAction("IGNORE_CONTINUE");
        BackendLogicItemConfig ok = httpItem("ok", true);
        withConfig(failing, ok);
        when(httpExecutor.execute(
                        any(), eq("GET"), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenThrow(new RuntimeException("http down"))
                .thenReturn("ok-result");

        executor.execute("d1", "n1", "ENTER", "exec-1");

        verify(httpExecutor, times(2)).execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void resultVarWritesBackToRuntimeService() {
        BackendLogicItemConfig item = httpItem("svc", true);
        item.setResultVar("out");
        withConfig(item);
        when(httpExecutor.execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt()))
                .thenReturn("result-value");

        executor.execute("d1", "n1", "ENTER", "exec-1");

        verify(runtimeService).setVariable("exec-1", "out", "result-value");
    }

    @Test
    void invalidLanguageThrows() {
        BackendLogicItemConfig item = item("g", "ENTER", "script", "script");
        item.setErrorAction("FAIL_FLOW");
        BackendLogicScriptConfig sc = new BackendLogicScriptConfig();
        sc.setLanguage("python");
        sc.setSource("print('x')");
        item.setScript(sc);
        withConfig(item);

        assertThrows(RuntimeException.class, () -> executor.execute("d1", "n1", "ENTER", "exec-1"));
    }

    @Test
    void beanLogicInvokesRegistry() {
        BackendLogicItemConfig item = item("b", "ENTER", "bean", "bean");
        BackendLogicBeanConfig bc = new BackendLogicBeanConfig();
        bc.setBeanName("orderService");
        bc.setMethodName("sync");
        bc.setParams(List.of(new ParamMapping("T", "id")));
        item.setBean(bc);
        withConfig(item);
        when(beanRegistry.invoke(eq("orderService"), eq("sync"), any()))
                .thenReturn("bean-result");

        executor.execute("d1", "n1", "ENTER", "exec-1");

        verify(beanRegistry).invoke(eq("orderService"), eq("sync"), any());
    }

    @Test
    void nonListedNodeIsNoOp() {
        when(resolver.resolve("d1")).thenReturn(Map.of());

        executor.execute("d1", "missing", "ENTER", "exec-1");

        verify(httpExecutor, never()).execute(any(), any(), any(), any(), any(), any(), anyInt(), anyInt(), anyInt());
    }

    // ---- helpers ----

    private void withConfig(BackendLogicItemConfig... items) {
        when(resolver.resolve("d1")).thenReturn(Map.of("n1", List.of(items)));
    }

    private BackendLogicItemConfig httpItem(String name, boolean enabled) {
        BackendLogicHttpConfig hc = new BackendLogicHttpConfig();
        hc.setUrl("http://" + name);
        hc.setMethod("GET");
        hc.setHeaders(Map.of("h", "1"));
        hc.setQueryParams(List.of(new ParamMapping("src", "q")));
        hc.setBodyParams(List.of(new ParamMapping("src", "b")));
        hc.setConnTimeoutMs(5000);
        hc.setReadTimeoutMs(10000);
        hc.setRetryCount(0);
        BackendLogicItemConfig item = item(name, "ENTER", "http", name);
        item.setEnabled(enabled);
        item.setHttp(hc);
        return item;
    }

    private BackendLogicItemConfig item(String name, String trigger, String type, String id) {
        BackendLogicItemConfig item = new BackendLogicItemConfig();
        item.setId(id);
        item.setName(name);
        item.setEnabled(true);
        item.setTrigger(trigger);
        item.setType(type);
        item.setErrorAction("IGNORE_CONTINUE");
        return item;
    }
}