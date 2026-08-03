package com.workflow.framework.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.BackendLogicExecutor;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.listener.BackendLogicEventListener;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logic.resolver.ProcessConfigResolver;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import org.flowable.engine.RuntimeService;
import org.flowable.spring.boot.ProcessEngineConfigurationConfigurer;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Flowable 引擎及后端业务逻辑执行组件的装配配置。
 *
 * <p>通过 {@link ProcessEngineConfigurationConfigurer} 注册全局 {@link BackendLogicEventListener}，
 * 并在容器中装配后端逻辑执行链路所需的 Bean（解析器、执行器、白名单注册表等）。
 */
@Configuration
public class FlowableEngineConfig {

    /** 注册 Flowable 全局事件监听器，驱动节点后端逻辑执行。 */
    @Bean
    public ProcessEngineConfigurationConfigurer processEngineConfigurer(BackendLogicEventListener listener) {
        return configuration -> configuration.setEventListeners(java.util.List.of(listener));
    }

    @Bean
    public BackendLogicEventListener backendLogicEventListener(BackendLogicExecutor executor) {
        return new BackendLogicEventListener(executor);
    }

    @Bean
    public BackendLogicExecutor backendLogicExecutor(ProcessConfigResolver resolver,
                                                     HttpLogicExecutor httpExecutor,
                                                     GroovyScriptLogic groovyScriptLogic,
                                                     BackendBeanRegistry backendBeanRegistry,
                                                     ObjectProvider<RuntimeService> runtimeServiceProvider) {
        // 通过 ObjectProvider 延迟解析 RuntimeService，打破与 Flowable processEngine 的装配期循环依赖。
        return new BackendLogicExecutor(resolver, httpExecutor, groovyScriptLogic, backendBeanRegistry,
                runtimeServiceProvider::getObject);
    }

    @Bean
    public VariableResolver variableResolver() {
        return new VariableResolver();
    }

    @Bean
    public HttpLogicExecutor httpLogicExecutor(RestClient.Builder restClientBuilder,
                                               VariableResolver variableResolver,
                                               ObjectMapper objectMapper) {
        return new HttpLogicExecutor(restClientBuilder, variableResolver, objectMapper);
    }

    @Bean
    public GroovyScriptLogic groovyScriptLogic() {
        return new GroovyScriptLogic();
    }

    @Bean
    public ProcessConfigResolver processConfigResolver(ProcessDraftRepository processDraftRepository,
                                                       NodeConfigRepository nodeConfigRepository,
                                                       ObjectMapper objectMapper) {
        return new ProcessConfigResolver(processDraftRepository, nodeConfigRepository, objectMapper);
    }

    @Bean
    public BackendBeanRegistry backendBeanRegistry(ApplicationContext applicationContext) {
        return new BackendBeanRegistry(applicationContext);
    }
}