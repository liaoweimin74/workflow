package com.workflow.engine.logic.config;

import com.workflow.engine.logic.parse.ParamMapping;

import java.util.List;
import java.util.Map;

/**
 * 后端业务逻辑 - HTTP 调用子配置。
 * 对应前端 {@code BackendLogicHttpConfig}。
 */
public class BackendLogicHttpConfig {

    private String url;
    private String method;
    private Map<String, String> headers;
    private List<ParamMapping> queryParams;
    private List<ParamMapping> bodyParams;
    private int connTimeoutMs = 3000;
    private int readTimeoutMs = 5000;
    private int retryCount = 0;

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public Map<String, String> getHeaders() { return headers; }
    public void setHeaders(Map<String, String> headers) { this.headers = headers; }

    public List<ParamMapping> getQueryParams() { return queryParams; }
    public void setQueryParams(List<ParamMapping> queryParams) { this.queryParams = queryParams; }

    public List<ParamMapping> getBodyParams() { return bodyParams; }
    public void setBodyParams(List<ParamMapping> bodyParams) { this.bodyParams = bodyParams; }

    public int getConnTimeoutMs() { return connTimeoutMs; }
    public void setConnTimeoutMs(int connTimeoutMs) { this.connTimeoutMs = connTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }

    public int getRetryCount() { return retryCount; }
    public void setRetryCount(int retryCount) { this.retryCount = retryCount; }
}