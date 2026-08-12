package com.workflow.api.dto;

/**
 * 节点操作权限配置。
 *
 * <p>控制任务详情页操作按钮的显示。由 {@code extractOperations} 按"流程级 AND 节点级"规则解析，
 * 缺失字段用默认值补全。
 */
public class OperationsConfig {

    /** 是否允许驳回，默认 true */
    private boolean allowReject = true;
    /** 是否允许加签，默认 false */
    private boolean allowAddSign = false;
    /** 是否允许转办，默认 true */
    private boolean allowTransfer = true;
    /** 是否允许委派，默认 false */
    private boolean allowDelegate = false;

    public boolean isAllowReject() { return allowReject; }
    public void setAllowReject(boolean allowReject) { this.allowReject = allowReject; }

    public boolean isAllowAddSign() { return allowAddSign; }
    public void setAllowAddSign(boolean allowAddSign) { this.allowAddSign = allowAddSign; }

    public boolean isAllowTransfer() { return allowTransfer; }
    public void setAllowTransfer(boolean allowTransfer) { this.allowTransfer = allowTransfer; }

    public boolean isAllowDelegate() { return allowDelegate; }
    public void setAllowDelegate(boolean allowDelegate) { this.allowDelegate = allowDelegate; }
}
