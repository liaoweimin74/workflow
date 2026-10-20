package com.workflow.api.dto;

import com.workflow.engine.datasource.scope.DataScopeAction;

import java.util.List;
import java.util.Map;

/**
 * 数据范围生效预览：某主体在某数据源某动作上命中了哪些规则、最终按哪条收紧。
 *
 * <p>只读诊断用（管理员）。条件由 {@code DataScopeService.conditionFor} 现算，
 * 与真实施加路径同一实现，保证「预览所见 = 运行所得」。
 */
public class DataScopeEffectiveVO {

    private String dataSourceId;
    private DataScopeAction action;
    private Long userId;
    private String username;

    /** 该主体可命中的全部范围主体（ROLE:x / USER:id / ORG:id / MEMBER_GROUP:id）。 */
    private List<String> subjects;

    /** 命中的全部规则（含被更宽规则覆盖的那些），供解释「为什么不是这条」。 */
    private List<DataScopeDTO> matchedRules;

    /** 最终生效的规则；null 表示不受限。 */
    private DataScopeDTO effectiveRule;

    /** true = 该主体在此数据源此动作上无行级限制（无命中、命中 ALL、或管理员）。 */
    private boolean unrestricted;

    /** 实际叠加到查询上的列 → 值条件；不受限为空 Map。 */
    private Map<String, Object> condition;

    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
    public DataScopeAction getAction() { return action; }
    public void setAction(DataScopeAction action) { this.action = action; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public List<String> getSubjects() { return subjects; }
    public void setSubjects(List<String> subjects) { this.subjects = subjects; }
    public List<DataScopeDTO> getMatchedRules() { return matchedRules; }
    public void setMatchedRules(List<DataScopeDTO> matchedRules) { this.matchedRules = matchedRules; }
    public DataScopeDTO getEffectiveRule() { return effectiveRule; }
    public void setEffectiveRule(DataScopeDTO effectiveRule) { this.effectiveRule = effectiveRule; }
    public boolean isUnrestricted() { return unrestricted; }
    public void setUnrestricted(boolean unrestricted) { this.unrestricted = unrestricted; }
    public Map<String, Object> getCondition() { return condition; }
    public void setCondition(Map<String, Object> condition) { this.condition = condition; }
}
