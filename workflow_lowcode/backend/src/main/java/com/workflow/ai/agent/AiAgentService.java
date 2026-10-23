package com.workflow.ai.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.aiconfig.AiConfigService;
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
import com.workflow.ai.tool.PageActionTool;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI 助手编排：多轮对话 + 工具调用循环（支持前端执行工具的暂停/续跑）。
 *
 * <p>两类工具：
 * <ul>
 *   <li>服务端工具：循环内即时执行（表单/流程 CRUD、open_page）；</li>
 *   <li>客户端执行工具（{@code page_action}/{@code dom_action}）：循环暂停，
 *       经 SSE {@code client_tool} 事件下发前端执行，前端经 {@code /chat/continue}
 *       回传结果后从会话续跑（会话态见 {@link AiAgentSessionStore}）。</li>
 * </ul>
 */
@Service
public class AiAgentService {

    /**
     * 单次请求最大模型调用步数（跨续跑累计）。
     *
     * <p>注意：客户端执行工具每执行一步都要经过「暂停 → 前端执行 → 续跑」各占一次模型调用，
     * 多步页面操作的步数 = 客户端步数 + 1（收尾回复），因此上限需要远大于表观的"步骤数"。
     */
    private static final int MAX_STEPS = 24;

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
            - page_action：**替用户实际操作当前页面**（填查询条件、刷新列表、填表单、提交表单、导航）。
              仅当用户要求你“帮我操作/帮我查/帮我填”类任务时调用；componentId 必须取自下方
              「当前页面可操作组件」清单，清单为空时禁止调用（可改用 dom_action 或引导用户手动操作）。
              每次只执行一步，等结果回传后再决定下一步；如实汇报执行结果，失败时说明原因。
            - dom_action：页面操作的兜底原语（点击/输入/选择），基于前端回传的 DOM 语义树编号操作。
              仅当 page_action 无法覆盖（无注册组件的长尾交互）时使用；优先 page_action。
            重要规则：
            - **如实描述工具结果**：只有 create_form 返回 ok=true 后才能说“已创建”；
              generate_form_schema 只生成了结构，**不是**创建完成，禁止说“已创建/已保存”。
            - **如实描述页面操作结果**：page_action/dom_action 的结果以前端回传为准，
              执行失败（ok=false）时如实告知失败原因，禁止臆造“已完成”。
            - 涉及提交/删除等写操作时，说明会弹出确认框由用户确认。
            - create_form 成功后：说明表单已创建为**草稿（未发布）**，附内联链接
              [在设计器中打开](/form/designer?id=<formId>)，提示可在设计器中调整并发布；
              业务表单发布后即可在业务表单数据页面录入数据。
            - **表单与流程的关系**：业务表单（BUSINESS）没有审批流程；只有工作流表单（WORKFLOW）
              才可配置审批流程。创建业务表单后**禁止**提及“进入相关流程/提交审批/发起审批”；
              应引导用户在设计器调整发布后录入数据。
            - 你**无法替用户打开页面**（open_page 只是提供可点击入口）；
              但可以通过 page_action 的 navigate 动作在用户授权下执行页面跳转。
              除 navigate 外，**禁止**说“已为你打开/已跳转/已进入某页面”。
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
    private final AiConfigService configService;
    private final AiToolRegistry toolRegistry;
    private final AiUsageRecorder recorder;
    private final AiAgentSessionStore sessionStore;
    private final ObjectMapper objectMapper;

    public AiAgentService(ObjectProvider<ChatModel> chatModelProvider,
                          AiConfigService configService,
                          AiToolRegistry toolRegistry,
                          AiUsageRecorder recorder,
                          AiAgentSessionStore sessionStore,
                          ObjectMapper objectMapper) {
        this.chatModelProvider = chatModelProvider;
        this.configService = configService;
        this.toolRegistry = toolRegistry;
        this.recorder = recorder;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    /**
     * 执行一轮对话（含工具调用，遇前端执行工具时暂停）。
     *
     * @param history     历史消息（不含本轮 user 消息）
     * @param userMessage 本轮用户输入
     * @param pages       当前用户可访问页面（供 open_page 白名单与系统提示）
     * @param components  当前页面可操作组件清单（前端上报；供 page_action 定位组件）
     * @param events      事件回调（工具调用/结果/最终回复/客户端工具下发）
     */
    public void chat(List<ChatMessage> history, String userMessage, List<PageRef> pages,
                     JsonNode components, Events events) {
        ChatModel model = requireModel();

        AiAgentSessionStore.Session session = sessionStore.create(UUID.randomUUID().toString());
        session.options = ChatOptions.withTools(toolRegistry.specs());
        session.context = new AiToolContext(pages == null ? List.of() : pages);
        session.messages.add(ChatMessage.system(buildSystemPrompt(pages, components)));
        if (history != null) {
            session.messages.addAll(history);
        }
        session.messages.add(ChatMessage.user(userMessage));

        runLoop(model, session, events);
    }

    /**
     * 续跑：前端已执行完一个客户端工具，回传结果后从会话继续。
     *
     * @param sessionId 暂停时下发的会话 id
     * @param callId    已执行的工具调用 id
     * @param result    前端执行结果（JSON 文本）
     */
    public void resume(String sessionId, String callId, String result, Events events) {
        ChatModel model = requireModel();
        AiAgentSessionStore.Session session = sessionStore.get(sessionId);
        if (session == null) {
            throw new IllegalStateException("AI 操作会话不存在或已过期，请重新发起对话");
        }
        session.messages.add(ChatMessage.tool(callId, result == null || result.isBlank() ? "{}" : result));
        runLoop(model, session, events);
    }

    /** 核心循环：服务端工具即时执行；客户端工具下发后暂停（会话入库等待续跑）。 */
    private void runLoop(ChatModel model, AiAgentSessionStore.Session session, Events events) {
        while (true) {
            if (session.queue.isEmpty()) {
                if (session.stepsUsed >= MAX_STEPS) {
                    finishWithMessage(session, events,
                            "抱歉，本次页面操作步骤较多，已中止执行（已完成的部分保留生效）。"
                                    + "请把需求拆分为更小的请求分次下发。", true);
                    return;
                }
                session.stepsUsed++;
                ChatResult result = model.completeWithTools(session.messages, session.options);
                if (!result.hasToolCalls()) {
                    String text = result.content() == null || result.content().isBlank()
                            ? "（没有更多内容）" : result.content();
                    // 兜底：模型未主动提供入口时，按回复中出现的页面名补全入口
                    if (session.navigations.isEmpty()) {
                        for (PageRef page : matchPages(text, session.context.pages())) {
                            session.navigations.put(page.path(), page);
                        }
                    }
                    finishWithMessage(session, events, text, false);
                    return;
                }
                session.messages.add(ChatMessage.assistantToolCalls(result.toolCalls()));
                session.queue.addAll(result.toolCalls());
            }

            ToolCall toolCall = session.queue.remove(0);
            JsonNode args = parse(toolCall.arguments());

            // 客户端执行工具：下发后暂停，等待前端回传续跑
            if (toolRegistry.isClientExecuted(toolCall.name())) {
                // 服务端安全闸：page_action.navigate 的 path 必须在用户可访问页面白名单内，
                // 不合法则不暂停、直接回填错误结果（防提示注入诱导跳转任意路由）
                if (PageActionTool.NAME.equals(toolCall.name())
                        && "navigate".equals(args.path("action").asText(""))) {
                    String path = args.path("path").asText("");
                    if (!isWhitelistedPage(path, session.context.pages())) {
                        session.messages.add(ChatMessage.tool(toolCall.id(),
                                "{\"ok\":false,\"message\":\"路径不在用户可访问页面白名单内，已拒绝导航: " + path + "\"}"));
                        continue;
                    }
                }
                // 重复操作检测：同一调用（工具+参数）连续出现 3 次 → 模型已陷入循环，在下发前中止
                String sig = toolCall.name() + ":" + toolCall.arguments();
                if (sig.equals(session.lastClientSig)) {
                    session.repeatCount++;
                } else {
                    session.lastClientSig = sig;
                    session.repeatCount = 1;
                }
                if (session.repeatCount >= 3) {
                    finishWithMessage(session, events,
                            "检测到重复执行相同的页面操作，已中止。可能该操作在当前页面不生效，"
                                    + "请换一种描述方式，或手动完成该步骤后告诉我继续。", true);
                    return;
                }
                events.clientTool(session.id, toolCall.id(), toolCall.name(), args);
                sessionStore.get(session.id); // touch TTL
                return; // paused
            }

            // 服务端工具：即时执行
            events.toolCall(toolCall.name(), args);
            String toolResultJson = toolRegistry.execute(toolCall.name(), args, session.context);
            JsonNode toolResult = parse(toolResultJson);
            events.toolResult(toolCall.name(), toolResult);
            collectNavigation(toolCall.name(), toolResult, session.navigations);
            session.messages.add(ChatMessage.tool(toolCall.id(), toolResultJson));
        }
    }

    /** 收尾：产出最终回复、清理会话、记录用量。 */
    private void finishWithMessage(AiAgentSessionStore.Session session, Events events,
                                   String text, boolean failure) {
        events.message(text, new ArrayList<>(session.navigations.values()));
        sessionStore.remove(session.id);
        long elapsed = System.currentTimeMillis() - session.startMs;
        String model = configService.resolve().model();
        if (failure) {
            recorder.recordFailure(MODULE, model, "max steps exceeded", elapsed);
        } else {
            recorder.recordSuccess(MODULE, model, 0, 0, elapsed);
        }
    }

    /** 页面白名单校验（navigate/open_page 共用口径）。 */
    private boolean isWhitelistedPage(String path, List<PageRef> pages) {
        if (path == null || path.isBlank() || pages == null) {
            return false;
        }
        return pages.stream().anyMatch(p -> path.equals(p.path()));
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

    /** 组装系统提示：固定约束 + 当前用户可访问页面清单 + 当前页面可操作组件清单。 */
    private String buildSystemPrompt(List<PageRef> pages, JsonNode components) {
        StringBuilder sb = new StringBuilder(BASE_PROMPT);
        if (pages != null && !pages.isEmpty()) {
            sb.append("\n用户可访问页面（open_page 的 path 必须取自此处）：\n");
            for (PageRef page : pages) {
                sb.append("- ").append(page.label()).append(" : ").append(page.path()).append('\n');
            }
        }
        if (components != null && components.isArray() && !components.isEmpty()) {
            sb.append("\n当前页面可操作组件（page_action 的 componentId 必须取自此处）：\n");
            for (JsonNode comp : components) {
                String id = comp.path("id").asText("");
                String kind = comp.path("kind").asText("");
                String title = comp.path("title").asText("");
                sb.append("- [").append(kind).append("] ").append(id);
                if (!title.isBlank() && !title.equals(id)) {
                    sb.append("「").append(title).append("」");
                }
                JsonNode caps = comp.path("capabilities");
                if (caps.isArray() && !caps.isEmpty()) {
                    List<String> capList = new ArrayList<>();
                    caps.forEach(c -> capList.add(c.asText()));
                    sb.append(" 支持: ").append(String.join("/", capList));
                }
                JsonNode fields = comp.path("fields");
                if (fields.isArray() && !fields.isEmpty()) {
                    List<String> fieldList = new ArrayList<>();
                    int n = 0;
                    for (JsonNode f : fields) {
                        if (n >= 20) {
                            fieldList.add("…等 " + fields.size() + " 个字段");
                            break;
                        }
                        String key = f.path("key").asText("");
                        String label = f.path("label").asText("");
                        fieldList.add(label.isBlank() || label.equals(key) ? key : key + "(" + label + ")");
                        n++;
                    }
                    sb.append(" 字段: ").append(String.join(", ", fieldList));
                }
                sb.append('\n');
            }
            sb.append("使用 page_action 时：查询条件 action=setFilter 配 filter={字段:值}；")
              .append("填表单 action=fillForm 配 values={字段:值}，字段名取自上方字段清单。\n");
        } else {
            sb.append("\n当前页面无可注册操作组件（或上下文未上报）。用户要求操作页面时，")
              .append("可使用 dom_action 原语（前端会回传 DOM 语义树），或引导用户手动操作。\n");
        }
        return sb.toString();
    }

    /**
     * 取 {@link ChatModel} bean。可用性（是否启用、有无密钥）不在这里判：
     * 由 {@link com.workflow.ai.aiconfig.DynamicChatModel} 按生效配置判定并给出可操作提示。
     */
    private ChatModel requireModel() {
        ChatModel model = chatModelProvider.getIfAvailable();
        if (model == null) {
            throw new AiException(AiException.Code.CONFIG_MISSING, "AI 能力未装配，请查看后端启动日志");
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

        /** 客户端执行工具下发：前端执行后经 /chat/continue 回传结果续跑。 */
        default void clientTool(String sessionId, String callId, String name, JsonNode args) {
        }
    }
}
