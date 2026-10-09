package com.workflow.ai.formgen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.exception.AiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FormSchemaValidator 测试。
 */
class FormSchemaValidatorTest {

    private final FormSchemaValidator validator = new FormSchemaValidator(new ObjectMapper());

    @Test
    void validSchema_passesWithNoWarnings() {
        String json = "{\"rule\":["
                + "{\"type\":\"input\",\"field\":\"name\",\"title\":\"姓名\"},"
                + "{\"type\":\"select\",\"field\":\"type\",\"title\":\"类型\",\"options\":[{\"label\":\"a\",\"value\":\"a\"}]}"
                + "]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.warnings()).isEmpty();
        assertThat(r.fields()).hasSize(2);
        assertThat(r.fields().get(0).field()).isEqualTo("name");
        assertThat(r.fields().get(1).componentType()).isEqualTo("select");
        assertThat(r.schema()).contains("\"rule\"");
    }

    @Test
    void invalidType_downgradedToInput() {
        String json = "{\"rule\":[{\"type\":\"slider\",\"field\":\"score\",\"title\":\"评分\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields().get(0).componentType()).isEqualTo("input");
        assertThat(r.warnings()).anyMatch(w -> w.contains("slider"));
    }

    @Test
    void illegalField_normalizedToLegalIdentifier() {
        String json = "{\"rule\":[{\"type\":\"input\",\"field\":\"请假 原因\",\"title\":\"原因\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields().get(0).field()).matches("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");
        assertThat(r.warnings()).anyMatch(w -> w.contains("字段名"));
    }

    @Test
    void camelCaseField_normalizedToSnakeCase() {
        String json = "{\"rule\":[{\"type\":\"input\",\"field\":\"userName\",\"title\":\"姓名\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields().get(0).field()).isEqualTo("user_name");
    }

    @Test
    void duplicateField_dedupedWithSuffix() {
        String json = "{\"rule\":["
                + "{\"type\":\"input\",\"field\":\"name\",\"title\":\"A\"},"
                + "{\"type\":\"input\",\"field\":\"name\",\"title\":\"B\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields()).extracting(AiFormGenerateResult.FieldInfo::field)
                .containsExactly("name", "name_2");
        assertThat(r.warnings()).anyMatch(w -> w.contains("重复"));
    }

    @Test
    void missingTitle_backFilledWithField() {
        String json = "{\"rule\":[{\"type\":\"input\",\"field\":\"age\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields().get(0).title()).isEqualTo("age");
        assertThat(r.warnings()).anyMatch(w -> w.contains("标题"));
    }

    @Test
    void garbageText_throws() {
        assertThatThrownBy(() -> validator.validate("not a json at all"))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.EMPTY_RESPONSE);
    }

    @Test
    void codeFencedJson_parses() {
        String json = "```json\n{\"rule\":[{\"type\":\"input\",\"field\":\"a\",\"title\":\"A\"}]}\n```";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields()).hasSize(1);
    }

    @Test
    void divider_keptWithoutBeingListedAsField() {
        String json = "{\"rule\":[{\"type\":\"divider\",\"title\":\"分割\"}]}";

        AiFormGenerateResult r = validator.validate(json);

        assertThat(r.fields()).isEmpty();
        assertThat(r.schema()).contains("divider");
    }
}
