package com.workflow.ai.formgen;

import com.workflow.ai.model.ChatMessage;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FormSchemaPromptBuilder 测试。
 */
class FormSchemaPromptBuilderTest {

    private final FormSchemaPromptBuilder builder = new FormSchemaPromptBuilder();

    @Test
    void systemPrompt_containsWhitelistAndPattern() {
        String prompt = builder.buildSystemPrompt();

        for (String type : List.of("input", "inputTextarea", "inputNumber", "select", "checkbox",
                "radio", "date", "datetime", "time", "dateRange", "switch", "editor", "rate",
                "divider", "groupContainer")) {
            assertThat(prompt).contains(type);
        }
        assertThat(prompt).contains("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");
        assertThat(prompt).contains("snake_case");
    }

    @Test
    void buildMessages_systemFixed_userOriginal() {
        String description = "员工请假单：姓名、部门、请假类型";

        List<ChatMessage> messages = builder.buildMessages(description);

        assertThat(messages).hasSize(2);
        assertThat(messages.get(0).role()).isEqualTo(ChatMessage.Role.system);
        assertThat(messages.get(0).content()).isEqualTo(builder.buildSystemPrompt());
        assertThat(messages.get(1).role()).isEqualTo(ChatMessage.Role.user);
        assertThat(messages.get(1).content()).isEqualTo(description);
    }
}
