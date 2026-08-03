package com.workflow.engine.logic.executor;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class HttpLogicExecutor {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final VariableResolver variableResolver;

    public HttpLogicExecutor(RestClient.Builder restClientBuilder, VariableResolver variableResolver) {
        this(restClientBuilder, variableResolver, new ObjectMapper());
    }

    public HttpLogicExecutor(RestClient.Builder restClientBuilder, VariableResolver variableResolver, ObjectMapper objectMapper) {
        this.restClient = restClientBuilder.build();
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
    }

    public HttpLogicExecutor(RestClient restClient, VariableResolver variableResolver, ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
    }

    public Object execute(String url, String method, Map<String, String> headers,
                          List<ParamMapping> query, List<ParamMapping> body,
                          Map<String, Object> vars, int connectTimeoutMs, int readTimeoutMs, int retryCount) {

        RestClient client = restClient;

        if (connectTimeoutMs > 0 || readTimeoutMs > 0) {
            HttpClient.Builder httpClientBuilder = HttpClient.newBuilder();
            if (connectTimeoutMs > 0) {
                httpClientBuilder.connectTimeout(Duration.ofMillis(connectTimeoutMs));
            }
            HttpClient httpClient = httpClientBuilder.build();
            JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
            if (readTimeoutMs > 0) {
                requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
            }
            client = restClient.mutate().requestFactory(requestFactory).build();
        }

        Exception lastException = null;
        int attempts = 1 + Math.max(0, retryCount);

        for (int i = 0; i < attempts; i++) {
            try {
                return doExecute(client, url, method, headers, query, body, vars);
            } catch (Exception e) {
                lastException = e;
                if (i < attempts - 1) {
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("Retry interrupted", ie);
                    }
                }
            }
        }
        throw new RuntimeException("HTTP request failed after " + attempts + " attempts", lastException);
    }

    private Object doExecute(RestClient client, String url, String method,
                             Map<String, String> headers, List<ParamMapping> query, List<ParamMapping> body,
                             Map<String, Object> vars) {

        RestClient.RequestBodyUriSpec spec = client.method(HttpMethod.valueOf(method.toUpperCase()));

        String resolvedUrl = variableResolver.resolve(url, vars);
        String queryString = buildQueryString(query, vars);
        String fullUrl = queryString.isEmpty() ? resolvedUrl
                : resolvedUrl + (resolvedUrl.contains("?") ? "&" : "?") + queryString;
        spec.uri(URI.create(fullUrl));

        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                String resolvedValue = variableResolver.resolve(entry.getValue(), vars);
                spec.header(entry.getKey(), resolvedValue);
            }
        }

        if (body != null && !body.isEmpty()) {
            String jsonBody = buildJsonBody(body, vars);
            spec.contentType(MediaType.APPLICATION_JSON);
            spec.body(jsonBody);
        }

        return spec.retrieve().body(String.class);
    }

    private String buildQueryString(List<ParamMapping> query, Map<String, Object> vars) {
        if (query == null || query.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (ParamMapping pm : query) {
            Object value = resolveSource(pm, vars);
            if (sb.length() > 0) sb.append("&");
            sb.append(pm.target()).append("=").append(value != null ? value.toString() : "");
        }
        return sb.toString();
    }

    private String buildJsonBody(List<ParamMapping> body, Map<String, Object> vars) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            for (ParamMapping pm : body) {
                map.put(pm.target(), resolveSource(pm, vars));
            }
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize body", e);
        }
    }

    private Object resolveSource(ParamMapping pm, Map<String, Object> vars) {
        String resolved = variableResolver.resolve(pm.source(), vars);
        Object raw = vars.get(resolved);
        return raw != null ? raw : resolved;
    }
}