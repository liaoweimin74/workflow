package com.workflow.ai.exception;

/**
 * AI 调用异常。
 */
public class AiException extends RuntimeException {

    /** 错误类型。 */
    public enum Code {
        /** 未配置 AI 服务。 */
        CONFIG_MISSING,
        /** 连接失败。 */
        CONNECT_FAILED,
        /** 超时。 */
        TIMEOUT,
        /** HTTP 非 2xx。 */
        HTTP_ERROR,
        /** 空响应。 */
        EMPTY_RESPONSE,
        /** 流式错误。 */
        STREAM_ERROR
    }

    private final Code code;
    private final Integer httpStatus;

    public AiException(Code code, String msg) {
        this(code, msg, null, null);
    }

    public AiException(Code code, String msg, Throwable cause) {
        this(code, msg, null, cause);
    }

    public AiException(Code code, String msg, Integer httpStatus) {
        this(code, msg, httpStatus, null);
    }

    public AiException(Code code, String msg, Integer httpStatus, Throwable cause) {
        super(msg, cause);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public Code getCode() { return code; }

    public Integer getHttpStatus() { return httpStatus; }
}
