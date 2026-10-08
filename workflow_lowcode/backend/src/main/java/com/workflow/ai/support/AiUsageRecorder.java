package com.workflow.ai.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * AI 调用审计（日志）。
 *
 * <p>仅打印调用摘要，记录失败不得影响主流程。
 */
@Component
public class AiUsageRecorder {

    private static final Logger log = LoggerFactory.getLogger(AiUsageRecorder.class);

    /**
     * 记录成功调用。
     */
    public void recordSuccess(String module, String model, long promptTokens, long completionTokens, long elapsedMs) {
        try {
            log.info("[AI] module={} model={} promptTokens={} completionTokens={} elapsedMs={} status=success",
                    module, model, promptTokens, completionTokens, elapsedMs);
        } catch (Exception ignored) {
            // 审计不得影响主流程
        }
    }

    /**
     * 记录失败调用。
     */
    public void recordFailure(String module, String model, String error, long elapsedMs) {
        try {
            log.warn("[AI] module={} model={} elapsedMs={} status=failure error={}",
                    module, model, elapsedMs, error);
        } catch (Exception ignored) {
            // 审计不得影响主流程
        }
    }
}
