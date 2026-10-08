package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.task.AssigneeResolverRegistry;
import com.workflow.engine.task.AssigneeResolverRegistry.ResolverMeta;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 选人函数清单 Controller（设计器面板下拉数据源）。
 *
 * <p>返回业务系统注册的全部选人函数元数据（注册名 / 中文名 / 描述 / 参数声明），
 * 对齐 NodeJS 引擎 GET /api/v1/assignee-resolvers。
 */
@RestController
@RequestMapping("/api/v1/assignee-resolvers")
public class AssigneeResolverController {

    private final AssigneeResolverRegistry assigneeResolverRegistry;

    public AssigneeResolverController(AssigneeResolverRegistry assigneeResolverRegistry) {
        this.assigneeResolverRegistry = assigneeResolverRegistry;
    }

    /** 选人函数元数据清单（含内置样例与业务系统注册的扩展函数），按注册名排序。 */
    @GetMapping
    public R<List<ResolverMeta>> list() {
        return R.ok(assigneeResolverRegistry.metadata());
    }
}
