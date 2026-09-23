package com.workflow.ai.formgen;

import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.support.AiUsageRecorder;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.function.Consumer;

/**
 * AI 表单生成服务。
 *
 * <p>编排：prompt 组装 → 流式调用（温度 0.3 + JSON 模式）→ 校验清洗 → 结果。
 */
@Service
public class AiFormGenerationService {

    static final String MODULE = "form-gen";
    private static final double FORM_TEMPERATURE = 0.3;

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final AiProperties properties;
    private final FormSchemaPromptBuilder promptBuilder;
    private final FormSchemaValidator validator;
    private final AiUsageRecorder recorder;

    public AiFormGenerationService(ObjectProvider<ChatModel> chatModelProvider,
                                   AiProperties properties,
                                   FormSchemaPromptBuilder promptBuilder,
                                   FormSchemaValidator validator,
                                   AiUsageRecorder recorder) {
        this.chatModelProvider = chatModelProvider;
        this.properties = properties;
        this.promptBuilder = promptBuilder;
        this.validator = validator;
        this.recorder = recorder;
    }

    /**
     * 流式生成，逐块回调 schema 文本增量。
     *
     * @param description 自然语言描述
     * @param onDelta     文本增量回调
     * @return 生成结果与原始文本
     */
    public StreamGenerateResult generateStream(String description, Consumer<String> onDelta) {
        ChatModel model = requireModel();
        List<ChatMessage> messages = promptBuilder.buildMessages(description);
        ChatOptions options = new ChatOptions(FORM_TEMPERATURE, properties.getMaxTokens(), true, "json_object");

        StringBuilder buffer = new StringBuilder();
        AiException[] failure = new AiException[1];
        long start = System.currentTimeMillis();

        model.completeStream(messages, options,
                delta -> {
                    buffer.append(delta);
                    onDelta.accept(delta);
                },
                done -> { },
                e -> failure[0] = e);

        long elapsed = System.currentTimeMillis() - start;
        if (failure[0] != null) {
            recorder.recordFailure(MODULE, properties.getModel(), failure[0].getMessage(), elapsed);
            throw failure[0];
        }

        AiFormGenerateResult result = validator.validate(buffer.toString());
        recorder.recordSuccess(MODULE, properties.getModel(), 0, 0, elapsed);
        return new StreamGenerateResult(result, buffer.toString());
    }

    /**
     * 同步生成（内部复用流式实现，无增量消费）。
     */
    public AiFormGenerateResult generateSync(String description) {
        return generateStream(description, delta -> { }).result();
    }

    private ChatModel requireModel() {
        if (!properties.isConfigured()) {
            throw new AiException(AiException.Code.CONFIG_MISSING, "AI 服务未配置");
        }
        ChatModel model = chatModelProvider.getIfAvailable();
        if (model == null) {
            throw new AiException(AiException.Code.CONFIG_MISSING, "AI 服务未配置");
        }
        return model;
    }

    /**
     * 流式生成结果。
     *
     * @param result  清洗后的结果
     * @param rawText 模型原始输出文本
     */
    public record StreamGenerateResult(AiFormGenerateResult result, String rawText) {
    }
}
