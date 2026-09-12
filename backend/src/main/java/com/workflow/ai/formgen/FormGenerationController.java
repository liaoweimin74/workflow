package com.workflow.ai.formgen;

import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.common.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * AI 表单生成 Controller。
 *
 * <p>流式端点 {@code POST /api/v1/ai/forms/generate} 以 SSE 返回
 * meta → chunk* → done（或 error）；同步端点 {@code /generate/sync} 一次性返回。
 */
@RestController
@RequestMapping("/api/v1/ai/forms")
public class FormGenerationController {

    private static final Logger log = LoggerFactory.getLogger(FormGenerationController.class);

    private static final long SSE_TIMEOUT_MS = 300_000L;

    private final AiFormGenerationService service;
    private final AiProperties properties;

    public FormGenerationController(AiFormGenerationService service, AiProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    /**
     * 流式生成表单 schema。
     */
    @PostMapping("/generate")
    public SseEmitter generate(@RequestBody(required = false) FormGenerateRequest request) {
        if (request == null || request.description() == null || request.description().isBlank()) {
            throw new IllegalArgumentException("表单描述不能为空");
        }
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitter.onTimeout(emitter::complete);

        String description = request.description();
        CompletableFuture.runAsync(() -> {
            if (!properties.isConfigured()) {
                sendError(emitter, AiException.Code.CONFIG_MISSING.name(), "AI 服务未配置");
                return;
            }
            try {
                emitter.send(SseEmitter.event().name("meta")
                        .data(Map.of("taskId", UUID.randomUUID().toString(), "model", properties.getModel())));

                AiFormGenerationService.StreamGenerateResult sr = service.generateStream(description, delta -> {
                    try {
                        emitter.send(SseEmitter.event().name("chunk").data(Map.of("delta", delta)));
                    } catch (IOException e) {
                        throw new IllegalStateException("SSE 发送失败", e);
                    }
                });

                emitter.send(SseEmitter.event().name("done").data(sr.result()));
                emitter.complete();
            } catch (AiException e) {
                sendError(emitter, e.getCode().name(), e.getMessage());
            } catch (Exception e) {
                log.warn("AI 表单生成失败", e);
                sendError(emitter, AiException.Code.STREAM_ERROR.name(), e.getMessage());
            }
        });

        return emitter;
    }

    /**
     * 同步生成表单 schema。
     */
    @PostMapping("/generate/sync")
    public ResponseEntity<R<AiFormGenerateResult>> generateSync(@RequestBody(required = false) FormGenerateRequest request) {
        if (request == null || request.description() == null || request.description().isBlank()) {
            return ResponseEntity.badRequest().body(R.fail(400, "表单描述不能为空"));
        }
        if (!properties.isConfigured()) {
            return ResponseEntity.status(503).body(R.fail(503, "AI 服务未配置"));
        }
        return ResponseEntity.ok(R.ok(service.generateSync(request.description())));
    }

    private void sendError(SseEmitter emitter, String code, String msg) {
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("code", code, "msg", msg == null ? "" : msg)));
            emitter.complete();
        } catch (IOException e) {
            emitter.completeWithError(e);
        }
    }

    /**
     * 生成请求。
     *
     * @param description 自然语言表单描述
     */
    public record FormGenerateRequest(String description) {
    }
}
