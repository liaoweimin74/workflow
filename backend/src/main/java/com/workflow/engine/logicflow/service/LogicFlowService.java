package com.workflow.engine.logicflow.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import com.workflow.engine.logicflow.engine.LogicFlowDslValidator;
import com.workflow.engine.logicflow.engine.LogicFlowEngine;
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.entity.LogicFlowRun;
import com.workflow.engine.logicflow.repository.LogicFlowDefRepository;
import com.workflow.engine.logicflow.repository.LogicFlowRunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 逻辑编排应用服务：定义 CRUD（租户隔离）、发布校验、运行与运行历史。
 *
 * <p>运行口径：以当前已存 DSL（草稿或已发布）测试运行，每次运行落一条
 * {@link LogicFlowRun} 历史；发布时做图结构硬校验 + bean 白名单校验。
 */
@Service
public class LogicFlowService {

    private static final Logger log = LoggerFactory.getLogger(LogicFlowService.class);

    /** flowKey 规则：字母开头，2-64 位字母/数字/下划线/中划线。 */
    private static final Pattern KEY_PATTERN = Pattern.compile("[a-zA-Z][a-zA-Z0-9_-]{1,63}");

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_PUBLISHED = "PUBLISHED";
    private static final String DEFAULT_TENANT = "default";

    private final LogicFlowDefRepository repository;
    private final LogicFlowRunRepository runRepository;
    private final ObjectMapper objectMapper;
    private final LogicFlowEngine engine;
    private final LogicFlowDslValidator validator;
    private final BackendBeanRegistry backendBeanRegistry;

    public LogicFlowService(LogicFlowDefRepository repository,
                            LogicFlowRunRepository runRepository,
                            ObjectMapper objectMapper,
                            LogicFlowEngine engine,
                            LogicFlowDslValidator validator,
                            BackendBeanRegistry backendBeanRegistry) {
        this.repository = repository;
        this.runRepository = runRepository;
        this.objectMapper = objectMapper;
        this.engine = engine;
        this.validator = validator;
        this.backendBeanRegistry = backendBeanRegistry;
    }

    /** 运行结果（service 层视图，控制器转 RunResultVO）。 */
    public record RunResult(String runId, String status, Map<String, Object> output,
                            List<LogicFlowEngine.NodeTrace> traces, String errorMessage, long durationMs) {
    }

    // ------------------------------------------------------------------
    // 定义 CRUD
    // ------------------------------------------------------------------

    /** 创建：flowKey 校验 + 同租户唯一；初始 DSL = START→END 两节点（含默认坐标），DRAFT v0。 */
    @Transactional
    public LogicFlowDef create(String tenantId, String key, String name, String description) {
        String normalizedTenant = normalizeTenant(tenantId);
        if (key == null || !KEY_PATTERN.matcher(key).matches()) {
            throw new BusinessException("flowKey 非法: 须以字母开头，仅含字母/数字/_/-，长度 2-64");
        }
        if (repository.existsByTenantIdAndFlowKey(normalizedTenant, key)) {
            throw new BusinessException("flowKey 已存在: " + key);
        }
        LogicFlowDef def = new LogicFlowDef();
        def.setId(UUID.randomUUID().toString().replace("-", ""));
        def.setTenantId(normalizedTenant);
        def.setFlowKey(key);
        def.setName(name == null || name.isBlank() ? key : name);
        def.setDescription(description);
        def.setStatus(STATUS_DRAFT);
        def.setVersion(0);
        def.setDslJson(defaultDslJson());
        log.info("Logic flow '{}' created in tenant {}", key, normalizedTenant);
        return repository.save(def);
    }

    /**
     * 更新名称/描述/DSL。DSL 先 parse 校验 JSON 合法（含未知节点类型拒绝），
     * 但<b>不</b>校验图结构——允许草稿半成品；存储 DSL 原文。
     */
    @Transactional
    public LogicFlowDef update(String tenantId, String id, String name, String description, String dsl) {
        LogicFlowDef def = get(tenantId, id);
        if (name != null) {
            def.setName(name);
        }
        if (description != null) {
            def.setDescription(description);
        }
        if (dsl != null) {
            LogicFlowDsl.parse(dsl, objectMapper);
            def.setDslJson(dsl);
        }
        return repository.save(def);
    }

    /** 详情（含租户校验，不存在/越权统一报「逻辑流不存在」）。 */
    public LogicFlowDef get(String tenantId, String id) {
        LogicFlowDef def = repository.findById(id)
                .orElseThrow(() -> new BusinessException("逻辑流不存在: " + id));
        if (!def.getTenantId().equals(normalizeTenant(tenantId))) {
            throw new BusinessException("逻辑流不存在: " + id);
        }
        return def;
    }

    /** 删除（连带清理运行历史）。 */
    @Transactional
    public void delete(String tenantId, String id) {
        LogicFlowDef def = get(tenantId, id);
        runRepository.deleteByFlowId(def.getId());
        repository.delete(def);
        log.info("Logic flow '{}' ({}) deleted", def.getFlowKey(), def.getId());
    }

    // ------------------------------------------------------------------
    // 发布 / 运行 / 历史 / 分页
    // ------------------------------------------------------------------

    /**
     * 发布：parse + 图结构硬校验 + bean 白名单校验，有错抛
     * {@code BusinessException("DSL_INVALID: " + joined)}；通过后 status=PUBLISHED、version+1。
     */
    @Transactional
    public LogicFlowDef publish(String tenantId, String id) {
        LogicFlowDef def = get(tenantId, id);
        LogicFlowDsl dsl = LogicFlowDsl.parse(def.getDslJson(), objectMapper);
        List<String> errors = new ArrayList<>(validator.validate(dsl));
        errors.addAll(unregisteredBeanErrors(dsl));
        if (!errors.isEmpty()) {
            throw new BusinessException("DSL_INVALID: " + String.join("; ", errors));
        }
        def.setStatus(STATUS_PUBLISHED);
        def.setVersion(normalizedVersion(def) + 1);
        log.info("Logic flow '{}' published, version {}", def.getFlowKey(), def.getVersion());
        return repository.save(def);
    }

    /** 以当前已存 DSL 运行（不要求已发布）；每次运行落一条 LogicFlowRun 历史并返回结果（含 runId）。 */
    public RunResult run(String tenantId, String id, Map<String, Object> vars) {
        LogicFlowDef def = get(tenantId, id);
        LogicFlowDsl dsl = LogicFlowDsl.parse(def.getDslJson(), objectMapper);
        Map<String, Object> inputVars = vars == null ? Map.of() : vars;
        LocalDateTime startedAt = LocalDateTime.now();
        long begin = System.currentTimeMillis();

        LogicFlowEngine.RunOutcome outcome;
        try {
            outcome = engine.run(dsl, inputVars);
        } catch (Exception e) {
            // 引擎设计为不抛异常；此处兜底保证失败运行同样留痕
            log.warn("Logic flow engine threw unexpectedly", e);
            outcome = new LogicFlowEngine.RunOutcome(LogicFlowEngine.STATUS_FAILED, Map.of(), List.of(),
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
        long durationMs = System.currentTimeMillis() - begin;

        LogicFlowRun run = new LogicFlowRun();
        run.setId(UUID.randomUUID().toString().replace("-", ""));
        run.setFlowId(def.getId());
        run.setFlowKey(def.getFlowKey());
        run.setFlowName(def.getName());
        run.setStatus(outcome.status());
        run.setInputJson(writeJsonSafe(inputVars));
        run.setOutputJson(writeJsonSafe(outcome.outputVars()));
        run.setTracesJson(writeJsonSafe(outcome.traces()));
        run.setErrorMessage(outcome.errorMessage());
        run.setDurationMs(durationMs);
        run.setStartedAt(startedAt);
        runRepository.save(run);

        log.info("Logic flow '{}' run {} -> {} ({}ms)", def.getFlowKey(), run.getId(), outcome.status(), durationMs);
        return new RunResult(run.getId(), outcome.status(), outcome.outputVars(), outcome.traces(),
                outcome.errorMessage(), durationMs);
    }

    /** 运行历史：按 startedAt 倒序，limit 默认 20、上限 100。 */
    public List<LogicFlowRun> runs(String tenantId, String id, Integer limit) {
        LogicFlowDef def = get(tenantId, id);
        int capped = limit == null ? 20 : Math.max(1, Math.min(limit, 100));
        return runRepository.findByFlowIdOrderByStartedAtDesc(def.getId(), PageRequest.of(0, capped));
    }

    /** 分页列表：keyword 模糊匹配 flowKey/name，updatedAt 倒序。 */
    public Page<LogicFlowDef> list(String tenantId, String keyword, int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(1, Math.min(size, 100)));
        String kw = keyword == null || keyword.isBlank() ? null : keyword.trim();
        return repository.search(normalizeTenant(tenantId), kw, pageable);
    }

    // ------------------------------------------------------------------
    // 内部
    // ------------------------------------------------------------------

    /** BEAN 节点引用的 bean 方法须在 BackendBeanRegistry 白名单内（publish 硬校验之一）。 */
    private List<String> unregisteredBeanErrors(LogicFlowDsl dsl) {
        List<String> errors = new ArrayList<>();
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getType() != NodeType.BEAN || node.getConfig() == null || node.getConfig().isNull()) {
                continue;
            }
            JsonNode beanName = node.getConfig().get("beanName");
            JsonNode methodName = node.getConfig().get("methodName");
            if (isBlankJson(beanName) || isBlankJson(methodName)) {
                continue; // 配置完整性由 Validator 负责
            }
            try {
                backendBeanRegistry.require(beanName.asText(), methodName.asText());
            } catch (Exception e) {
                errors.add("BEAN 节点 " + node.getId() + " 引用未注册的 bean 方法: "
                        + beanName.asText() + "." + methodName.asText());
            }
        }
        return errors;
    }

    /** 初始 DSL：START(120,160) → END(420,160)。 */
    private String defaultDslJson() {
        LogicFlowDsl.NodeDef start = new LogicFlowDsl.NodeDef();
        start.setId("start");
        start.setType(NodeType.START);
        start.setName("开始");
        start.setX(120.0);
        start.setY(160.0);

        LogicFlowDsl.NodeDef end = new LogicFlowDsl.NodeDef();
        end.setId("end");
        end.setType(NodeType.END);
        end.setName("结束");
        end.setX(420.0);
        end.setY(160.0);

        LogicFlowDsl.EdgeDef edge = new LogicFlowDsl.EdgeDef();
        edge.setId("e1");
        edge.setSource("start");
        edge.setTarget("end");

        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(new ArrayList<>(List.of(start, end)));
        dsl.setEdges(new ArrayList<>(List.of(edge)));
        return dsl.toJson(objectMapper);
    }

    private String writeJsonSafe(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize logic flow run payload", e);
            return "{\"_serialize_error\":\"serialization failed\"}";
        }
    }

    private static String normalizeTenant(String tenantId) {
        return tenantId == null || tenantId.isBlank() ? DEFAULT_TENANT : tenantId;
    }

    private static int normalizedVersion(LogicFlowDef def) {
        return def.getVersion() == null ? 0 : def.getVersion();
    }

    private static boolean isBlankJson(JsonNode node) {
        return node == null || node.isNull() || node.asText().isBlank();
    }
}
