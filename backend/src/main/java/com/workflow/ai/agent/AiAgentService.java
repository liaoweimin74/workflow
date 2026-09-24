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
            - create_form：当用户想要新建、创建一个表单时调用（**真实创建表单草稿并保存**）。参数：
              name=表单名称；description=字段需求描述；formType=表单类型。
            - 表单类型语义（formType）：BUSINESS=业务表单，纯数据填报，**不关联审批流程**；
              WORKFLOW=工作流表单，用于挂接审批流程。用户说“业务表单/登记表/信息表”用 BUSINESS，
              只有用户明确说“审批/流程/工作流表单”才用 WORKFLOW。
            - generate_form_schema：仅当用户想先看表单结构（不创建）时调用，只返回结构 JSON，不落库。
            - open_page：提供一个可点击的页面入口，引导用户前往平台内页面；path 必须来自下方
              「用户可访问页面」列表，禁止编造或使用未列出的路径。
            重要规则：
            - **如实描述工具结果**：只有 create_form 返回 ok=true 后才能说“已创建”；
              generate_form_schema 只生成了结构，**不是**创建完成，禁止说“已创建/已保存”。
            - create_form 成功后：说明表单已创建为**草稿（未发布）**，附内联链接
              [在设计器中打开](/form/designer?id=<formId>)，提示可在设计器中调整并发布；
              业务表单发布后即可在业务表单数据页面录入数据。
            - **表单与流程的关系**：业务表单（BUSINESS）没有审批流程；只有工作流表单（WORKFLOW）
              才可配置审批流程。创建业务表单后**禁止**提及“进入相关流程/提交审批/发起审批”；
              应引导用户在设计器调整发布后录入数据。
            - 你**无法替用户打开页面**，只能提供可点击的入口。**禁止**说“已为你打开/已跳转/已进入某页面”。
              应使用“可点击下方入口前往 X”这类措辞。
            - 当回答涉及平台页面时，**优先在正文中内联 Markdown 链接**，格式 `[页面名](/路径)`
              （路径必须取自下方「用户可访问页面」列表，例如 `[用户管理](/system/user)`），
              让用户可直接在文字中点击跳转；可在多处内联。
            - 当用户询问“怎么做某事 / 在哪里配置 / 如何管理”等答案位于某个页面的问题时，
              除内联链接外也可调用 open_page 补充入口。
            - 用户要求生成表单时，必须调用 create_form 或 generate_form_schema 工具，不要凭空编造表单结构。
            - 工具执行后，用简洁的中文说明结果或操作步骤。
            - 与平台操作无关的问题，礼貌说明你只能协助平台内的操作。
            - 始终使用中文，回复简洁；列表用 `-`，不要输出多余空行。
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
