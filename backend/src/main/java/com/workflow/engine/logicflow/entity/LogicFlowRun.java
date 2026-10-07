package com.workflow.engine.logicflow.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 逻辑流运行历史实体：每次 POST /{id}/run 落一条，用于运行历史回看与排障。
 *
 * <p>input/output/traces 均为 JSON 列；errorMessage 用 TEXT 容纳完整堆栈信息；
 * status 只有 SUCCESS | FAILED 两态（节点级失败明细在 tracesJson）。
 */
@Entity
@Table(name = "wf_logic_flow_run",
       indexes = {
               @Index(name = "idx_lfr_flow_id", columnList = "flow_id"),
               @Index(name = "idx_lfr_flow_key", columnList = "flow_key"),
               @Index(name = "idx_lfr_flow_name", columnList = "flow_name")
       })
public class LogicFlowRun {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "flow_id", length = 64, nullable = false)
    private String flowId;

    @Column(name = "flow_key", length = 64, nullable = false)
    private String flowKey;

    @Column(name = "flow_name", length = 128)
    private String flowName;

    /** 运行结果：SUCCESS | FAILED。 */
    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "input_json", columnDefinition = "JSON")
    private String inputJson;

    @Column(name = "output_json", columnDefinition = "JSON")
    private String outputJson;

    @Column(name = "traces_json", columnDefinition = "JSON")
    private String tracesJson;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getFlowId() { return flowId; }
    public void setFlowId(String flowId) { this.flowId = flowId; }

    public String getFlowKey() { return flowKey; }
    public void setFlowKey(String flowKey) { this.flowKey = flowKey; }

    public String getFlowName() { return flowName; }
    public void setFlowName(String flowName) { this.flowName = flowName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getInputJson() { return inputJson; }
    public void setInputJson(String inputJson) { this.inputJson = inputJson; }

    public String getOutputJson() { return outputJson; }
    public void setOutputJson(String outputJson) { this.outputJson = outputJson; }

    public String getTracesJson() { return tracesJson; }
    public void setTracesJson(String tracesJson) { this.tracesJson = tracesJson; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public long getDurationMs() { return durationMs; }
    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }

    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
