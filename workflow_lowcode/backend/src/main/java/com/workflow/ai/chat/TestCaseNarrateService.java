package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.support.AiUsageRecorder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 测试用例中文转写服务。
 *
 * <p>把录制得到的结构化动作序列（AI 对话动作 + 用户手动操作捕获，同一 page_action 协议）
 * 交给 LLM 转写成自然语言中文测试用例：用例标题、用例摘要、逐步操作描述与预期结果。
 * 输出严格 JSON，供前端保存到用例的 narrative 字段并展示。
 */
@Service
public class TestCaseNarrateService {

    private static final Logger log = LoggerFactory.getLogger(TestCaseNarrateService.class);
    static final String MODULE = "testcase-narrate";
    private static final double NARRATE_TEMPERATURE = 0.2;

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final AiProperties properties;
    private final AiUsageRecorder recorder;
    private final ObjectMapper objectMapper;

    public TestCaseNarrateService(ObjectProvider<ChatModel> chatModelProvider,
                                  AiProperties properties,
                                  AiUsageRecorder recorder,
                                  ObjectMapper objectMapper) {
        this.chatModelProvider = chatModelProvider;
        this.properties = properties;
        this.recorder = recorder;
        this.objectMapper = objectMapper;
    }

    /**
     * 转写用例。
     *
     * @param pageRoute 录制时页面路由
     * @param caseName  用例名（可空，空则由 LLM 起名）
     * @param actions   动作序列 JSON 文本（[{op,target,field,value,params}...]）
     * @return 中文用例
     */
    public NarrateResult narrate(String pageRoute, String caseName, String actions) {
        ChatModel model = requireModel();

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(SYSTEM_PROMPT));
        StringBuilder user = new StringBuilder();
        user.append("页面路由：").append(pageRoute == null || pageRoute.isBlank() ? "(未知)" : pageRoute).append('\n');
        if (caseName != null && !caseName.isBlank()) {
            user.append("用例名（可参考）：").append(caseName).append('\n');
        }
        user.append("操作序列（JSON 数组，按发生顺序）：\n").append(actions);
        messages.add(ChatMessage.user(user.toString()));

        ChatOptions options = new ChatOptions(NARRATE_TEMPERATURE, properties.getMaxTokens(), false, "json_object");
        long start = System.currentTimeMillis();
        String raw;
        try {
            raw = model.complete(messages, options);
        } catch (RuntimeException e) {
            long elapsed = System.currentTimeMillis() - start;
            recorder.recordFailure(MODULE, properties.getModel(), e.getMessage(), elapsed);
            if (e instanceof AiException aiEx) throw aiEx;
            throw new AiException(AiException.Code.HTTP_ERROR, "LLM 调用失败：" + e.getMessage());
        }
        long elapsed = System.currentTimeMillis() - start;

        NarrateResult result = parse(raw);
        recorder.recordSuccess(MODULE, properties.getModel(), 0, 0, elapsed);
        return result;
    }

    private NarrateResult parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new AiException(AiException.Code.HTTP_ERROR, "LLM 返回为空");
        }
        String text = raw.trim();
        // 剥离 ```json 围栏（部分模型即使在 json_object 模式下也可能包裹）
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```(json)?\\s*", "").replaceFirst("```\\s*$", "").trim();
        }
        try {
            JsonNode root = objectMapper.readTree(text);
            JsonNode stepsNode = root.path("steps");
            if (!stepsNode.isArray() || stepsNode.isEmpty()) {
                throw new AiException(AiException.Code.HTTP_ERROR, "LLM 返回缺少 steps 数组");
            }
            List<NarrateStep> steps = new ArrayList<>();
            for (JsonNode s : stepsNode) {
                steps.add(new NarrateStep(
                        s.path("text").asText(""),
                        s.hasNonNull("expect") ? s.path("expect").asText() : null));
            }
            String title = root.path("title").asText("");
            String summary = root.path("summary").asText("");
            return new NarrateResult(title, summary, List.copyOf(steps));
        } catch (AiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[{}] 解析 LLM 输出失败: {}", MODULE, e.getMessage());
            throw new AiException(AiException.Code.HTTP_ERROR, "LLM 返回不是有效 JSON");
        }
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

    /** 中文用例结果 */
    public record NarrateResult(String title, String summary, List<NarrateStep> steps) {
    }

    /** 单步：操作描述 + 预期结果 */
    public record NarrateStep(String text, String expect) {
    }

    private static final String SYSTEM_PROMPT = """
            你是资深软件测试工程师。用户会给出一段「页面路由 + 结构化操作序列」（JSON 数组，每项含 op/target/field/value/params），
            这是用户在 Web 系统里的一组真实操作（可能来自 AI 助手执行，也可能来自用户手动点击/输入的捕获），请把它转写成一份**中文测试用例**。

            动作类型词典（op → 含义）：
            - navigate → 打开/跳转页面（target 为路径）
            - click → 点击（target 为按钮或元素名称）
            - fill / set-value → 在输入框填写（field/target 为字段名，value 为填入值）
            - set-query → 设置查询条件；search → 执行查询；reset → 重置条件；refresh → 刷新列表
            - sort → 排序（params:{sort,order}）
            - open-create → 打开新建表单；open-edit → 打开编辑表单；open-container → 打开容器/面板
            - validate → 触发表单校验；submit → 提交表单
            - delete-rows → 删除选中行；read-table → 读取表格数据（params.limit 为行数）
            - set-filter → 设置表格过滤；expect → 断言（params:{type,expected,comparator}）
            - select → 下拉选择
            - get-state → 读取页面状态（转写时可描述为「查看当前页面状态」）

            转写要求：
            1. 输出严格 JSON：{"title":"用例标题","summary":"一句话概述验证目的","steps":[{"text":"操作步骤（中文祈使句）","expect":"该步预期结果（可省略）"}]}
            2. title 简洁概括业务场景（如「按用户名查询用户列表」）；若用户给了用例名可直接采用或润色。
            3. 每个动作转成一条 step.text；值要用「」引出（如 在「用户名」输入框填写「admin」）；密码类值如为掩码则保留「******」。
            4. expect 动作写成验证步骤，text 形如「验证：页面出现…」；其他动作的 expect 仅在语义明确时填写（如 submit → 「表单提交成功，弹窗关闭」）。
            5. 不要发明序列中不存在的操作；不输出 JSON 以外的任何内容。
            """;
}
