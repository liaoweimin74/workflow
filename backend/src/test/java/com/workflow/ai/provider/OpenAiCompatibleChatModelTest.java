package com.workflow.ai.provider;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.config.AiProperties;
import com.workflow.ai.exception.AiException;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatOptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * OpenAiCompatibleChatModel 非流式/流式测试。
 */
class OpenAiCompatibleChatModelTest {

    private MockRestServiceServer server;
    private OpenAiCompatibleChatModel model;

    private static final String URL = "http://localhost/chat/completions";

    @BeforeEach
    void setUp() {
        AiProperties props = new AiProperties();
        props.setBaseUrl("http://localhost");
        props.setModel("test-model");
        RestClient.Builder builder = RestClient.builder().baseUrl("http://localhost");
        server = MockRestServiceServer.bindTo(builder).build();
        model = new OpenAiCompatibleChatModel(builder.build(), new ObjectMapper(), props);
    }

    @Test
    void complete_parsesContent() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"content\":\"hi\"}}]}", MediaType.APPLICATION_JSON));

        String result = model.complete(List.of(ChatMessage.user("hello")), ChatOptions.defaults());

        assertThat(result).isEqualTo("hi");
        server.verify();
    }

    @Test
    void complete_emptyChoices_throwsEmptyResponse() {
        server.expect(requestTo(URL))
                .andRespond(withSuccess("{\"choices\":[]}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> model.complete(List.of(ChatMessage.user("x")), ChatOptions.defaults()))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.EMPTY_RESPONSE);
    }

    @Test
    void complete_retriesOnceOn429() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(URL))
                .andRespond(withSuccess("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}", MediaType.APPLICATION_JSON));

        String result = model.complete(List.of(ChatMessage.user("x")), ChatOptions.defaults());

        assertThat(result).isEqualTo("ok");
        server.verify();
    }

    @Test
    void complete_httpErrorAfterRetry() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> model.complete(List.of(ChatMessage.user("x")), ChatOptions.defaults()))
                .isInstanceOf(AiException.class)
                .extracting(e -> ((AiException) e).getCode())
                .isEqualTo(AiException.Code.HTTP_ERROR);
    }

    @Test
    void completeStream_accumulatesDeltas_skipsBadLines() {
        String sse = "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n"
                + "event: ping\n\n"
                + "data: not-json\n\n"
                + "data: {\"choices\":[{\"delta\":{}}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\n"
                + "data: [DONE]\n\n";
        server.expect(requestTo(URL)).andRespond(withSuccess(sse, MediaType.TEXT_EVENT_STREAM));

        List<String> deltas = new ArrayList<>();
        AtomicReference<Boolean> done = new AtomicReference<>(false);
        AtomicReference<AiException> error = new AtomicReference<>();

        model.completeStream(List.of(ChatMessage.user("x")), ChatOptions.streaming(),
                deltas::add, d -> done.set(true), error::set);

        assertThat(deltas).containsExactly("你", "好");
        assertThat(done.get()).isTrue();
        assertThat(error.get()).isNull();
        server.verify();
    }

    @Test
    void completeStream_httpErrorInvokesOnError() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        AtomicReference<AiException> error = new AtomicReference<>();

        model.completeStream(List.of(ChatMessage.user("x")), ChatOptions.streaming(),
                d -> { }, d -> { }, error::set);

        assertThat(error.get()).isNotNull();
    }
}
