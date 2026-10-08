package com.workflow.engine.logic.executor;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * HTTP 后端逻辑执行器（RestClient + 出站 host 白名单 SSRF 防护）。
 *
 * <p>白名单语义（Task 2 契约）：
 * <ul>
 *   <li>构造参数 {@code List<String> allowedHosts}（支持精确主机与 {@code *.example.com}
 *       后缀通配，大小写不敏感）；</li>
 *   <li>白名单非空且目标 host 不匹配 → 抛 {@link BusinessException}
 *       {@code HTTP_LOGIC_HOST_NOT_ALLOWED: <host>}；</li>
 *   <li>白名单为空 → 放行全部，但首次使用时 WARN 一次（提示生产环境收紧）；</li>
 *   <li>校验在变量占位符替换之后、真正发请求之前执行（防 {{var}} 注入任意主机）。</li>
 * </ul>
 *
 * <p>存量构造器保留：委托空白名单（即放行 + WARN 一次）。
 */
public class HttpLogicExecutor {

    private static final Logger log = LoggerFactory.getLogger(HttpLogicExecutor.class);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final VariableResolver variableResolver;
    /** 出站 URL 主机白名单（已归一化为小写）；空列表 = 不限制（兼容存量，首次放行时 WARN）。 */
    private final List<String> allowedHosts;
    private final AtomicBoolean emptyWhitelistWarned = new AtomicBoolean(false);

    public HttpLogicExecutor(RestClient.Builder restClientBuilder, VariableResolver variableResolver) {
        this(restClientBuilder, variableResolver, new ObjectMapper(), List.of());
    }

    public HttpLogicExecutor(RestClient.Builder restClientBuilder, VariableResolver variableResolver,
                             ObjectMapper objectMapper) {
        this(restClientBuilder, variableResolver, objectMapper, List.of());
    }

    /** 全参构造：白名单由 FlowableEngineConfig 经 @Value("${workflow.logic.http.allowed-hosts:}") 注入。 */
    public HttpLogicExecutor(RestClient.Builder restClientBuilder, VariableResolver variableResolver,
                             ObjectMapper objectMapper, List<String> allowedHosts) {
        this(restClientBuilder.build(), variableResolver, objectMapper, allowedHosts);
    }

    public HttpLogicExecutor(RestClient restClient, VariableResolver variableResolver, ObjectMapper objectMapper) {
        this(restClient, variableResolver, objectMapper, List.of());
    }

    public HttpLogicExecutor(RestClient restClient, VariableResolver variableResolver,
                             ObjectMapper objectMapper, List<String> allowedHosts) {
        this.restClient = restClient;
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
        this.allowedHosts = normalize(allowedHosts);
    }

    /** 归一化：trim + 小写 + 去空项。 */
    private static List<String> normalize(List<String> hosts) {
        if (hosts == null || hosts.isEmpty()) {
            return List.of();
        }
        List<String> normalized = new ArrayList<>();
        for (String host : hosts) {
            if (host == null) {
                continue;
            }
            String trimmed = host.trim().toLowerCase(Locale.ROOT);
            if (!trimmed.isEmpty()) {
                normalized.add(trimmed);
            }
        }
        return List.copyOf(normalized);
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
            } catch (ResourceAccessException e) {
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
        // SSRF 防护：占位符替换后、发请求前校验目标主机白名单
        checkHostAllowed(fullUrl);
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

    /**
     * host 白名单校验：白名单非空且不匹配（精确 + {@code *.suffix} 后缀通配，大小写不敏感）
     * → BusinessException(HTTP_LOGIC_HOST_NOT_ALLOWED)；白名单空 → 放行但首次 WARN 一次。
     */
    private void checkHostAllowed(String fullUrl) {
        URI uri = URI.create(fullUrl);
        String host = uri.getHost();
        String normalizedHost = host == null ? "" : host.toLowerCase(Locale.ROOT);

        if (allowedHosts.isEmpty()) {
            if (emptyWhitelistWarned.compareAndSet(false, true)) {
                log.warn("workflow.logic.http.allowed-hosts 未配置，HTTP 逻辑出站请求暂不受白名单限制"
                        + "（host={}），生产环境建议收紧为 api.example.com,*.example.com 形式", normalizedHost);
            }
            return;
        }
        if (allowedHosts.contains("*")) {
            return;
        }
        if (normalizedHost.isEmpty()) {
            throw new BusinessException("HTTP_LOGIC_HOST_NOT_ALLOWED: " + fullUrl);
        }
        if (allowedHosts.contains(normalizedHost)) {
            return;
        }
        for (String entry : allowedHosts) {
            if (entry.startsWith("*.") && (normalizedHost.endsWith(entry.substring(1))
                    || normalizedHost.equals(entry.substring(2)))) {
                return;
            }
        }
        throw new BusinessException("HTTP_LOGIC_HOST_NOT_ALLOWED: " + normalizedHost);
    }

    private String buildQueryString(List<ParamMapping> query, Map<String, Object> vars) {
        if (query == null || query.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (ParamMapping pm : query) {
            Object value = resolveSource(pm, vars);
            if (sb.length() > 0) sb.append("&");
            sb.append(URLEncoder.encode(pm.target(), StandardCharsets.UTF_8))
              .append("=")
              .append(URLEncoder.encode(value != null ? value.toString() : "", StandardCharsets.UTF_8));
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
        Object value = vars.get(pm.source());
        return value != null ? value : "";
    }
}
