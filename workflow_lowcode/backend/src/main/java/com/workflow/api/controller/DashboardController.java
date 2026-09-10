package com.workflow.api.controller;

import com.workflow.common.domain.R;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 首页数据看板统计接口。
 *
 * <p>聚合 Flowable 引擎的实时查询，为前端工作流总览页提供：
 * 我的待办 / 我的已办 / 进行中流程 / 已部署流程定义 四项 KPI，
 * 近 7 日发起流程趋势，以及流程状态占比（进行中 vs 已完成）。
 */
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    private final TaskService taskService;
    private final HistoryService historyService;
    private final RuntimeService runtimeService;
    private final RepositoryService repositoryService;

    public DashboardController(TaskService taskService,
                               HistoryService historyService,
                               RuntimeService runtimeService,
                               RepositoryService repositoryService) {
        this.taskService = taskService;
        this.historyService = historyService;
        this.runtimeService = runtimeService;
        this.repositoryService = repositoryService;
    }

    /**
     * 看板统计。
     *
     * @param userId 当前用户 ID（用于「我的待办 / 我的已办」统计；缺省时两项为 0）
     */
    @GetMapping("/stats")
    public R<Map<String, Object>> stats(@RequestParam(required = false) String userId) {
        Map<String, Object> result = new LinkedHashMap<>();

        // ── KPI ──
        long todoCount = (userId == null || userId.isBlank())
                ? 0
                : taskService.createTaskQuery().taskAssignee(userId).active().count();
        long doneCount = (userId == null || userId.isBlank())
                ? 0
                : historyService.createHistoricTaskInstanceQuery()
                        .taskAssignee(userId).finished().count();
        long runningCount = runtimeService.createProcessInstanceQuery().count();
        ProcessDefinitionQuery defQuery = repositoryService.createProcessDefinitionQuery().latestVersion();
        long definitionCount = defQuery.count();
        long startedByMeCount = (userId == null || userId.isBlank())
                ? 0
                : historyService.createHistoricProcessInstanceQuery().startedBy(userId).count();

        result.put("todoCount", todoCount);
        result.put("doneCount", doneCount);
        result.put("runningCount", runningCount);
        result.put("definitionCount", definitionCount);
        result.put("startedByMeCount", startedByMeCount);

        // ── 近 7 日发起流程趋势 ──
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> trend = new ArrayList<>(7);
        for (int i = 6; i >= 0; i--) {
            LocalDate day = today.minusDays(i);
            Date dayStart = Date.from(day.atStartOfDay(ZoneId.systemDefault()).toInstant());
            Date dayEnd = Date.from(day.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant());
            long count = historyService.createHistoricProcessInstanceQuery()
                    .startedAfter(dayStart).startedBefore(dayEnd).count();
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", day.getMonthValue() + "/" + day.getDayOfMonth());
            point.put("count", count);
            trend.add(point);
        }
        result.put("trend", trend);

        // ── 状态占比（进行中 / 已完成） ──
        HistoricProcessInstanceQuery historicAll = historyService.createHistoricProcessInstanceQuery();
        long finishedTotal = historicAll.finished().count();
        long startedTotal = historicAll.count();
        long runningTotal = Math.max(startedTotal - finishedTotal, runningCount);
        Map<String, Object> share = new LinkedHashMap<>();
        share.put("running", runningTotal);
        share.put("finished", finishedTotal);
        result.put("statusShare", share);

        return R.ok(result);
    }
}
