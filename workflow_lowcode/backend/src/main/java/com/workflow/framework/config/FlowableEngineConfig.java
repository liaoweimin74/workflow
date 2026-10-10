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
                                               ObjectMapper objectMapper,
                                               @org.springframework.beans.factory.annotation.Value(
                                                       "${workflow.logic.http.allowed-hosts:}") java.util.List<String> allowedHosts) {
        // SSRF 防护：白名单支持精确主机与 *.example.com 后缀通配；空列表 = 放行全部 + 首次 WARN 一次
        //（默认空，兼容存量；生产建议 workflow.logic.http.allowed-hosts: api.example.com,*.example.com）
        return new HttpLogicExecutor(restClientBuilder, variableResolver, objectMapper, allowedHosts);
    }

    @Bean
    public GroovyScriptLogic groovyScriptLogic(
            @org.springframework.beans.factory.annotation.Value(
                    "${workflow.logic.script.timeout-ms:5000}") long scriptTimeoutMillis) {
        return new GroovyScriptLogic(scriptTimeoutMillis);
    }

    @Bean
    public ProcessConfigResolver processConfigResolver(NodeConfigRepository nodeConfigRepository,
                                                       ObjectMapper objectMapper) {
        return new ProcessConfigResolver(nodeConfigRepository, objectMapper);
    }

    /** 逻辑编排引擎：复用三型执行器（HTTP/Bean/Groovy 沙箱）+ 条件求值 + 子流程调用 + 数据节点 + 通知/延时/转换/聚合/LLM，独立于 BPMN 流程运行。 */
    @Bean
    public com.workflow.engine.logicflow.engine.LogicFlowEngine logicFlowEngine(
            HttpLogicExecutor httpExecutor,
            GroovyScriptLogic groovyScriptLogic,
            BackendBeanRegistry backendBeanRegistry,
            VariableResolver variableResolver,
            ObjectMapper objectMapper,
            com.workflow.engine.logicflow.repository.LogicFlowDefRepository logicFlowDefRepository,
            org.springframework.jdbc.core.JdbcTemplate jdbcTemplate,
            com.workflow.engine.form.column.DynamicTableManager dynamicTableManager,
            com.workflow.engine.form.bizdata.BizDataSupport bizDataSupport,
            com.workflow.engine.tenant.TenantProvider tenantProvider,
            com.workflow.notification.dispatch.MessageSender messageSender,
            com.workflow.ai.model.ChatModel chatModel) {
        return new com.workflow.engine.logicflow.engine.LogicFlowEngine(
                httpExecutor, groovyScriptLogic, backendBeanRegistry, variableResolver, objectMapper,
                logicFlowDefRepository, jdbcTemplate, dynamicTableManager,
                bizDataSupport, tenantProvider, messageSender, chatModel);
    }

    @Bean
    public BackendBeanRegistry backendBeanRegistry(ApplicationContext applicationContext) {
        return new BackendBeanRegistry(applicationContext);
    }
}