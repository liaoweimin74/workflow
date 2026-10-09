package com.workflow.engine.logic;

import com.workflow.engine.logic.annotation.BackendLogicBean;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;

import java.util.Collection;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BackendBeanRegistryTest {

    /** 一个可被流程调用的白名单 Bean。 */
    @BackendLogicBean
    static class SampleSyncService {
        @SuppressWarnings("unused")
        public String syncOrder(String orderId, Integer amount) {
            return "synced:" + orderId;
        }
    }

    /** 未标注注解的 Bean（不应被扫描/注册）。 */
    static class NotAnnotatedService {
        @SuppressWarnings("unused")
        public void doSomething() {
        }
    }

    @Test
    void listMethods_scansAnnotatedBeans_andListsRegisteredMethods() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansWithAnnotation(BackendLogicBean.class))
                .thenReturn(Map.of("sampleSyncService", new SampleSyncService()));

        BackendBeanRegistry registry = new BackendBeanRegistry(ctx);

        Collection<RegisteredBeanMethod> methods = registry.listMethods();
        assertTrue(methods.stream().anyMatch(m ->
                m.beanName().equals("sampleSyncService")
                        && m.methodName().equals("syncOrder")
                        && m.parameterCount() == 2), "registered method should be listed");
    }

    @Test
    void listMethods_doesNotIncludeNonAnnotatedBeans() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansWithAnnotation(BackendLogicBean.class)).thenReturn(Map.of());

        BackendBeanRegistry registry = new BackendBeanRegistry(ctx);

        assertTrue(registry.listMethods().isEmpty(), "no annotated beans → no methods");
    }

    @Test
    void requireMethod_registeredMethod_returnsIt() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansWithAnnotation(BackendLogicBean.class))
                .thenReturn(Map.of("sampleSyncService", new SampleSyncService()));

        BackendBeanRegistry registry = new BackendBeanRegistry(ctx);

        RegisteredBeanMethod m = registry.require("sampleSyncService", "syncOrder");
        assertEquals("sampleSyncService", m.beanName());
        assertEquals(2, m.parameterCount());
    }

    @Test
    void requireMethod_unregisteredMethod_throws() {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansWithAnnotation(BackendLogicBean.class)).thenReturn(Map.of());

        BackendBeanRegistry registry = new BackendBeanRegistry(ctx);

        assertThrows(IllegalArgumentException.class, () ->
                registry.require("sampleSyncService", "notRegistered"));
    }
}