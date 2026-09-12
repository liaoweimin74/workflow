package com.workflow.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.ai.model.ChatResult;
import com.workflow.ai.model.PageRef;
import com.workflow.ai.model.ToolCall;
import com.workflow.ai.support.AiUsageRecorder;
import com.workflow.ai.tool.AiToolContext;
import com.workflow.ai.tool.AiToolRegistry;
import com.workflow.ai.tool.OpenPageTool;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 助手编排：多轮对话 + 工具调用循环。
 */
@Service
public class AiAgentService {

    /** 单次请求最大工具调用步数。 */
    private static final int MAX_STEPS = 5;

    /** 单条回复最多附带的页面入口数。 */
    private static final int MAX_NAVIGATIONS = 3;

    static final String MODULE = "assistant";

    private static final String BASE_PROMPT = """
            你是「工作流管理平台」的智能助手，通过对话帮助用户完成平台内的任务。
            你的可用能力以“工具”形式提供：
            - generate_form_schema：当用户想要新建、生成或创建一个表单时调用，传入表单的自然语言描述。
            - open_page：提供一个可点击的页面入口，引导用户前往平台内页面；path 必须来自下方
              「用户可访问页面」列表，禁止编造或使用未列出的路径。
            重要规则：
            - 你**无法替用户打开页面**，只能提供可点击的入口。**禁止**说“已为你打开/已跳转/已进入某页面”。
              应使用“可点击下方入口前往 X”这类措辞。
            - 当用户询问“怎么做某事 / 在哪里配置 / 如何管理”等答案位于某个页面的问题时，
              **必须调用 open_page** 给出对应入口，不要只在文字里描述路径。
            - 用户要求生成表单时，必须调用 generate_form_schema 工具，不要凭空编造表单结构。
            - 工具执行后，用简洁的中文说明结果或操作步骤。
            - 与平台操作无关的问题，礼貌说明你只能协助平台内的操作。
            - 始终使用中文，回复简洁。
            """;

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final AiProperties properties;
    private final AiToolRegistry toolRegistry;
    private final AiUsageRecorder recorder;
    private final ObjectMapper objectMapper;

    public AiAgentService(ObjectProvider<ChatModel> chatModelProvider,
                          AiProperties properties,
                          AiToolRegistry toolRegistry,
                          AiUsageRecorder recorder,
                          ObjectMapper objectMapper) {
        this.chatModelProvider = chatModelProvider;
        this.properties = properties;
        this.toolRegistry = toolRegistry;
        this.recorder = recorder;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一轮对话（含工具调用）。
     *
     * @param history     历史消息（不含本轮 user 消息）
     * @param userMessage 本轮用户输入
     * @param pages       当前用户可访问页面（供 open_page 白名单与系统提示）
     * @param events      事件回调（工具调用/结果/最终回复）
     */
    public void chat(List<ChatMessage> history, String userMessage, List<PageRef> pages, Events events) {
        ChatModel model = requireModel();

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(buildSystemPrompt(pages)));
        if (history != null) {
            messages.addAll(history);
        }
        messages.add(ChatMessage.user(userMessage));

        ChatOptions options = ChatOptions.withTools(toolRegistry.specs());
        AiToolContext context = new AiToolContext(pages == null ? List.of() : pages);
        Map<String, PageRef> navigations = new LinkedHashMap<>();
        long start = System.currentTimeMillis();

        for (int step = 0; step < MAX_STEPS; step++) {
            ChatResult result = model.completeWithTools(messages, options);
            if (!result.hasToolCalls()) {
                String text = result.content() == null || result.content().isBlank()
                        ? "（没有更多内容）" : result.content();
                // 兜底：模型未主动提供入口时，按回复中出现的页面名补全入口
                if (navigations.isEmpty()) {
                    for (PageRef page : matchPages(text, pages)) {
                        navigations.put(page.path(), page);
                    }
                }
                events.message(text, new ArrayList<>(navigations.values()));
                recorder.recordSuccess(MODULE, properties.getModel(), 0, 0, System.currentTimeMillis() - start);
                return;
            }
            messages.add(ChatMessage.assistantToolCalls(result.toolCalls()));
            for (ToolCall toolCall : result.toolCalls()) {
                JsonNode args = parse(toolCall.arguments());
                events.toolCall(toolCall.name(), args);
                String toolResultJson = toolRegistry.execute(toolCall.name(), args, context);
                JsonNode toolResult = parse(toolResultJson);
                events.toolResult(toolCall.name(), toolResult);
                collectNavigation(toolCall.name(), toolResult, navigations);
                messages.add(ChatMessage.tool(toolCall.id(), toolResultJson));
            }
        }

        events.message("抱歉，处理步骤过多，请把需求拆分为更小的请求后再试。", new ArrayList<>(navigations.values()));
        recorder.recordFailure(MODULE, properties.getModel(), "max steps exceeded",
                System.currentTimeMillis() - start);
    }

    /** open_page 成功结果 → 记录页面入口。 */
    private void collectNavigation(String toolName, JsonNode result, Map<String, PageRef> navigations) {
        if (!OpenPageTool.NAME.equals(toolName) || result == null) {
            return;
        }
        String path = result.path("path").asText("");
        if (path.isBlank()) {
            return;
        }
        String label = result.path("label").asText(path);
        navigations.put(path, new PageRef(path, label));
    }

    /** 兜底：按白名单页面名在回复文本中的出现顺序匹配入口（最多 MAX_NAVIGATIONS 个）。 */
    private List<PageRef> matchPages(String text, List<PageRef> pages) {
        List<PageRef> matched = new ArrayList<>();
        if (text == null || pages == null || pages.isEmpty()) {
            return matched;
        }
        for (PageRef page : pages) {
            if (page.label() != null && !page.label().isBlank() && text.contains(page.label())) {
                matched.add(page);
                if (matched.size() >= MAX_NAVIGATIONS) {
                    break;
                }
            }
        }
        return matched;
    }

    /** 组装系统提示：固定约束 + 当前用户可访问页面清单。 */
    private String buildSystemPrompt(List<PageRef> pages) {
        if (pages == null || pages.isEmpty()) {
            return BASE_PROMPT;
        }
        StringBuilder sb = new StringBuilder(BASE_PROMPT);
        sb.append("\n用户可访问页面（open_page 的 path 必须取自此处）：\n");
        for (PageRef page : pages) {
            sb.append("- ").append(page.label()).append(" : ").append(page.path()).append('\n');
        }
        return sb.toString();
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

    private JsonNode parse(String text) {
        if (text == null || text.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            return objectMapper.getNodeFactory().textNode(text);
        }
    }

    /** 事件回调。 */
    public interface Events {

        void toolCall(String name, JsonNode args);

        void toolResult(String name, JsonNode result);

        void message(String text, List<PageRef> navigations);
    }
}
