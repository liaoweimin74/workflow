package com.workflow.ai.chat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 测试用例中文转写端点。
 *
 * <p>{@code POST /api/v1/ai/testcase/narrate}：接收录制的动作序列
 * （page_action 协议，可来自 AI 对话执行或用户手动操作捕获），
 * 由 LLM 转写为中文测试用例（标题/摘要/步骤/预期）。
 */
@RestController
@RequestMapping("/api/v1/ai")
public class TestCaseNarrateController {

    private static final Logger log = LoggerFactory.getLogger(TestCaseNarrateController.class);

    private final TestCaseNarrateService service;
    private final ObjectMapper objectMapper;

    public TestCaseNarrateController(TestCaseNarrateService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/testcase/narrate")
    public R<TestCaseNarrateService.NarrateResult> narrate(@RequestBody NarrateRequest request) {
        if (request == null || request.actions() == null || request.actions().isEmpty()) {
            return R.fail(400, "动作序列为空，无法转写");
        }
        try {
            String actionsJson = objectMapper.writeValueAsString(request.actions());
            return R.ok(service.narrate(request.pageRoute(), request.name(), actionsJson));
        } catch (Exception e) {
            log.warn("[testcase-narrate] 转写失败: {}", e.getMessage());
            return R.fail(500, e.getMessage() == null ? "转写失败" : e.getMessage());
        }
    }

    /** 转写请求：页面路由 + 用例名 + 动作序列（page_action 协议） */
    public record NarrateRequest(String pageRoute, String name, List<Map<String, Object>> actions) {
    }
}
