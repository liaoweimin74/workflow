package com.workflow.engine.process.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * NodeOptions form_user / external 字段解析测试（Task 72，对齐 Node 端编译透传）。
 *
 * <p>验证：approval.formUserField / approval.external.resolver 的读取与宽松容错
 * （非文本/非对象/缺失一律保持 null，旧数据零行为变化）。
 */
class NodeOptionsFormUserParseTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parse_extractsFormUserFieldAndExternalResolver() throws Exception {
        String json = "{\"approval\":{\"type\":\"form_user\","
                + "\"formUserField\":\" next_approver \","
                + "\"external\":{\"resolver\":\" crm_owner_resolver \"},\"userIds\":[]}}";
        NodeOptions opts = NodeOptions.parse(mapper.readTree(json));

        assertThat(opts).isNotNull();
        assertThat(opts.getApprovalTypeRaw()).isEqualTo("form_user");
        assertThat(opts.getFormUserField()).isEqualTo("next_approver");
        assertThat(opts.getExternalResolver()).isEqualTo("crm_owner_resolver");
    }

    @Test
    void parse_missingOrIllegalFields_stayNull() throws Exception {
        String json = "{\"approval\":{\"type\":\"user\","
                + "\"formUserField\":123,\"external\":\"not-an-object\"}}";
        NodeOptions opts = NodeOptions.parse(mapper.readTree(json));

        assertThat(opts.getFormUserField()).isNull();
        assertThat(opts.getExternalResolver()).isNull();
    }
}
