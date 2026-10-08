package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.engine.logicflow.engine.LogicFlowEngine;
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.entity.LogicFlowRun;
import com.workflow.engine.logicflow.service.LogicFlowService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 独立逻辑流编排（LogicFlow）管理 API。
 *
 * <p>租户隔离：统一取 {@code X-Tenant-Id} 请求头（缺省 default）。
 * 返回统一 {@link R} 包装；写操作暂不挂权限注解（跟随现有 controller 惯例，
 * 由 JWT 网关层保证登录态）。
 */
@RestController
@RequestMapping("/api/v1/logic-flows")
public class LogicFlowController {

    private static final Logger log = LoggerFactory.getLogger(LogicFlowController.class);

    private final LogicFlowService service;
    private final ObjectMapper objectMapper;

    public LogicFlowController(LogicFlowService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------------
    // DTO（record）
    // ------------------------------------------------------------------

    public record CreateReq(String key, String name, String description) {
    }

    /** dsl 为 JSON 原文（String；Spring Boot4 HTTP 层用 Jackson3，不兼容 Jackson2 JsonNode 入参，故用 String）。 */
    public record UpdateReq(String name, String description, String dsl) {
    }

    public record RunReq(Map<String, Object> vars) {
    }

    /** 入参声明摘要（从 DSL 顶层 inputVars 抽取，供绑定弹窗按触发点参数过滤）。 */
    public record InputParamVO(String name, String type, Boolean required, String desc) {
    }

    /** inputParams = 入参声明摘要（未声明时为 null）。 */
    public record SummaryVO(String id, String flowKey, String name, String description,
                            String status, Integer version, LocalDateTime updatedAt,
                            List<InputParamVO> inputParams) {
    }

    /** dsl 为存储原文（String）。 */
    public record DetailVO(String id, String flowKey, String name, String description,
                           String status, Integer version, String dsl,
                           LocalDateTime createdAt, LocalDateTime updatedAt) {
    }

    public record RunResultVO(String runId, String status, Map<String, Object> outputVars,
                              List<LogicFlowEngine.NodeTrace> traces, String errorMessage, long durationMs) {
    }

    public record RunHistoryVO(String runId, String status, String errorMessage,
                               long durationMs, LocalDateTime startedAt) {
    }

    // ------------------------------------------------------------------
    // 端点
    // ------------------------------------------------------------------

    /** 分页列表：keyword 模糊匹配 key/name。 */
    @GetMapping
    public R<PageResponse<SummaryVO>> list(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<LogicFlowDef> result = service.list(tenantId, keyword, page, size);
        List<SummaryVO> content = result.getContent().stream().map(this::toSummary).toList();
        return R.ok(new PageResponse<>(content, result.getNumber() + 1, result.getSize(),
                result.getTotalElements()));
    }

    /** 创建（初始 DSL=START→END，DRAFT v0）。 */
    @PostMapping
    public R<DetailVO> create(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @RequestBody CreateReq req) {
        return R.ok(toDetail(service.create(tenantId, req.key(), req.name(), req.description())));
    }

    @GetMapping("/{id}")
    public R<DetailVO> getById(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id) {
        return R.ok(toDetail(service.get(tenantId, id)));
    }

    /** 更新（name/description/dsl 皆可选；dsl 存原文，仅校验 JSON 合法）。 */
    @PutMapping("/{id}")
    public R<DetailVO> update(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id,
            @RequestBody UpdateReq req) {
        return R.ok(toDetail(service.update(tenantId, id, req.name(), req.description(), req.dsl())));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id) {
        service.delete(tenantId, id);
        return R.ok();
    }

    /** 发布：DSL 硬校验（图结构 + bean 白名单），PUBLISHED + version+1。 */
    @PostMapping("/{id}/publish")
    public R<DetailVO> publish(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id) {
        return R.ok(toDetail(service.publish(tenantId, id)));
    }

    /** 以当前已存 DSL 测试运行，请求体 {@code {"vars":{}}}（可省略），返回结果 + 运行历史 id。 */
    @PostMapping("/{id}/run")
    public R<RunResultVO> run(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id,
            @RequestBody(required = false) RunReq req) {
        Map<String, Object> vars = req == null || req.vars() == null ? Map.of() : req.vars();
        LogicFlowService.RunResult result = service.run(tenantId, id, vars);
        return R.ok(new RunResultVO(result.runId(), result.status(), result.output(),
                result.traces(), result.errorMessage(), result.durationMs()));
    }

    /** 运行历史（startedAt 倒序，limit 默认 20 上限 100）。 */
    @GetMapping("/{id}/runs")
    public R<List<RunHistoryVO>> runs(
            @RequestHeader(value = "X-Tenant-Id", defaultValue = "default") String tenantId,
            @PathVariable String id,
            @RequestParam(required = false) Integer limit) {
        List<RunHistoryVO> history = service.runs(tenantId, id, limit).stream()
                .map(this::toHistory)
                .toList();
        return R.ok(history);
    }

    // ------------------------------------------------------------------
    // VO 映射
    // ------------------------------------------------------------------

    private SummaryVO toSummary(LogicFlowDef def) {
        return new SummaryVO(def.getId(), def.getFlowKey(), def.getName(), def.getDescription(),
                statusOf(def), versionOf(def), def.getUpdatedAt(), extractInputParams(def.getDslJson()));
    }

    /**
     * DSL 顶层 inputVars → 入参声明摘要（宽松解析：DSL 非法/无声明返回 null，
     * 不影响列表渲染；单条缺 name 丢弃）。
     */
    private List<InputParamVO> extractInputParams(String dslJson) {
        if (dslJson == null || dslJson.isBlank()) {
            return null;
        }
        try {
            JsonNode vars = objectMapper.readTree(dslJson).get("inputVars");
            if (vars == null || !vars.isArray() || vars.isEmpty()) {
                return null;
            }
            List<InputParamVO> out = new ArrayList<>();
            for (JsonNode v : vars) {
                if (v == null || !v.hasNonNull("name")) continue;
                String name = v.get("name").asText();
                if (name.isBlank()) continue;
                String type = v.hasNonNull("type") ? v.get("type").asText() : "string";
                Boolean required = v.has("required") && v.get("required").asBoolean(false);
                String desc = v.hasNonNull("desc") ? v.get("desc").asText() : null;
                out.add(new InputParamVO(name, type, required, desc));
            }
            return out.isEmpty() ? null : out;
        } catch (Exception e) {
            log.warn("解析逻辑流 DSL inputVars 失败（忽略，仅影响入参过滤）: {}", e.getMessage());
            return null;
        }
    }

    private DetailVO toDetail(LogicFlowDef def) {
        return new DetailVO(def.getId(), def.getFlowKey(), def.getName(), def.getDescription(),
                statusOf(def), versionOf(def), def.getDslJson(),
                def.getCreatedAt(), def.getUpdatedAt());
    }

    private RunHistoryVO toHistory(LogicFlowRun run) {
        return new RunHistoryVO(run.getId(), run.getStatus(), run.getErrorMessage(),
                run.getDurationMs(), run.getStartedAt());
    }

    private static String statusOf(LogicFlowDef def) {
        return def.getStatus() == null ? "DRAFT" : def.getStatus();
    }

    private static Integer versionOf(LogicFlowDef def) {
        return def.getVersion() == null ? 0 : def.getVersion();
    }
}
