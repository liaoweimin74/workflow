package com.workflow.ai.support;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * AiUsageRecorder 测试。
 */
@ExtendWith(OutputCaptureExtension.class)
class AiUsageRecorderTest {

    private final AiUsageRecorder recorder = new AiUsageRecorder();

    @Test
    void recordSuccess_writesInfoLog(CapturedOutput output) {
        recorder.recordSuccess("formgen", "deepseek-chat", 10, 20, 30);

        assertThat(output).contains("[AI]").contains("status=success")
                .contains("module=formgen").contains("model=deepseek-chat");
    }

    @Test
    void recordFailure_writesWarnLog(CapturedOutput output) {
        recorder.recordFailure("formgen", "deepseek-chat", "boom", 5);

        assertThat(output).contains("status=failure").contains("boom");
    }

    @Test
    void recordNeverThrows() {
        assertThatCode(() -> recorder.recordSuccess(null, null, 0, 0, 0)).doesNotThrowAnyException();
        assertThatCode(() -> recorder.recordFailure(null, null, null, 0)).doesNotThrowAnyException();
    }
}
