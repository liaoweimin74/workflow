package com.workflow.engine.logic.executor;

import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class HttpLogicExecutorTest {

    private RestClient.Builder restClientBuilder;
    private MockRestServiceServer mockServer;
    private HttpLogicExecutor executor;

    @BeforeEach
    void setUp() {
        restClientBuilder = RestClient.builder();
        // 必须在 executor 通过该 builder 构建 RestClient 之前完成绑定。
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        executor = new HttpLogicExecutor(restClientBuilder, new VariableResolver());
    }

    @Test
    void get_withQueryMappings() {
        mockServer.expect(requestTo("http://example.com/api?page=1&size=10"))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withSuccess("{\"result\":\"ok\"}", MediaType.APPLICATION_JSON));

        List<ParamMapping> query = List.of(
                new ParamMapping("page", "page"),
                new ParamMapping("size", "size"));
        Object result = executor.execute("http://example.com/api", "GET", Map.of(),
                query, List.of(), Map.of("page", "1", "size", "10"), 0, 0, 0);

        mockServer.verify();
        assertEquals("{\"result\":\"ok\"}", result);
    }

    @Test
    void post_withBodyMappings() {
        mockServer.expect(requestTo("http://example.com/api"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"name\":\"Alice\",\"role\":\"admin\"}"))
                .andRespond(withSuccess("{\"id\":42}", MediaType.APPLICATION_JSON));

        List<ParamMapping> body = List.of(
                new ParamMapping("name", "name"),
                new ParamMapping("role", "role"));
        Object result = executor.execute("http://example.com/api", "POST", Map.of(),
                List.of(), body, Map.of("name", "Alice", "role", "admin"), 0, 0, 0);

        mockServer.verify();
        assertEquals("{\"id\":42}", result);
    }

    @Test
    void headerPlaceholderSubstitution() {
        mockServer.expect(requestTo("http://example.com/api"))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer my-token-123"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        Map<String, String> headers = Map.of("Authorization", "Bearer {{ token }}");
        Object result = executor.execute("http://example.com/api", "GET", headers,
                List.of(), List.of(), Map.of("token", "my-token-123"), 0, 0, 0);

        mockServer.verify();
        assertEquals("ok", result);
    }

    @Test
    void retryOnNetworkFailure() {
        mockServer.expect(requestTo("http://example.com/api"))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withServerError());
        mockServer.expect(requestTo("http://example.com/api"))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withSuccess("retried-ok", MediaType.TEXT_PLAIN));

        Object result = executor.execute("http://example.com/api", "GET", Map.of(),
                List.of(), List.of(), Map.of(), 0, 0, 1);

        mockServer.verify();
        assertEquals("retried-ok", result);
    }

    @Test
    void variableResolver_replacesPlaceholders() {
        VariableResolver resolver = new VariableResolver();
        String result = resolver.resolve("Hello {{ name }}!", Map.of("name", "World"));
        assertEquals("Hello World!", result);
    }

    @Test
    void variableResolver_missingVariableIsEmpty() {
        VariableResolver resolver = new VariableResolver();
        String result = resolver.resolve("Hello {{ name }}!", Map.of());
        assertEquals("Hello !", result);
    }

    @Test
    void variableResolver_noPlaceholders() {
        VariableResolver resolver = new VariableResolver();
        String result = resolver.resolve("Hello World!", Map.of("name", "test"));
        assertEquals("Hello World!", result);
    }

    @Test
    void paramMapping_record() {
        ParamMapping pm = new ParamMapping("src", "tgt");
        assertEquals("src", pm.source());
        assertEquals("tgt", pm.target());
    }
}
