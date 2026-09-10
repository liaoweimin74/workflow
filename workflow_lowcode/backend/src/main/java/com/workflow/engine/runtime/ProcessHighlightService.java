package com.workflow.engine.runtime;

import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricActivityInstanceQuery;
import org.flowable.engine.runtime.ActivityInstance;
import org.flowable.engine.runtime.ActivityInstanceQuery;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 流程图高亮服务。
 *
 * <p>返回流程实例中已完成节点和当前活动节点列表，供前端流程图高亮渲染。
 * 已完成节点：从 HistoricActivityInstance 查询 endTime 非空的记录。
 * 当前活动节点：从 RuntimeService.getActivityInstances 获取。
 */
@Service
public class ProcessHighlightService {

    private static final Logger log = LoggerFactory.getLogger(ProcessHighlightService.class);

    private final RuntimeService runtimeService;
    private final HistoryService historyService;
    private final RepositoryService repositoryService;

    public ProcessHighlightService(RuntimeService runtimeService,
                                   HistoryService historyService,
                                   RepositoryService repositoryService) {
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.repositoryService = repositoryService;
    }

    /**
     * 获取流程图高亮数据。
     *
     * @param processInstanceId 流程实例 ID
     * @return Map 包含 completedActivityIds（已完成节点）和 activeActivityIds（当前活动节点）
     */
    public Map<String, Object> getHighlight(String processInstanceId) {
        List<String> completedActivityIds = new ArrayList<>();
        List<String> activeActivityIds = new ArrayList<>();

        // 查询历史活动节点
        List<HistoricActivityInstance> historicActivities = historyService
                .createHistoricActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .orderByHistoricActivityInstanceStartTime()
                .asc()
                .list();

        for (HistoricActivityInstance activity : historicActivities) {
            if (activity.getEndTime() != null) {
                completedActivityIds.add(activity.getActivityId());
            }
        }

        // 查询当前活动节点
        List<ActivityInstance> runtimeActivities = runtimeService.createActivityInstanceQuery()
                .processInstanceId(processInstanceId)
                .list();
        if (runtimeActivities != null) {
            for (ActivityInstance activity : runtimeActivities) {
                String activityId = activity.getActivityId();
                if (!activeActivityIds.contains(activityId)) {
                    activeActivityIds.add(activityId);
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("completedActivityIds", completedActivityIds);
        result.put("activeActivityIds", activeActivityIds);

        log.debug("流程图高亮 pi={} completed={} active={}",
                processInstanceId, completedActivityIds, activeActivityIds);

        return result;
    }
}
