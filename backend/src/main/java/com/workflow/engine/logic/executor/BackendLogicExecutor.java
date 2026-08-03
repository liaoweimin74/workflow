package com.workflow.engine.logic.executor;

import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendLogicBeanConfig;
import com.workflow.engine.logic.config.BackendLogicHttpConfig;
import com.workflow.engine.logic.config.BackendLogicItemConfig;
import com.workflow.engine.logic.config.BackendLogicScriptConfig;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.resolver.ProcessConfigResolver;
import org.flowable.engine.RuntimeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

/**
 * 后端业务逻辑分发执行器。
 *
 * <p>根据节点配置（来自 {@link ProcessConfigResolver}），在节点进入/完成时按序执行其后端逻辑：
 * HTTP 调用 / Groovy 脚本 / 白名单 Bean 方法。执行成功且配置了 {@code resultVar} 则把结果写回流程变量；
 * 异常按 {@code errorAction} 决定是记录后继续（IGNORE_CONTINUE）还是抛出中断（FAIL_FLOW）。
 */
public class BackendLogicExecutor {

    private static final Logger log = LoggerFactory.getLogger(BackendLogicExecutor.class);

    private static final String TYPE_HTTP = "http";
    private static final String TYPE_BEAN = "bean";
    private static final String TYPE_SCRIPT = "script";
    private static final String ACTION_CONTINUE = "IGNORE_CONTINUE";

    private final ProcessConfigResolver processConfigResolver;
    private final HttpLogicExecutor httpExecutor;
    private final GroovyScriptLogic groovyScriptLogic;
    private final BackendBeanRegistry backendBeanRegistry;
    private final RuntimeService runtimeService;

    public BackendLogicExecutor(ProcessConfigResolver processConfigResolver,
                                HttpLogicExecutor httpExecutor,
                                GroovyScriptLogic groovyScriptLogic,
                                BackendBeanRegistry backendBeanRegistry,
                                RuntimeService runtimeService) {
        this.processConfigResolver = processConfigResolver;
        this.httpExecutor = httpExecutor;
        this.groovyScriptLogic = groovyScriptLogic;
        this.backendBeanRegistry = backendBeanRegistry;
        this.runtimeService = runtimeService;
    }

    /**
     * 对指定流程定义的某节点，执行匹配 {@code trigger} 的后端逻辑。
     *
     * @param processDefinitionId 流程定义 id
     * @param nodeId              BPMN 节点 id
     * @param trigger             触发时机（ENTER / COMPLETE），大小写不敏感
     * @param executionId         Flowable 执行实例 id（用于读写流程变量）
     */
    public void execute(String processDefinitionId, String nodeId, String trigger, String executionId) {
        Map<String, List<BackendLogicItemConfig>> configs = processConfigResolver.resolve(processDefinitionId);
        List<BackendLogicItemConfig> items = configs.get(nodeId);
        if (items == null || items.isEmpty()) {
            return;
        }

        Map<String, Object> vars = runtimeService.getVariables(executionId);
        for (BackendLogicItemConfig item : items) {
            if (!item.isEnabled()) {
                continue;
            }
            if (trigger == null || !trigger.equalsIgnoreCase(item.getTrigger())) {
                continue;
            }
            executeItem(item, executionId, vars);
        }
    }

    private void executeItem(BackendLogicItemConfig item, String executionId, Map<String, Object> vars) {
        try {
            Object result = dispatch(item, vars);
            String resultVar = item.getResultVar();
            if (resultVar != null && !resultVar.isBlank()) {
                runtimeService.setVariable(executionId, resultVar, result);
            }
        } catch (Exception e) {
            if (!ACTION_CONTINUE.equalsIgnoreCase(item.getErrorAction())) {
                throw new RuntimeException("Backend logic '" + item.getName() + "' failed", e);
            }
            log.warn("Backend logic '{}' (type={}) failed, IGNORE_CONTINUE: {}", item.getName(), item.getType(),
                    e.getMessage());
        }
    }

    private Object dispatch(BackendLogicItemConfig item, Map<String, Object> vars) {
        String type = item.getType();
        if (TYPE_HTTP.equalsIgnoreCase(type)) {
            return executeHttp(item.getHttp(), vars);
        }
        if (TYPE_BEAN.equalsIgnoreCase(type)) {
            return executeBean(item.getBean(), vars);
        }
        if (TYPE_SCRIPT.equalsIgnoreCase(type)) {
            return executeScript(item.getScript(), vars);
        }
        throw new IllegalArgumentException("UNSUPPORTED_LOGIC_TYPE: " + type);
    }

    private Object executeHttp(BackendLogicHttpConfig cfg, Map<String, Object> vars) {
        if (cfg == null) {
            throw new IllegalArgumentException("HTTP logic requires http config");
        }
        return httpExecutor.execute(
                cfg.getUrl(),
                cfg.getMethod(),
                cfg.getHeaders(),
                cfg.getQueryParams() != null ? cfg.getQueryParams() : List.of(),
                cfg.getBodyParams() != null ? cfg.getBodyParams() : List.of(),
                vars,
                cfg.getConnTimeoutMs(),
                cfg.getReadTimeoutMs(),
                cfg.getRetryCount());
    }

    private Object executeBean(BackendLogicBeanConfig cfg, Map<String, Object> vars) {
        if (cfg == null) {
            throw new IllegalArgumentException("Bean logic requires bean config");
        }
        List<ParamMapping> params = cfg.getParams() != null ? cfg.getParams() : List.of();
        Object[] args = params.stream()
                .map(pm -> vars.get(pm.source()))
                .toArray();
        return backendBeanRegistry.invoke(cfg.getBeanName(), cfg.getMethodName(), args);
    }

    private Object executeScript(BackendLogicScriptConfig cfg, Map<String, Object> vars) {
        if (cfg == null) {
            throw new IllegalArgumentException("Script logic requires script config");
        }
        if (!"groovy".equalsIgnoreCase(cfg.getLanguage())) {
            throw new IllegalArgumentException("UNSUPPORTED_LANGUAGE: " + cfg.getLanguage());
        }
        return groovyScriptLogic.execute(cfg.getSource(), null, vars);
    }
}