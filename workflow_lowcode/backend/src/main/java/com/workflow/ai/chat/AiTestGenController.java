package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.common.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * AI 测试用例生成端点。
 *
 * <p>输入：前端操作录制器捕获的动作日志（含用户传统手动操作：点击/输入/下拉/导航，
 * 见 {@code aiPageBridge} 的 captureRecorder）。输出：LLM 生成的**中文自然语言测试用例**
 * （Markdown 文档：用例名称/前置条件/操作步骤/预期结果，可直接作为测试执行依据或
 * 再由人工转译为自动化脚本）。
 *
 * <p>非 SSE：一次性文本生成，走标准 {@code R} 包装。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AiTestGenController {

    private static final Logger log = LoggerFactory.getLogger(AiTestGenController.class);

    private static final String SYSTEM_PROMPT = """
            你是资深测试工程师，负责把「页面操作录制日志」转译为**中文自然语言测试用例**（Markdown 文档）。
            输出要求：
            - 只输出 Markdown 用例文档本身，不要任何解释或代码围栏；
            - 结构：一级标题为用例名称（概括业务意图，如“客户档案按名称查询”）；
            - 文档包含小节：**用例说明**（1-2 句业务目的）、**前置条件**（登录账号、页面入口、所需数据）、
              **操作步骤**（编号列表，每步一句中文，写清在哪个页面/哪个控件做什么、输入什么值）、
              **预期结果**（可验证的检查点，逐条列出）；
            - 操作步骤必须与录制日志的顺序与取值一致，控件用日志中的语义描述（如「客户名称输入框」「查询按钮」）；
            - 日志中连续的输入+点击可合并为一个业务步骤（如“在查询栏输入…后点击查询”），但不要遗漏值；
            - 若日志不足以推断某步意图，用“（待确认：…）”标注；
            - 全文简体中文，语言具体、可执行，禁止输出 Playwright/代码。
            """;

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final ObjectMapper objectMapper;

    public AiTestGenController(ObjectProvider<ChatModel> chatModelProvider,
                               ObjectMapper objectMapper) {
        this.chatModelProvider = chatModelProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * 录制日志 → Playwright 测试用例。
     */
    @PostMapping("/test-spec")
    public R<Map<String, String>> generate(@RequestBody(required = false) TestSpecRequest request) {
        if (request == null || request.records() == null || request.records().isEmpty()) {
            return R.fail("录制记录为空，请先录制页面操作");
        }
        ChatModel model = chatModelProvider.getIfAvailable();
        if (model == null) {
            return R.fail("AI 能力未装配，请查看后端启动日志");
        }
        try {
            String recordsJson = objectMapper.writeValueAsString(request.records());
            String userPrompt = "目标页面路由：" + (request.route() == null ? "/" : request.route())
                    + "\n录制日志（JSON 数组：source=ai/manual，kind/tool=动作类型（click/input/select/nav 或"
                    + " page_action 的 setFilter/fillForm/submitForm 等），desc=元素语义描述，value=输入/选择值，"
                    + "path=导航路径，resultMessage=执行结果）：\n" + recordsJson;
            String spec = model.complete(
                    List.of(ChatMessage.system(SYSTEM_PROMPT), ChatMessage.user(userPrompt)),
                    ChatOptions.defaults());
            // 剥离模型可能带出的 Markdown 围栏
            String cleaned = stripFences(spec);
            return R.ok(Map.of("spec", cleaned));
        } catch (AiException e) {
            return R.fail(e.getMessage());
        } catch (Exception e) {
            log.warn("AI 测试用例生成失败", e);
            return R.fail("用例生成失败: " + e.getMessage());
        }
    }

    /** 剥 ``` 围栏与语言标注。 */
    private String stripFences(String text) {
        if (text == null) {
            return "";
        }
        String t = text.trim();
        if (t.startsWith("```")) {
            int firstBreak = t.indexOf('\n');
            if (firstBreak > 0) {
                t = t.substring(firstBreak + 1);
            }
            int lastFence = t.lastIndexOf("```");
            if (lastFence >= 0) {
                t = t.substring(0, lastFence);
            }
        }
        return t.trim();
    }

    /**
     * 用例生成请求。
     *
     * @param route   录制来源页面路由
     * @param records 动作日志（captureRecorder / page_action 录制产物）
     */
    public record TestSpecRequest(String route, List<Map<String, Object>> records) {
    }
}
